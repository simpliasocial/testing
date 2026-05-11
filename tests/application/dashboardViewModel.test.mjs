import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const {
    buildRecentAppointments,
    buildHistoricalFunnelMetrics,
    buildChannelData,
    buildLabelDistribution,
    collectConversationLabelSet,
    calculateFirstResponseMetrics,
    buildOwnerPerformance,
    buildOperationalMetrics,
    createEmptyDashboardData,
    hasUnansweredCustomerMessage,
    resolveConversationOwner,
    resolveDashboardDateRange,
    resolveDashboardFiltersInput,
} = jiti("../../src/application/dashboard/index.ts");

const test = (name, fn) => {
    try {
        fn();
        console.log(`ok - ${name}`);
    } catch (error) {
        console.error(`not ok - ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
};

test("resolveDashboardFiltersInput turns a month into a calendar range", () => {
    const filters = resolveDashboardFiltersInput(new Date(2026, 4, 15));

    assert.equal(filters.startDate.toISOString().slice(0, 10), "2026-05-01");
    assert.equal(filters.endDate.toISOString().slice(0, 10), "2026-05-31");
});

test("resolveDashboardDateRange normalizes full-day boundaries", () => {
    const { start, end } = resolveDashboardDateRange({
        startDate: new Date("2026-05-07T16:30:00.000Z"),
        endDate: new Date("2026-05-08T02:15:00.000Z"),
    });

    assert.equal(start.getHours(), 0);
    assert.equal(start.getMinutes(), 0);
    assert.equal(end.getHours(), 23);
    assert.equal(end.getMinutes(), 59);
});

test("createEmptyDashboardData preserves expected nested defaults", () => {
    const data = createEmptyDashboardData();

    assert.equal(data.kpis.totalLeads, 0);
    assert.equal(data.operationalMetrics.firstResponseGraceSeconds, 60);
    assert.equal(data.humanMetrics.humanAppointmentMode, "estimated_legacy");
    assert.deepEqual(data.recentAppointments, []);
});

test("buildRecentAppointments maps appointment and sale conversations", () => {
    const appointments = buildRecentAppointments([
        {
            id: 10,
            resolvedStage: "sql",
            resolvedAttrs: { nombre_completo: "SQL Lead" },
        },
        {
            id: 11,
            resolvedStage: "appointment",
            resolvedAttrs: {
                nombre_completo: "Ana Cliente",
                celular: "0999999999",
                agencia: "Quito",
                fecha_visita: "2026-05-10",
                hora_visita: "09:30",
            },
            created_at: 1778400000,
            timestamp: 1778403600,
        },
        {
            id: 12,
            resolvedStage: "sale",
            resolvedAttrs: {},
            meta: { sender: { name: "Venta Cerrada", phone_number: "0988888888" } },
        },
    ]);

    assert.equal(appointments.length, 2);
    assert.equal(appointments[0].name, "Ana Cliente");
    assert.equal(appointments[0].status, "Confirmado");
    assert.equal(appointments[1].name, "Venta Cerrada");
    assert.equal(appointments[1].status, "Finalizado");
});

test("buildLabelDistribution counts resolved labels in filtered conversations", () => {
    const allLabels = collectConversationLabelSet([
        { resolvedLabels: ["interesado", "cita_agendada"] },
        { resolvedLabels: ["interesado"] },
    ]);

    const distribution = buildLabelDistribution(allLabels, [
        { resolvedLabels: ["interesado"] },
        { resolvedLabels: ["interesado", "cita_agendada"] },
    ]);

    assert.equal(distribution[0].key, "interesado");
    assert.equal(distribution[0].value, 2);
    assert.equal(distribution[1].key, "cita_agendada");
    assert.equal(distribution[1].value, 1);
});

test("buildHistoricalFunnelMetrics cascades sale into appointment and sql", () => {
    const metrics = buildHistoricalFunnelMetrics(
        [
            { resolvedLabels: ["venta_exitosa"], resolvedStage: "sale" },
            { resolvedLabels: ["cita_agendada"], resolvedStage: "appointment" },
            { resolvedLabels: ["interesado"], resolvedStage: "sql" },
        ],
        {
            saleTags: ["venta_exitosa"],
            appointmentTags: ["cita_agendada"],
            sqlTags: ["interesado"],
        },
        (conversation) => conversation.resolvedStage === "sale",
    );

    assert.equal(metrics.saleCount, 1);
    assert.equal(metrics.appointmentCount, 2);
    assert.equal(metrics.sqlCount, 3);
});

test("calculateFirstResponseMetrics applies grace seconds and median", () => {
    const metrics = calculateFirstResponseMetrics([
        { created_at: 1000, first_reply_created_at: 1120 },
        { created_at: 2000, first_reply_created_at: 2300 },
    ], 60);

    assert.equal(metrics.firstResponseRawAverageSeconds, 210);
    assert.equal(metrics.firstResponseAverageSeconds, 150);
    assert.equal(metrics.firstResponseMedianSeconds, 150);
    assert.equal(metrics.firstResponseCount, 2);
    assert.equal(metrics.responseTimeMinutes, 3);
});

test("hasUnansweredCustomerMessage detects incoming last message", () => {
    assert.equal(hasUnansweredCustomerMessage({ waiting_since: 1778400000 }), true);
    assert.equal(hasUnansweredCustomerMessage({
        messages: [
            { message_direction: "outgoing", created_at: 1000 },
            { message_direction: "incoming", created_at: 1100 },
        ],
    }), true);
    assert.equal(hasUnansweredCustomerMessage({
        first_reply_created_at: 1200,
        messages: [
            { message_direction: "incoming", created_at: 1000 },
            { message_direction: "outgoing", created_at: 1100 },
        ],
    }), false);
});

test("buildChannelData counts leads by resolved channel name", () => {
    const channels = buildChannelData([
        { inbox_id: 1 },
        { inbox_id: 1 },
        { inbox_id: 2 },
    ], (conversation) => conversation.inbox_id === 1 ? "WhatsApp" : "Instagram");

    assert.deepEqual(channels, [
        { name: "WhatsApp", count: 2, percentage: 67 },
        { name: "Instagram", count: 1, percentage: 33 },
    ]);
});

test("resolveConversationOwner prioritizes manual responsable over assignee", () => {
    assert.deepEqual(resolveConversationOwner({
        resolvedAttrs: { responsable: "Maria" },
        meta: { assignee: { name: "Agente A" } },
    }), { name: "Maria", source: "responsable" });

    assert.deepEqual(resolveConversationOwner({
        resolvedAttrs: {},
        meta: { assignee: { name: "Agente A" } },
    }), { name: "Agente A", source: "agente" });

    assert.deepEqual(resolveConversationOwner({}), {
        name: "Sin responsable",
        source: "sin_asignar",
    });
});

test("buildOwnerPerformance keeps assigned agents while counting the effective owner", () => {
    const performance = buildOwnerPerformance([
        {
            resolvedStage: "appointment",
            resolvedAttrs: { responsable: "Maria" },
            meta: { assignee: { name: "Agente A" } },
            waiting_since: 1778403700,
        },
        {
            resolvedStage: "sql",
            resolvedAttrs: {},
            meta: { assignee: { name: "Agente B" } },
        },
        {
            resolvedStage: "prospect",
            resolvedAttrs: {},
            meta: {},
        },
    ], (conversation) => Boolean(conversation.waiting_since));

    const maria = performance.find((owner) => owner.name === "Maria");
    const agentA = performance.find((owner) => owner.name === "Agente A");
    const agentB = performance.find((owner) => owner.name === "Agente B");
    const unassigned = performance.find((owner) => owner.name === "Sin responsable");

    assert.equal(maria.leads, 1);
    assert.equal(maria.appointments, 1);
    assert.equal(maria.unanswered, 1);
    assert.equal(maria.winRate, 100);
    assert.equal(agentA.leads, 0);
    assert.equal(agentB.leads, 1);
    assert.equal(unassigned.leads, 1);
});

test("buildOperationalMetrics prioritizes manual responsable over assigned agent", () => {
    const firstResponseMetrics = calculateFirstResponseMetrics([
        { created_at: 1000, first_reply_created_at: 1060 },
    ], 60);

    const { ownerPerformance, operationalMetrics } = buildOperationalMetrics({
        conversations: [
            {
                id: 1,
                status: "open",
                resolvedStage: "appointment",
                resolvedLabels: ["seguimiento_humano", "cita_agendada"],
                labels: ["seguimiento_humano", "cita_agendada"],
                timestamp: 1778403600,
                created_at: 1778400000,
                inbox_id: 10,
                resolvedAttrs: { responsable: "Maria" },
                meta: { sender: { name: "Cliente Uno" }, assignee: { name: "Agente A" } },
                waiting_since: 1778403700,
            },
            {
                id: 2,
                status: "resolved",
                resolvedStage: "sql",
                resolvedLabels: [],
                labels: [],
                timestamp: 1778313600,
                created_at: 1778310000,
                inbox_id: 11,
                resolvedAttrs: {},
                meta: { sender: { name: "Cliente Dos" }, assignee: { name: "Agente B" } },
                first_reply_created_at: 1778310060,
            },
        ],
        firstResponseMetrics,
        firstResponseGraceSeconds: 60,
        followupQueueTags: ["seguimiento_humano"],
        salesQueueTags: ["cita_agendada"],
        resolveChannelName: (conversation) => conversation.inbox_id === 10 ? "WhatsApp" : "Instagram",
        resolveChannelType: (conversation) => conversation.inbox_id === 10 ? "Channel::Whatsapp" : "Channel::Instagram",
        getCreatedDate: (conversation) => new Date(Number(conversation.created_at) * 1000),
        hasUnansweredMessage: (conversation) => Boolean(conversation.waiting_since),
    });

    const maria = ownerPerformance.find((owner) => owner.name === "Maria");
    const agentA = ownerPerformance.find((owner) => owner.name === "Agente A");

    assert.equal(maria.leads, 1);
    assert.equal(maria.appointments, 1);
    assert.equal(maria.unanswered, 1);
    assert.equal(agentA.leads, 0);
    assert.equal(operationalMetrics.leadsWithOwnerCount, 2);
    assert.equal(operationalMetrics.leadsSinRespuesta, 1);
    assert.equal(operationalMetrics.followUpQueue.length, 1);
    assert.equal(operationalMetrics.scheduledAppointmentsQueue.length, 1);
    assert.equal(operationalMetrics.activeLeads.length, 1);
});
