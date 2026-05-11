import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const {
    calculateSalesTotal,
    filterQueueBySearch,
    filterSalesRows,
    getHumanFlowConfig,
    humanFlowConfigChanged,
    inferAttributeDefinitionsFromConversations,
    mergeAttributeDefinitions,
    normalizeAttributeDefinitions,
    serializeAppointmentFieldValue,
    validateAppointmentFieldValue,
} = jiti("../../src/features/followup/model/leadActionQueueModel.ts");
const {
    buildSalesReportData,
    resolveSalesExportFields,
} = jiti("../../src/features/followup/model/salesReportExportModel.ts");
const {
    buildLeadWorkflowAttributeState,
    resolveLeadWorkflowContactId,
} = jiti("../../src/features/followup/model/leadWorkflowModel.ts");

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

test("getHumanFlowConfig normalizes lists and falls back to defaults", () => {
    const config = getHumanFlowConfig(
        {
            humanFollowupQueueTags: [" seguimiento ", "seguimiento", ""],
            humanAppointmentTargetLabel: " cita_agendada ",
        },
        {
            humanSalesQueueTags: ["venta_pendiente"],
            humanSaleTargetLabel: "venta_exitosa",
            humanAppointmentFieldKeys: ["fecha_visita"],
            humanSaleFieldKeys: ["monto_operacion"],
        },
    );

    assert.deepEqual(config.humanFollowupQueueTags, ["seguimiento"]);
    assert.equal(config.humanAppointmentTargetLabel, "cita_agendada");
    assert.deepEqual(config.humanSalesQueueTags, ["venta_pendiente"]);
    assert.equal(config.humanSaleTargetLabel, "venta_exitosa");
    assert.deepEqual(config.humanAppointmentFieldKeys, ["fecha_visita"]);
    assert.deepEqual(config.humanSaleFieldKeys, ["monto_operacion"]);
});

test("humanFlowConfigChanged compares normalized list values", () => {
    const left = getHumanFlowConfig(
        { humanFollowupQueueTags: ["a", "a"], humanAppointmentTargetLabel: "cita" },
        {},
    );
    const right = getHumanFlowConfig(
        { humanFollowupQueueTags: ["a"], humanAppointmentTargetLabel: "cita" },
        {},
    );

    assert.equal(humanFlowConfigChanged(left, right), false);
    assert.equal(humanFlowConfigChanged({
        ...right,
        humanSaleTargetLabel: "venta",
    }, right), true);
});

test("filterQueueBySearch normalizes lead search values", () => {
    const rows = filterQueueBySearch([
        { id: 1, name: "María Cliente", phone: "099111222" },
        { id: 2, name: "Pedro", phone: "099333444" },
    ], "maria", (lead) => [lead.id, lead.name, lead.phone]);

    assert.deepEqual(rows.map((row) => row.id), [1]);
});

test("filterSalesRows applies sale label, inbox, dates, search and sorting", () => {
    const rows = filterSalesRows({
        leads: [
            {
                id: 1,
                labels: ["venta_exitosa"],
                inbox_id: 10,
                operationDate: "2026-05-02",
                name: "Ana",
            },
            {
                id: 2,
                labels: ["venta_exitosa"],
                inbox_id: 10,
                operationDate: "2026-05-04",
                name: "Maria",
            },
            {
                id: 3,
                labels: ["cita_agendada"],
                inbox_id: 10,
                operationDate: "2026-05-05",
                name: "Maria",
            },
            {
                id: 4,
                labels: ["venta_exitosa"],
                inbox_id: 11,
                operationDate: "2026-05-06",
                name: "Maria",
            },
        ],
        saleTargetLabel: "venta_exitosa",
        selectedInboxes: [10],
        startDate: "2026-05-01",
        endDate: "2026-05-05",
        search: "maria",
        getLabels: (lead) => lead.labels,
        getInboxId: (lead) => lead.inbox_id,
        getOperationDate: (lead) => lead.operationDate,
        getSearchValues: (lead) => [lead.id, lead.name],
    });

    assert.deepEqual(rows.map((row) => row.id), [2]);
});

test("calculateSalesTotal parses common currency formats", () => {
    const total = calculateSalesTotal([
        { amount: "15000" },
        { amount: "2000.50" },
        { amount: "" },
    ], (row) => row.amount);

    assert.equal(total, 17000.5);
});

test("buildSalesReportData prepares detail rows, summary and grouped sales", () => {
    const leads = [
        {
            id: 101,
            labels: ["venta_exitosa"],
            channel: "WhatsApp",
            created_at: 1778202000,
            timestamp: 1778288400,
            source: "api",
            account_id: 42,
            meta: {
                sender: { id: 9001 },
                assignee: { name: "Asesora Ana" },
            },
            attrs: {
                monto_operacion: "1500",
                fecha_monto_operacion: "2026-05-08",
                nombre_completo: "Cliente Uno",
            },
        },
        {
            id: 102,
            labels: ["venta_exitosa"],
            channel: "Instagram",
            source: "supabase",
            attrs: {
                monto_operacion: "$2,500.50",
                fecha_monto_operacion: "2026-05-09",
                responsable: "Asesor Luis",
            },
        },
    ];

    const report = buildSalesReportData({
        leads,
        activeFields: [
            "ID",
            "Nombre",
            "Canal",
            "Estados",
            "Monto",
            "Responsable",
            "ID Cuenta",
            "Origen Dato",
        ],
        generatedAt: "2026-05-08 09:30",
        salesStartDate: "2026-05-01",
        salesEndDate: "2026-05-31",
        salesSearch: "cliente",
        saleTargetLabel: "venta_exitosa",
        salesTotal: 4000.5,
        getAttrs: (lead) => lead.attrs || {},
        getChannelName: (lead) => lead.channel,
        getChatwootUrl: (id) => `https://chatwoot.test/${id}`,
        getLeadName: (lead) => lead.attrs?.nombre_completo || `Lead ${lead.id}`,
        getLeadPhone: () => "",
        getLeadEmail: () => "",
        getLeadExternalUrl: () => "",
        getLeadOperationDate: (lead) => lead.attrs?.fecha_monto_operacion || "",
        formatDateTime: (value) => `formatted:${value}`,
    });

    assert.equal(report.summaryRows.find(([label]) => label === "Estado de venta usado")[1], "Venta exitosa");
    assert.equal(report.summaryRows.find(([label]) => label === "Ticket promedio")[1], 2000.25);
    assert.deepEqual(report.byChannelRows, [
        { canal: "WhatsApp", ventas: 1, monto: 1500 },
        { canal: "Instagram", ventas: 1, monto: 2500.5 },
    ]);
    assert.deepEqual(report.byMonthRows, [
        { periodo: "2026-05", ventas: 2, monto: 4000.5 },
    ]);
    assert.equal(report.detailRows[0].Estados, "Venta exitosa");
    assert.equal(report.detailRows[0]["Monto de la operación"], "1500");
    assert.equal(report.detailRows[0].Responsable, "Asesora Ana");
    assert.equal(report.detailRows[0]["ID de cuenta"], 42);
    assert.equal(report.detailRows[0]["Monto numérico"], 1500);
    assert.equal(report.detailRows[1].Responsable, "Asesor Luis");
});

test("resolveSalesExportFields falls back to the operational default columns", () => {
    assert.deepEqual(resolveSalesExportFields([]), [
        "ID",
        "Nombre",
        "Telefono",
        "Canal",
        "Estados",
        "Correo",
        "Enlace de conversación",
        "Fecha Ingreso",
        "Ultima Interaccion",
    ]);
});

test("lead workflow model resolves the contact and merges attribute patches", () => {
    const lead = {
        id: 500,
        custom_attributes: {
            existing_snapshot: "keep",
        },
        conversation_custom_attributes: {
            pipeline: "old",
        },
        meta: {
            sender: {
                id: "9001",
                custom_attributes: {
                    phone_quality: "valid",
                },
            },
        },
    };

    const state = buildLeadWorkflowAttributeState(
        lead,
        { phone_quality: "verified", fecha_visita: "2026-05-08" },
        { pipeline: "won", monto_operacion: 1500 },
    );

    assert.equal(resolveLeadWorkflowContactId(lead), 9001);
    assert.equal(state.contactId, 9001);
    assert.equal(state.hasContactPatch, true);
    assert.equal(state.hasConversationPatch, true);
    assert.deepEqual(state.nextContactAttrs, {
        phone_quality: "verified",
        fecha_visita: "2026-05-08",
    });
    assert.deepEqual(state.nextConversationAttrs, {
        pipeline: "won",
        monto_operacion: 1500,
    });
    assert.deepEqual(state.nextResolvedAttrs, {
        existing_snapshot: "keep",
        phone_quality: "verified",
        fecha_visita: "2026-05-08",
        pipeline: "won",
        monto_operacion: 1500,
    });
});

test("lead workflow model rejects leads without a valid contact id", () => {
    assert.equal(resolveLeadWorkflowContactId({ id: 1, meta: { sender: { id: "bad" } } }), null);
    assert.throws(
        () => buildLeadWorkflowAttributeState({ id: 1, meta: { sender: { id: "bad" } } }),
        /contacto asociado/,
    );
});

test("normalizeAttributeDefinitions keeps contact fields and skips conversation scoped fields", () => {
    const definitions = normalizeAttributeDefinitions([
        {
            attribute_key: "fecha_visita",
            attribute_display_name: "Fecha Visita",
            attribute_display_type: "date",
            attribute_scope: "contact_attribute",
        },
        {
            attribute_key: "conversation_note",
            attribute_display_name: "Nota interna",
            attribute_scope: "conversation_attribute",
        },
    ]);

    assert.equal(definitions.length, 1);
    assert.equal(definitions[0].key, "fecha_visita");
    assert.equal(definitions[0].valueType, "date");
});

test("inferAttributeDefinitionsFromConversations detects dates and numbers from lead attrs", () => {
    const definitions = inferAttributeDefinitionsFromConversations([
        {
            resolved_custom_attributes: {
                fecha_visita: "2026-05-07",
                monto_operacion: "15000",
            },
        },
    ]);

    assert.equal(definitions.find((definition) => definition.key === "fecha_visita").valueType, "date");
    assert.equal(definitions.find((definition) => definition.key === "monto_operacion").valueType, "number");
});

test("mergeAttributeDefinitions preserves the more specific external definition", () => {
    const [merged] = mergeAttributeDefinitions(
        [{
            key: "monto_operacion",
            label: "Monto",
            displayType: "text",
            valueType: "text",
            options: [],
        }],
        [{
            key: "monto_operacion",
            label: "Monto de operación",
            displayType: "number",
            valueType: "number",
            options: [],
        }],
    );

    assert.equal(merged.label, "Monto de operación");
    assert.equal(merged.valueType, "number");
});

test("appointment field validation and serialization protects date and amount formats", () => {
    const dateField = {
        key: "fecha_visita",
        label: "Fecha de visita",
        displayType: "date",
        valueType: "date",
        options: [],
    };
    const amountField = {
        key: "monto_operacion",
        label: "Monto",
        displayType: "number",
        valueType: "number",
        options: [],
    };

    assert.match(validateAppointmentFieldValue(dateField, "07/05/2026"), /YYYY-MM-DD/);
    assert.equal(validateAppointmentFieldValue(dateField, "2026-05-07"), null);
    assert.equal(serializeAppointmentFieldValue(amountField, "$15,000"), 15);
});
