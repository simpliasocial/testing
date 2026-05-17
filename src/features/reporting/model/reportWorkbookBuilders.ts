import * as xlsx from "xlsx";
import { format } from "date-fns";
import type { ResolvedConversation } from "@/context/dashboardDataTypes";
import type { TagConfig } from "@/domain/dashboard";
import { getLeadName, getLeadPhone, getChatwootUrl, getLeadExternalUrl, getLeadChannelName, getMessagePreview, getAttrs, getLeadEmail } from "@/lib/leadDisplay";
import { formatBusinessList, formatBusinessLabel } from "@/lib/displayCopy";
import {
    formatLeadStage,
    formatConversationStatus,
    formatDataOrigin,
    buildSalesSummaryRows,
    safeSheetName,
    getReportConversationLabels,
    parseTimestampMs,
    startOfLocalDay,
    endOfLocalDay,
} from "@/features/reporting/model/reportExportModel";
import { getCommercialSaleDate, isCurrentSale, parseAmount } from "@/lib/commercialFacts";
import type { DashboardReportInput, InboxMap, ReportInbox, ReportAoa } from "../domain/reportTypes";
import {
    getInboxMap,
    getScoreValue,
    getRangeLabel,
} from "./reportDataExtractors";
import { applyPlainHeaderStyle } from "@/infrastructure/report/excelSheetStyles";

const formatExcelTimestamp = (value: unknown) => {
    const time = parseTimestampMs(value);
    return time ? format(new Date(time), "yyyy-MM-dd HH:mm:ss") : "";
};

const hasAnyLabel = (conversation: ResolvedConversation, labels: string[]) => {
    const labelSet = new Set(getReportConversationLabels(conversation));
    return labels.some((label) => labelSet.has(label));
};

const getDateFilteredConversations = (
    conversations: ResolvedConversation[],
    filters: any,
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
        "interesado", "crear_confianza", "crear_urgencia", "desinteresado",
        "cita_agendada", "cita_agendada_humano", "seguimiento_humano", "venta_exitosa",
    ];

    return Array.from(new Set([
        ...baseLabels,
        ...conversations.flatMap(getReportConversationLabels),
    ].map((label) => String(label).trim().toLowerCase()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
};

export const appendAoaSheet = (workbook: xlsx.WorkBook, rows: ReportAoa, sheetName: string) => {
    const worksheet = xlsx.utils.aoa_to_sheet(rows);
    if (worksheet["!ref"]) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
    worksheet["!cols"] = (rows[0] || []).map(() => ({ wch: 22 }));
    applyPlainHeaderStyle(worksheet);
    xlsx.utils.book_append_sheet(workbook, worksheet, safeSheetName(sheetName));
};

export const appendJsonSheet = (workbook: xlsx.WorkBook, rows: Array<Record<string, unknown>>, sheetName: string) => {
    const worksheet = xlsx.utils.json_to_sheet(rows);
    if (worksheet["!ref"]) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
    worksheet["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 22 }));
    applyPlainHeaderStyle(worksheet);
    xlsx.utils.book_append_sheet(workbook, worksheet, safeSheetName(sheetName));
};

const buildLabelSummaryAoa = (
    params: {
        title: string;
        conversations: ResolvedConversation[];
        referenceConversations: ResolvedConversation[];
        inboxes: ReportInbox[];
        filters: any;
        totalLabel: string;
    },
) => {
    const { start, end } = getRangeLabel(params.filters);
    const labels = getReportLabelUniverse(params.referenceConversations);
    const inboxMap = getInboxMap(params.inboxes);
    const inboxes = params.inboxes || [];

    const rows: ReportAoa = [
        ["Fecha Inicio", start],
        ["Fecha Fin", end],
        ["Reporte", params.title],
        ["Generado", format(new Date(), "yyyy-MM-dd HH:mm:ss")],
        [],
    ];

    const header = ["Estado", "Total", ...inboxes.map(i => i.name)];
    rows.push(header);

    const labelCounts = new Map<string, { total: number; byInbox: Map<number, number> }>();
    labels.forEach((label) => labelCounts.set(label, { total: 0, byInbox: new Map() }));

    params.conversations.forEach((conversation) => {
        getReportConversationLabels(conversation).forEach((label) => {
            const row = labelCounts.get(String(label).trim().toLowerCase());
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
            rows.push(["Canal ejemplo", getLeadChannelName(conversation, inboxMap.get(Number(conversation.inbox_id)) as ReportInbox)]);
        });
    }

    return rows;
};

const buildCompleteLeadRowsAoa = (
    conversations: ResolvedConversation[],
    inboxMap: InboxMap,
    tagSettings: TagConfig,
) => {
    const headers = [
        "ID Conversacion", "Nombre del Lead", "Teléfono", "Canal", "Estados", "Etapa", "Estado",
        "Responsable (Persona)", "Agente asignado", "Nombre completo", "Correo", "Ciudad", "Campaña",
        "Edad", "Fecha de visita", "Hora de visita", "Agencia", "Puntaje", "Monto de la operación",
        "Fecha en que se registró el monto", "Último mensaje", "URL comercial", "Enlace de conversación",
        "Fecha de ingreso", "Última interacción", "ID del contacto", "ID de bandeja", "Origen del dato",
    ];

    return [
        headers,
        ...conversations.map((conversation) => {
            const attrs = getAttrs(conversation);
            const inbox = conversation.inbox_id ? inboxMap.get(Number(conversation.inbox_id)) : undefined;
            const canal = getLeadChannelName(conversation, inbox as ReportInbox);

            return [
                conversation.id,
                getLeadName(conversation),
                getLeadPhone(conversation, canal),
                canal,
                formatBusinessList(getReportConversationLabels(conversation), " | "),
                formatLeadStage(conversation.resolvedStage),
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

export const exportChatsWorkbook = (input: DashboardReportInput, fileName: string) => {
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
    inboxMap: InboxMap,
    tagSettings: TagConfig,
) => conversations.map((conversation) => {
    const attrs = getAttrs(conversation);
    const inbox = conversation.inbox_id ? inboxMap.get(Number(conversation.inbox_id)) : undefined;
    const canal = getLeadChannelName(conversation, inbox as ReportInbox);

    return {
        "ID Conversacion": conversation.id,
        "Nombre del Lead": getLeadName(conversation),
        Canal: canal,
        Número: getLeadPhone(conversation, canal),
        Estados: formatBusinessList(getReportConversationLabels(conversation), " | "),
        Etapa: formatLeadStage(conversation.resolvedStage),
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
    return getCommercialSaleDate(conversation, (value) => new Date(parseTimestampMs(value))).getTime();
};

const filterSalesConversations = (conversations: ResolvedConversation[], filters: any, tagSettings: TagConfig) => {
    const start = filters.startDate ? startOfLocalDay(filters.startDate).getTime() : null;
    const end = filters.endDate ? endOfLocalDay(filters.endDate).getTime() : null;
    const selectedInboxes = filters.selectedInboxes || [];

    return conversations.filter((conversation) => {
        if (selectedInboxes.length > 0 && !selectedInboxes.includes(Number(conversation.inbox_id))) return false;
        if (!isCurrentSale(conversation, tagSettings)) return false;

        const saleDate = getSalesDateMs(conversation);
        if (start !== null && saleDate < start) return false;
        if (end !== null && saleDate > end) return false;

        return true;
    });
};

const buildSalesRows = (
    conversations: ResolvedConversation[],
    inboxMap: InboxMap,
) => conversations.map((conversation) => {
    const attrs = getAttrs(conversation);
    const inbox = conversation.inbox_id ? inboxMap.get(Number(conversation.inbox_id)) : undefined;
    const canal = getLeadChannelName(conversation, inbox as ReportInbox);
    const amount = parseAmount(attrs.monto_operacion);

    return {
        "ID Conversacion": conversation.id,
        "Nombre del Lead": getLeadName(conversation),
        Teléfono: getLeadPhone(conversation, canal),
        Canal: canal,
        Estados: formatBusinessList(getReportConversationLabels(conversation), " | "),
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

export const exportFollowupWorkbook = (input: DashboardReportInput, fileName: string) => {
    const filteredConversations = input.conversations; // Simplify or use filterReportConversations if available
    const inboxMap = getInboxMap(input.inboxes);
    const followupTags = input.tagSettings.humanFollowupQueueTags || ["seguimiento_humano"];
    const appointmentTags = input.tagSettings.humanSalesQueueTags || ["cita_agendada", "cita_agendada_humano"];

    const followupRows = filteredConversations.filter((conversation) => hasAnyLabel(conversation, followupTags));
    const appointmentRows = filteredConversations.filter((conversation) => hasAnyLabel(conversation, appointmentTags));
    const saleConversations = filterSalesConversations(input.conversations, input.globalFilters, input.tagSettings);
    const salesRows = buildSalesRows(saleConversations, inboxMap);
    const salesSummary = buildSalesSummaryRows(salesRows as any);
    const { start, end } = getRangeLabel(input.globalFilters);

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
        ["Monto Total Ventas", salesSummary.salesTotal],
        ["Ticket Promedio", salesRows.length > 0 ? salesSummary.salesTotal / salesRows.length : 0],
    ], "Resumen Seguimiento");

    appendJsonSheet(workbook, buildQueueRows(followupRows, inboxMap, input.tagSettings), "Cola Trabajo Diaria");
    appendJsonSheet(workbook, buildQueueRows(appointmentRows, inboxMap, input.tagSettings), "Citas Agendadas");
    appendAoaSheet(workbook, [
        ["Fecha Inicio", start],
        ["Fecha Fin", end],
        ["Generado", format(new Date(), "yyyy-MM-dd HH:mm:ss")],
        ["Ventas exitosas", salesRows.length],
        ["Monto total", salesSummary.salesTotal],
        ["Ticket promedio", salesRows.length > 0 ? salesSummary.salesTotal / salesRows.length : 0],
    ], "Reporte Ventas Exitosas");
    appendJsonSheet(workbook, salesSummary.byChannel as any, "Ventas Por Canal");
    appendJsonSheet(workbook, salesSummary.byMonth as any, "Ventas Por Mes");
    appendJsonSheet(workbook, salesRows, "Detalle Ventas");

    xlsx.writeFile(workbook, fileName);
};
