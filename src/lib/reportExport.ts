import * as xlsx from "xlsx";
import { format } from "date-fns";
import { config } from "@/config";
import type { DashboardFilters, ResolvedConversation, TagConfig } from "@/context/DashboardDataContext";
import {
    DEFAULT_REPORT_COLUMN_FIELDS,
    REPORT_TAB_LABELS,
    type ReportFileFormat,
    type ReportTabId,
} from "@/lib/reportCatalog";
import {
    cleanText,
    formatDateTime,
    getAttrs,
    getChatwootUrl,
    getInboxChannelName,
    getLeadChannelName,
    getLeadEmail,
    getLeadExternalUrl,
    getLeadName,
    getLeadPhone,
    getMessagePreview,
    parseAmount,
} from "@/lib/leadDisplay";
import { formatBusinessLabel, formatBusinessList, formatFieldLabel } from "@/lib/displayCopy";

export interface ReportSection {
    title: string;
    rows: Array<Record<string, unknown>>;
}

export interface DashboardReportInput {
    title: string;
    tabIds: ReportTabId[];
    conversations: ResolvedConversation[];
    inboxes: any[];
    tagSettings: TagConfig;
    globalFilters: DashboardFilters;
    dashboardData?: any;
}

const STAGE_LABELS: Record<string, string> = {
    sale: "Venta exitosa",
    appointment: "Cita agendada",
    unqualified: "No calificado",
    followup: "Seguimiento humano",
    sql: "SQL",
    other: "Otro",
};

const safeSheetName = (name: string) => cleanText(name)
    .replace(/[\\/?*\[\]:]/g, " ")
    .slice(0, 31) || "Reporte";

const safeFilePart = (name: string) => cleanText(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "reporte";

const parseTimestampMs = (value: unknown) => {
    if (!value) return 0;
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric < 10000000000 ? numeric * 1000 : numeric;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const startOfLocalDay = (date: Date) => {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
};

const endOfLocalDay = (date: Date) => {
    const next = new Date(date);
    next.setHours(23, 59, 59, 999);
    return next;
};

const normalizeCell = (value: unknown) => {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(normalizeCell).filter(Boolean).join(", ");
    if (typeof value === "object") {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
};

const numberCell = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatConversationStatus = (value: unknown) => {
    const status = cleanText(value).toLowerCase();
    if (status === "open") return "Abierto";
    if (status === "resolved") return "Resuelto";
    if (status === "pending") return "Pendiente";
    if (status === "snoozed") return "Pausado";
    return formatBusinessLabel(value) || "";
};

const formatDataOrigin = (value: unknown) => {
    const source = cleanText(value).toLowerCase();
    if (source === "api") return "Datos recientes";
    if (source === "supabase") return "Historial disponible";
    if (source === "cache") return "Información guardada";
    return formatBusinessLabel(value) || "";
};

export const filterReportConversations = (
    conversations: ResolvedConversation[],
    filters: DashboardFilters,
) => {
    const start = filters.startDate ? startOfLocalDay(filters.startDate).getTime() : null;
    const end = filters.endDate ? endOfLocalDay(filters.endDate).getTime() : null;
    const selectedInboxes = filters.selectedInboxes || [];

    return conversations.filter((conversation) => {
        if (selectedInboxes.length > 0 && !selectedInboxes.includes(Number(conversation.inbox_id))) {
            return false;
        }

        const createdAt = parseTimestampMs(conversation.created_at || conversation.timestamp);
        if (start !== null && createdAt < start) return false;
        if (end !== null && createdAt > end) return false;

        return true;
    });
};

const getInboxMap = (inboxes: any[]) => new Map((inboxes || []).map((inbox) => [Number(inbox.id), inbox]));

const getScoreValue = (conversation: ResolvedConversation, tagSettings: TagConfig) => {
    const attrs = getAttrs(conversation);
    const configuredKey = cleanText(tagSettings.scoreAttributeKey);
    if (configuredKey && attrs[configuredKey] !== undefined) return attrs[configuredKey];
    return attrs.score ?? attrs.lead_score ?? attrs.puntaje ?? "";
};

const getFieldValue = (
    field: string,
    conversation: ResolvedConversation,
    inboxMap: Map<number, any>,
    tagSettings: TagConfig,
) => {
    const attrs = getAttrs(conversation);
    const inbox = conversation.inbox_id ? inboxMap.get(Number(conversation.inbox_id)) : undefined;
    const canal = getLeadChannelName(conversation, inbox);
    const displayField = formatFieldLabel(field);

    if (displayField === "Enlace de conversación") {
        return getChatwootUrl(conversation.id) || `${config.chatwoot.publicUrl}/app/accounts/${config.chatwoot.accountId}/conversations/${conversation.id}`;
    }

    switch (field) {
        case "ID": return conversation.id;
        case "Nombre": return getLeadName(conversation);
        case "Telefono": return getLeadPhone(conversation, canal);
        case "Canal": return canal;
        case "Estados":
        case "Etiquetas": return formatBusinessList(conversation.resolvedLabels?.length ? conversation.resolvedLabels : conversation.labels || []);
        case "Etapa": return STAGE_LABELS[conversation.resolvedStage] || conversation.resolvedStage || "Otro";
        case "Estado": return formatConversationStatus(conversation.status);
        case "Correo": return getLeadEmail(conversation);
        case "Monto": return parseAmount(attrs.monto_operacion) || attrs.monto_operacion || "";
        case "Fecha Monto": return attrs.fecha_monto_operacion || "";
        case "Agencia": return attrs.agencia || "";
        case "Check-in": return attrs.checkincat || attrs.check_in || "";
        case "Check-out": return attrs.checkoutcat || attrs.check_out || "";
        case "Campana": return attrs.campana || attrs.utm_campaign || attrs.origen || "";
        case "Ciudad": return attrs.ciudad || attrs.city || "";
        case "Responsable": return attrs.responsable || conversation.meta?.assignee?.name || "";
        case "Puntaje":
        case "Score": return getScoreValue(conversation, tagSettings);
        case "Ultimo Mensaje": return getMessagePreview(conversation);
        case "URL Red Social": return getLeadExternalUrl(conversation, canal);
        case "Fecha Ingreso": return formatDateTime(conversation.created_at || conversation.timestamp);
        case "Ultima Interaccion": return formatDateTime(conversation.timestamp || conversation.created_at);
        case "ID Contacto": return conversation.meta?.sender?.id || "";
        case "ID Inbox": return conversation.inbox_id || "";
        case "ID Cuenta": return (conversation as any).account_id || "";
        case "Origen Dato": return formatDataOrigin(conversation.source);
        default: return attrs[field] ?? attrs[field.toLowerCase()] ?? "";
    }
};

const getFieldsForTab = (tabId: ReportTabId, tagSettings: TagConfig) => {
    const custom = tagSettings.reportColumnFields?.[tabId];
    return custom && custom.length > 0 ? custom : DEFAULT_REPORT_COLUMN_FIELDS[tabId];
};

const buildConversationRows = (
    tabId: ReportTabId,
    conversations: ResolvedConversation[],
    inboxMap: Map<number, any>,
    tagSettings: TagConfig,
) => {
    const fields = getFieldsForTab(tabId, tagSettings);
    return conversations.map((conversation) => {
        const row: Record<string, unknown> = {};
        fields.forEach((field) => {
            row[formatFieldLabel(field)] = getFieldValue(field, conversation, inboxMap, tagSettings);
        });
        return row;
    });
};

const rowsFromArray = (items: any[] = [], labelKey = "name", valueKey = "value") =>
    items.map((item) => ({
        Nombre: labelKey === "label"
            ? formatBusinessLabel(item?.[labelKey] ?? item?.label ?? item?.date ?? item?.name ?? "")
            : item?.[labelKey] ?? item?.label ?? item?.date ?? item?.name ?? "",
        Valor: item?.[valueKey] ?? item?.count ?? item?.leads ?? item?.sales ?? 0,
        Porcentaje: item?.percentage ?? item?.rate ?? item?.winRate ?? "",
    }));

const buildSummarySection = (
    tabId: ReportTabId,
    conversations: ResolvedConversation[],
    dashboardData: any,
    tagSettings: TagConfig,
): ReportSection[] => {
    const kpis = dashboardData?.kpis || {};
    const operational = dashboardData?.operationalMetrics || {};
    const human = dashboardData?.humanMetrics || {};
    const trends = dashboardData?.trendMetrics || {};

    if (tabId === "overview") {
        return [{
            title: "Resumen ejecutivo",
            rows: [
                { Metrica: "Total leads", Valor: numberCell(kpis.totalLeads) },
                { Metrica: "SQLs", Valor: numberCell(kpis.interestedLeads) },
                { Metrica: "Citas agendadas", Valor: numberCell(kpis.scheduledAppointments) },
                { Metrica: "Ventas exitosas", Valor: numberCell(kpis.closedSales) },
                { Metrica: "Monto periodo", Valor: numberCell(kpis.monthlyProfit) },
                { Metrica: "Monto total", Valor: numberCell(kpis.totalProfit) },
            ],
        }];
    }

    if (tabId === "funnel") {
        return [
            { title: "Embudo actual", rows: rowsFromArray(dashboardData?.funnelData || [], "label", "value") },
            { title: "Embudo histórico acumulado", rows: rowsFromArray(dashboardData?.historicalFunnelData || [], "label", "value") },
        ];
    }

    if (tabId === "operational") {
        return [{
            title: "Metricas operativas",
            rows: [
                { Metrica: "Promedio primera respuesta", Valor: `${numberCell(operational.firstResponseAverageSeconds)} segundos` },
                { Metrica: "Leads con responsable", Valor: numberCell(operational.leadsWithOwnerCount) },
                { Metrica: "Leads sin respuesta", Valor: numberCell(operational.leadsSinRespuesta) },
                { Metrica: "Total leads", Valor: numberCell(operational.totalLeads || conversations.length) },
            ],
        }];
    }

    if (tabId === "followup") {
        return [{
            title: "Seguimiento humano",
            rows: [
                { Metrica: "Cola seguimiento", Valor: numberCell(human.followupCurrent ?? human.followup) },
                { Metrica: "Conversiones a cita", Valor: numberCell(human.humanAppointmentConversions) },
                { Metrica: "Ventas humanas", Valor: numberCell(human.salesCount) },
                { Metrica: "Volumen ventas", Valor: numberCell(human.salesVolume) },
            ],
        }];
    }

    if (tabId === "performance") {
        return [{
            title: "Rendimiento por responsable",
            rows: (dashboardData?.ownerPerformance || []).map((owner: any) => ({
                Responsable: owner.name,
                Leads: owner.leads,
                Citas: owner.appointments,
                "Sin respuesta": owner.unanswered,
                Conversion: `${owner.winRate || 0}%`,
                Origen: owner.source,
            })),
        }];
    }

    if (tabId === "trends") {
        return [
            { title: "Leads por canal", rows: rowsFromArray(trends.channelLeads || [], "name", "value") },
            { title: "Campanas", rows: rowsFromArray(dashboardData?.campaignData || trends.campaignList || [], "name", "leads") },
            { title: "Ingresos por dia", rows: rowsFromArray(trends.revenuePeaks || [], "date", "value") },
        ];
    }

    if (tabId === "scoring") {
        const scoreKey = cleanText(tagSettings.scoreAttributeKey) || "score";
        const highMin = tagSettings.scoreThresholds?.highMin ?? 20;
        const mediumMin = tagSettings.scoreThresholds?.mediumMin ?? 10;
        const buckets = { Alto: 0, Medio: 0, Bajo: 0, "Sin score": 0 };
        conversations.forEach((conversation) => {
            const attrs = getAttrs(conversation);
            const score = Number.parseFloat(String(attrs[scoreKey] ?? getScoreValue(conversation, tagSettings) ?? ""));
            if (!Number.isFinite(score)) buckets["Sin score"] += 1;
            else if (score >= highMin) buckets.Alto += 1;
            else if (score >= mediumMin) buckets.Medio += 1;
            else buckets.Bajo += 1;
        });
        return [{
            title: "Distribución de puntajes",
            rows: Object.entries(buckets).map(([Nivel, Leads]) => ({ Nivel: Nivel === "Sin score" ? "Sin puntaje" : Nivel, Leads })),
        }];
    }

    if (tabId === "chats") {
        return [{
            title: "Resumen conversaciones",
            rows: [
                { Metrica: "Conversaciones exportadas", Valor: conversations.length },
                { Metrica: "Con mensajes cargados", Valor: conversations.filter((conversation) => Array.isArray(conversation.messages) && conversation.messages.length > 0).length },
            ],
        }];
    }

    return [];
};

export const buildDashboardReportSections = (input: DashboardReportInput): ReportSection[] => {
    const filteredConversations = filterReportConversations(input.conversations, input.globalFilters);
    const inboxMap = getInboxMap(input.inboxes);

    return input.tabIds.flatMap((tabId) => {
        const tabLabel = REPORT_TAB_LABELS[tabId];
        const summarySections = buildSummarySection(tabId, filteredConversations, input.dashboardData, input.tagSettings);
        const detailsSection = {
            title: `${tabLabel} - detalle de leads`,
            rows: buildConversationRows(tabId, filteredConversations, inboxMap, input.tagSettings),
        };

        return [
            ...summarySections.map((section) => ({ ...section, title: `${tabLabel} - ${section.title}` })),
            detailsSection,
        ].filter((section) => section.rows.length > 0);
    });
};

const getRangeLabel = (filters: DashboardFilters) => ({
    start: filters.startDate ? format(filters.startDate, "yyyy-MM-dd") : "Todo",
    end: filters.endDate ? format(filters.endDate, "yyyy-MM-dd") : "Todo",
});

const getConversationLabels = (conversation: ResolvedConversation) =>
    conversation.resolvedLabels?.length
        ? conversation.resolvedLabels
        : conversation.labels || [];

const hasAnyLabel = (conversation: ResolvedConversation, labels: string[]) => {
    const labelSet = new Set(getConversationLabels(conversation));
    return labels.some((label) => labelSet.has(label));
};

const getDateFilteredConversations = (
    conversations: ResolvedConversation[],
    filters: DashboardFilters,
    dateGetter: (conversation: ResolvedConversation) => unknown,
) => {
    const start = filters.startDate ? startOfLocalDay(filters.startDate).getTime() : null;
    const end = filters.endDate ? endOfLocalDay(filters.endDate).getTime() : null;
    const selectedInboxes = filters.selectedInboxes || [];

    return conversations.filter((conversation) => {
        if (selectedInboxes.length > 0 && !selectedInboxes.includes(Number(conversation.inbox_id))) return false;

        const time = parseTimestampMs(dateGetter(conversation));
        if (start !== null && time < start) return false;
        if (end !== null && time > end) return false;

        return true;
    });
};

const getReportLabelUniverse = (conversations: ResolvedConversation[]) => {
    const baseLabels = [
        "interesado",
        "crear_confianza",
        "crear_urgencia",
        "desinteresado",
        "cita_agendada",
        "cita_agendada_humano",
        "seguimiento_humano",
        "venta_exitosa",
    ];

    return Array.from(new Set([
        ...baseLabels,
        ...conversations.flatMap(getConversationLabels),
    ].map((label) => cleanText(label)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
};

const buildLabelSummaryAoa = (
    params: {
        title: string;
        conversations: ResolvedConversation[];
        referenceConversations: ResolvedConversation[];
        inboxes: any[];
        filters: DashboardFilters;
        totalLabel: string;
    },
) => {
    const { start, end } = getRangeLabel(params.filters);
    const labels = getReportLabelUniverse(params.referenceConversations);
    const inboxMap = getInboxMap(params.inboxes);
    const inboxes = params.inboxes || [];

    const rows: any[][] = [
        ["Fecha Inicio", start],
        ["Fecha Fin", end],
        ["Reporte", params.title],
        ["Generado", format(new Date(), "yyyy-MM-dd HH:mm:ss")],
        [],
    ];

    const header = ["Estado", "Total", ...inboxes.map(getInboxChannelName)];
    rows.push(header);

    const labelCounts = new Map<string, { total: number; byInbox: Map<number, number> }>();
    labels.forEach((label) => labelCounts.set(label, { total: 0, byInbox: new Map() }));

    params.conversations.forEach((conversation) => {
        getConversationLabels(conversation).forEach((label) => {
            const row = labelCounts.get(label);
            if (!row) return;

            row.total += 1;
            const inboxId = Number(conversation.inbox_id);
            if (Number.isFinite(inboxId)) {
                row.byInbox.set(inboxId, (row.byInbox.get(inboxId) || 0) + 1);
            }
        });
    });

    labels.forEach((label) => {
        const count = labelCounts.get(label)!;
        rows.push([
            formatBusinessLabel(label),
            count.total,
            ...inboxes.map((inbox) => count.byInbox.get(Number(inbox.id)) || 0),
        ]);
    });

    rows.push([]);
    rows.push([
        "Total estados asignados",
        labels.reduce((sum, label) => sum + (labelCounts.get(label)?.total || 0), 0),
        ...inboxes.map((inbox) => labels.reduce((sum, label) => sum + (labelCounts.get(label)?.byInbox.get(Number(inbox.id)) || 0), 0)),
    ]);
    rows.push([params.totalLabel, params.conversations.length]);

    if (inboxes.length === 0 && params.referenceConversations.length > 0) {
        rows.push([]);
        rows.push(["Nota", "No se cargaron los canales en contexto; el canal se resolvió desde cada conversación."]);
        params.referenceConversations.slice(0, 1).forEach((conversation) => {
            rows.push(["Canal ejemplo", getLeadChannelName(conversation, inboxMap.get(Number(conversation.inbox_id)))]);
        });
    }

    return rows;
};

const formatExcelTimestamp = (value: unknown) => {
    const time = parseTimestampMs(value);
    return time ? format(new Date(time), "yyyy-MM-dd HH:mm:ss") : "";
};

const buildCompleteLeadRowsAoa = (
    conversations: ResolvedConversation[],
    inboxMap: Map<number, any>,
    tagSettings: TagConfig,
) => {
    const headers = [
        "ID Conversacion",
        "Nombre del Lead",
        "Teléfono",
        "Canal",
        "Estados",
        "Etapa",
        "Estado",
        "Responsable (Persona)",
        "Agente asignado",
        "Nombre completo",
        "Correo",
        "Ciudad",
        "Campaña",
        "Edad",
        "Fecha de visita",
        "Hora de visita",
        "Agencia",
        "Puntaje",
        "Monto de la operación",
        "Fecha en que se registró el monto",
        "Último mensaje",
        "URL comercial",
        "Enlace de conversación",
        "Fecha de ingreso",
        "Última interacción",
        "ID del contacto",
        "ID de bandeja",
        "Origen del dato",
    ];

    return [
        headers,
        ...conversations.map((conversation) => {
            const attrs = getAttrs(conversation);
            const inbox = conversation.inbox_id ? inboxMap.get(Number(conversation.inbox_id)) : undefined;
            const canal = getLeadChannelName(conversation, inbox);

            return [
                conversation.id,
                getLeadName(conversation),
                getLeadPhone(conversation, canal),
                canal,
                formatBusinessList(getConversationLabels(conversation), " | "),
                STAGE_LABELS[conversation.resolvedStage] || conversation.resolvedStage || "Otro",
                formatConversationStatus(conversation.status),
                attrs.responsable || "",
                conversation.meta?.assignee?.name || "",
                attrs.nombre_completo || "",
                attrs.correo || conversation.meta?.sender?.email || "",
                attrs.ciudad || "",
                attrs.campana || attrs.utm_campaign || "",
                attrs.edad || "",
                attrs.fecha_visita || "",
                attrs.hora_visita || "",
                attrs.agencia || "",
                getScoreValue(conversation, tagSettings),
                attrs.monto_operacion || "",
                attrs.fecha_monto_operacion || "",
                getMessagePreview(conversation),
                getLeadExternalUrl(conversation, canal),
                getChatwootUrl(conversation.id),
                formatExcelTimestamp(conversation.created_at || conversation.timestamp),
                formatExcelTimestamp(conversation.timestamp || conversation.created_at),
                conversation.meta?.sender?.id || "",
                conversation.inbox_id || "",
                formatDataOrigin(conversation.source),
            ];
        }),
    ];
};

const appendAoaSheet = (workbook: xlsx.WorkBook, rows: any[][], sheetName: string) => {
    const worksheet = xlsx.utils.aoa_to_sheet(rows);
    if (worksheet["!ref"]) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
    worksheet["!cols"] = (rows[0] || []).map(() => ({ wch: 22 }));
    xlsx.utils.book_append_sheet(workbook, worksheet, safeSheetName(sheetName));
};

const appendJsonSheet = (workbook: xlsx.WorkBook, rows: Array<Record<string, unknown>>, sheetName: string) => {
    const worksheet = xlsx.utils.json_to_sheet(rows);
    if (worksheet["!ref"]) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
    worksheet["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 22 }));
    xlsx.utils.book_append_sheet(workbook, worksheet, safeSheetName(sheetName));
};

const exportChatsWorkbook = (input: DashboardReportInput, fileName: string) => {
    const activityConversations = getDateFilteredConversations(
        input.conversations,
        input.globalFilters,
        (conversation) => conversation.timestamp || conversation.created_at,
    );
    const createdConversations = getDateFilteredConversations(
        input.conversations,
        input.globalFilters,
        (conversation) => conversation.created_at || conversation.timestamp,
    );

    if (activityConversations.length === 0 && createdConversations.length === 0) {
        throw new Error("No hay conversaciones para exportar con los filtros actuales.");
    }

    const inboxMap = getInboxMap(input.inboxes);
    const workbook = xlsx.utils.book_new();
    const referenceConversations = Array.from(new Map(
        [...activityConversations, ...createdConversations].map((conversation) => [conversation.id, conversation]),
    ).values());

    appendAoaSheet(workbook, buildLabelSummaryAoa({
        title: "Resumen de estados con actividad",
        conversations: activityConversations,
        referenceConversations,
        inboxes: input.inboxes,
        filters: input.globalFilters,
        totalLabel: "Total Leads de Actividades",
    }), "Resumen Estados Actividad");

    appendAoaSheet(workbook, buildCompleteLeadRowsAoa(activityConversations, inboxMap, input.tagSettings), "Detalle Leads Actividades");

    appendAoaSheet(workbook, buildLabelSummaryAoa({
        title: "Resumen de estados únicos",
        conversations: createdConversations,
        referenceConversations,
        inboxes: input.inboxes,
        filters: input.globalFilters,
        totalLabel: "Total Leads Unicos",
    }), "Resumen Estados Únicos");

    appendAoaSheet(workbook, buildCompleteLeadRowsAoa(createdConversations, inboxMap, input.tagSettings), "Detalle Leads Unicas");

    xlsx.writeFile(workbook, fileName);
};

const buildQueueRows = (
    conversations: ResolvedConversation[],
    inboxMap: Map<number, any>,
    tagSettings: TagConfig,
) => conversations.map((conversation) => {
    const attrs = getAttrs(conversation);
    const inbox = conversation.inbox_id ? inboxMap.get(Number(conversation.inbox_id)) : undefined;
    const canal = getLeadChannelName(conversation, inbox);

    return {
        "ID Conversacion": conversation.id,
        "Nombre del Lead": getLeadName(conversation),
        Canal: canal,
        Número: getLeadPhone(conversation, canal),
        Estados: formatBusinessList(getConversationLabels(conversation), " | "),
        Etapa: STAGE_LABELS[conversation.resolvedStage] || conversation.resolvedStage || "Otro",
        Responsable: attrs.responsable || "",
        "Agente asignado": conversation.meta?.assignee?.name || "",
        Agencia: attrs.agencia || "",
        "Fecha Visita": attrs.fecha_visita || "",
        "Hora Visita": attrs.hora_visita || "",
        "Ultimo Mensaje": getMessagePreview(conversation),
        "URL comercial": getLeadExternalUrl(conversation, canal),
        "Enlace de conversación": getChatwootUrl(conversation.id),
        "Fecha de ingreso": formatExcelTimestamp(conversation.created_at || conversation.timestamp),
        "Última interacción": formatExcelTimestamp(conversation.timestamp || conversation.created_at),
        "Origen del dato": formatDataOrigin(conversation.source),
    };
});

const getSalesDateMs = (conversation: ResolvedConversation) => {
    const attrs = getAttrs(conversation);
    return parseTimestampMs(attrs.fecha_monto_operacion || conversation.created_at || conversation.timestamp);
};

const filterSalesConversations = (conversations: ResolvedConversation[], filters: DashboardFilters, tagSettings: TagConfig) => {
    const start = filters.startDate ? startOfLocalDay(filters.startDate).getTime() : null;
    const end = filters.endDate ? endOfLocalDay(filters.endDate).getTime() : null;
    const selectedInboxes = filters.selectedInboxes || [];
    const saleLabels = [
        ...(tagSettings.saleTags || []),
        tagSettings.humanSaleTargetLabel || "venta_exitosa",
    ].filter(Boolean);

    return conversations.filter((conversation) => {
        if (selectedInboxes.length > 0 && !selectedInboxes.includes(Number(conversation.inbox_id))) return false;
        if (conversation.resolvedStage !== "sale" && !hasAnyLabel(conversation, saleLabels)) return false;

        const saleDate = getSalesDateMs(conversation);
        if (start !== null && saleDate < start) return false;
        if (end !== null && saleDate > end) return false;

        return true;
    });
};

const buildSalesRows = (
    conversations: ResolvedConversation[],
    inboxMap: Map<number, any>,
) => conversations.map((conversation) => {
    const attrs = getAttrs(conversation);
    const inbox = conversation.inbox_id ? inboxMap.get(Number(conversation.inbox_id)) : undefined;
    const canal = getLeadChannelName(conversation, inbox);
    const amount = parseAmount(attrs.monto_operacion);

    return {
        "ID Conversacion": conversation.id,
        "Nombre del Lead": getLeadName(conversation),
        Teléfono: getLeadPhone(conversation, canal),
        Canal: canal,
        Estados: formatBusinessList(getConversationLabels(conversation), " | "),
        Monto: attrs.monto_operacion || "",
        "Monto numérico": amount,
        "Fecha en que se registró el monto": attrs.fecha_monto_operacion || "",
        Agencia: attrs.agencia || "",
        Campaña: attrs.campana || attrs.utm_campaign || "",
        Responsable: attrs.responsable || conversation.meta?.assignee?.name || "",
        Correo: getLeadEmail(conversation),
        "URL comercial": getLeadExternalUrl(conversation, canal),
        "Enlace de conversación": getChatwootUrl(conversation.id),
        "Fecha de ingreso": formatExcelTimestamp(conversation.created_at || conversation.timestamp),
        "Última interacción": formatExcelTimestamp(conversation.timestamp || conversation.created_at),
        "Origen del dato": formatDataOrigin(conversation.source),
    };
});

const exportFollowupWorkbook = (input: DashboardReportInput, fileName: string) => {
    const filteredConversations = filterReportConversations(input.conversations, input.globalFilters);
    const inboxMap = getInboxMap(input.inboxes);
    const followupTags = input.tagSettings.humanFollowupQueueTags || ["seguimiento_humano"];
    const appointmentTags = input.tagSettings.humanSalesQueueTags || ["cita_agendada", "cita_agendada_humano"];

    const followupRows = filteredConversations.filter((conversation) => hasAnyLabel(conversation, followupTags));
    const appointmentRows = filteredConversations.filter((conversation) => hasAnyLabel(conversation, appointmentTags));
    const saleConversations = filterSalesConversations(input.conversations, input.globalFilters, input.tagSettings);
    const salesRows = buildSalesRows(saleConversations, inboxMap);
    const salesTotal = salesRows.reduce((sum, row) => sum + numberCell(row["Monto numérico"]), 0);
    const byChannel = new Map<string, { Canal: string; Ventas: number; Monto: number }>();
    const byMonth = new Map<string, { Periodo: string; Ventas: number; Monto: number }>();
    const { start, end } = getRangeLabel(input.globalFilters);

    salesRows.forEach((row) => {
        const channel = cleanText(row.Canal) || "Otro";
        const channelRow = byChannel.get(channel) || { Canal: channel, Ventas: 0, Monto: 0 };
        channelRow.Ventas += 1;
        channelRow.Monto += numberCell(row["Monto numérico"]);
        byChannel.set(channel, channelRow);

        const month = cleanText(row["Fecha en que se registró el monto"]).slice(0, 7) || "Sin fecha";
        const monthRow = byMonth.get(month) || { Periodo: month, Ventas: 0, Monto: 0 };
        monthRow.Ventas += 1;
        monthRow.Monto += numberCell(row["Monto Numerico"]);
        byMonth.set(month, monthRow);
    });

    if (followupRows.length === 0 && appointmentRows.length === 0 && salesRows.length === 0) {
        throw new Error("No hay datos de seguimiento para exportar con los filtros actuales.");
    }

    const workbook = xlsx.utils.book_new();
    appendAoaSheet(workbook, [
        ["Fecha Inicio", start],
        ["Fecha Fin", end],
        ["Generado", format(new Date(), "yyyy-MM-dd HH:mm:ss")],
        ["Estados de Cola de Trabajo Diaria", formatBusinessList(followupTags)],
        ["Estados de Citas Agendadas", formatBusinessList(appointmentTags)],
        ["Estado de venta exitosa", formatBusinessLabel(input.tagSettings.humanSaleTargetLabel || "venta_exitosa")],
        [],
        ["Metrica", "Valor"],
        ["Leads en Cola de Trabajo Diaria", followupRows.length],
        ["Leads en Citas Agendadas", appointmentRows.length],
        ["Ventas Exitosas", salesRows.length],
        ["Monto Total Ventas", salesTotal],
        ["Ticket Promedio", salesRows.length > 0 ? salesTotal / salesRows.length : 0],
    ], "Resumen Seguimiento");

    appendJsonSheet(workbook, buildQueueRows(followupRows, inboxMap, input.tagSettings), "Cola Trabajo Diaria");
    appendJsonSheet(workbook, buildQueueRows(appointmentRows, inboxMap, input.tagSettings), "Citas Agendadas");
    appendAoaSheet(workbook, [
        ["Fecha Inicio", start],
        ["Fecha Fin", end],
        ["Generado", format(new Date(), "yyyy-MM-dd HH:mm:ss")],
        ["Ventas exitosas", salesRows.length],
        ["Monto total", salesTotal],
        ["Ticket promedio", salesRows.length > 0 ? salesTotal / salesRows.length : 0],
    ], "Reporte Ventas Exitosas");
    appendJsonSheet(workbook, Array.from(byChannel.values()), "Ventas Por Canal");
    appendJsonSheet(workbook, Array.from(byMonth.values()), "Ventas Por Mes");
    appendJsonSheet(workbook, salesRows, "Detalle Ventas");

    xlsx.writeFile(workbook, fileName);
};

const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};

const csvEscape = (value: unknown) => {
    const text = normalizeCell(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
};

const sectionToCsv = (section: ReportSection) => {
    const columns = Array.from(new Set(section.rows.flatMap((row) => Object.keys(row))));
    const lines = [
        csvEscape(section.title),
        columns.map(csvEscape).join(","),
        ...section.rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
    ];
    return lines.join("\n");
};

const exportCsv = (sections: ReportSection[], fileName: string) => {
    const csv = sections.map(sectionToCsv).join("\n\n");
    downloadBlob(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }), fileName);
};

const exportExcel = (sections: ReportSection[], fileName: string) => {
    const workbook = xlsx.utils.book_new();
    sections.forEach((section, index) => {
        const worksheet = xlsx.utils.json_to_sheet(section.rows);
        xlsx.utils.book_append_sheet(workbook, worksheet, safeSheetName(`${index + 1} ${section.title}`));
    });
    xlsx.writeFile(workbook, fileName);
};

const toPdfSafeText = (value: unknown) => normalizeCell(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const wrapLine = (line: string, maxLength = 96) => {
    const clean = toPdfSafeText(line);
    if (clean.length <= maxLength) return [clean];

    const chunks: string[] = [];
    let remaining = clean;
    while (remaining.length > maxLength) {
        const splitIndex = remaining.lastIndexOf(" ", maxLength);
        const index = splitIndex > 20 ? splitIndex : maxLength;
        chunks.push(remaining.slice(0, index));
        remaining = remaining.slice(index).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
};

const pdfEscape = (text: string) => text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const sectionsToPdfLines = (title: string, sections: ReportSection[]) => {
    const lines = [
        title,
        `Generado: ${format(new Date(), "yyyy-MM-dd HH:mm")}`,
        "",
    ];

    sections.forEach((section) => {
        lines.push(section.title);
        const columns = Array.from(new Set(section.rows.flatMap((row) => Object.keys(row)))).slice(0, 8);
        if (columns.length > 0) lines.push(columns.join(" | "));
        section.rows.slice(0, 120).forEach((row) => {
            lines.push(columns.map((column) => normalizeCell(row[column])).join(" | "));
        });
        if (section.rows.length > 120) lines.push(`... ${section.rows.length - 120} filas adicionales en Excel/CSV`);
        lines.push("");
    });

    return lines.flatMap((line) => wrapLine(line));
};

const buildPdfBlob = (lines: string[]) => {
    const pageLines: string[][] = [];
    const linesPerPage = 48;
    for (let index = 0; index < lines.length; index += linesPerPage) {
        pageLines.push(lines.slice(index, index + linesPerPage));
    }

    const objects: string[] = [];
    const addObject = (body: string) => {
        objects.push(body);
        return objects.length;
    };

    const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
    const pagesPlaceholderId = addObject("__PAGES__");
    const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const pageIds: number[] = [];

    pageLines.forEach((page) => {
        const streamLines = ["BT", "/F1 9 Tf", "40 800 Td"];
        page.forEach((line, index) => {
            if (index > 0) streamLines.push("0 -14 Td");
            streamLines.push(`(${pdfEscape(line)}) Tj`);
        });
        streamLines.push("ET");
        const stream = streamLines.join("\n");
        const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
        const pageId = addObject(`<< /Type /Page /Parent ${pagesPlaceholderId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
        pageIds.push(pageId);
    });

    objects[pagesPlaceholderId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((body, index) => {
        offsets.push(pdf.length);
        pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    offsets.slice(1).forEach((offset) => {
        pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return new Blob([pdf], { type: "application/pdf" });
};

const exportPdf = (title: string, sections: ReportSection[], fileName: string) => {
    const lines = sectionsToPdfLines(title, sections);
    downloadBlob(buildPdfBlob(lines), fileName);
};

export const downloadDashboardReport = (formatId: ReportFileFormat, input: DashboardReportInput) => {
    const stamp = format(new Date(), "yyyyMMdd_HHmmss");
    const baseName = `${safeFilePart(input.title)}_${stamp}`;

    if (formatId === "excel" && input.tabIds.length === 1 && input.tabIds[0] === "chats") {
        exportChatsWorkbook(input, `${baseName}.xlsx`);
        return;
    }

    if (formatId === "excel" && input.tabIds.length === 1 && input.tabIds[0] === "followup") {
        exportFollowupWorkbook(input, `${baseName}.xlsx`);
        return;
    }

    const sections = buildDashboardReportSections(input);
    if (sections.length === 0) {
        throw new Error("No hay datos para exportar con los filtros actuales.");
    }

    if (formatId === "excel") exportExcel(sections, `${baseName}.xlsx`);
    if (formatId === "csv") exportCsv(sections, `${baseName}.csv`);
    if (formatId === "pdf") exportPdf(input.title, sections, `${baseName}.pdf`);
};
