import { format } from "date-fns";
import type { ResolvedConversation } from "@/context/dashboardDataTypes";
import type { TagConfig, DashboardFilters } from "@/domain/dashboard";
import type { ConversationMessage } from "@/domain/lead";
import { getAttrs, getLeadName, getLeadPhone, getLeadEmail, getChatwootUrl, getMessagePreview, getLeadExternalUrl, getLeadChannelName, getInboxChannelName } from "@/lib/leadDisplay";
import { cleanText } from "@/lib/leadDisplay";
import { parseNumericScore, bucketFromScore, normalizeScoreThresholds, SCORE_BUCKET_COPY } from "@/lib/leadScoreClassification";
import { parseTimestampMs, formatDataOrigin, formatLeadStage, formatConversationStatus, safeDivision } from "@/features/reporting/model/reportExportModel";
import { formatFieldLabel, formatBusinessList } from "@/lib/displayCopy";
import { parseAmount, getCurrentSaleAmount, isCurrentSale } from "@/lib/commercialFacts";
import { formatDateTime } from "@/lib/leadDisplay";
import { DEFAULT_REPORT_COLUMN_FIELDS, type ReportTabId } from "@/features/reporting/domain/reportCatalog";
import { asRecord } from "@/domain/common/types";
import type { InboxMap, ReportInbox, DashboardReportData, OwnerPerformanceRow, DashboardReportInput } from "../domain/reportTypes";

export const getScoreValue = (conversation: ResolvedConversation, tagSettings: TagConfig) => {
    const attrs = getAttrs(conversation);
    const configuredKey = cleanText(tagSettings.scoreAttributeKey);
    if (configuredKey && attrs[configuredKey] !== undefined) return attrs[configuredKey];
    return attrs.score ?? attrs.lead_score ?? attrs.puntaje ?? "";
};

export const getScoreNumber = (conversation: ResolvedConversation, tagSettings: TagConfig) =>
    parseNumericScore(getScoreValue(conversation, tagSettings));

export const getScoreBucket = (conversation: ResolvedConversation, tagSettings: TagConfig) =>
    bucketFromScore(getScoreNumber(conversation, tagSettings), normalizeScoreThresholds(tagSettings.scoreThresholds));

export const getScoreBucketLabel = (conversation: ResolvedConversation, tagSettings: TagConfig) =>
    SCORE_BUCKET_COPY[getScoreBucket(conversation, tagSettings)].label;

export const getCampaignValue = (conversation: ResolvedConversation) => {
    const attrs = getAttrs(conversation);
    return attrs.campana || attrs.utm_campaign || attrs.origen || "Sin campaña";
};

export const getResponsibleValue = (conversation: ResolvedConversation) => {
    const attrs = getAttrs(conversation);
    return attrs.responsable || conversation.meta?.assignee?.name || "Sin responsable";
};

export const getReportMessageTimestampMs = (message: ConversationMessage) =>
    parseTimestampMs(message?.created_at_chatwoot || message?.created_at || message?.timestamp);

export const isIncomingReportMessage = (message: ConversationMessage) =>
    message?.message_direction === "incoming" ||
    Number(message?.message_type) === 0 ||
    cleanText(message?.message_type).toLowerCase() === "incoming" ||
    cleanText(message?.sender_type).toLowerCase() === "contact";

export const hasReportMessageSenderSignal = (message: ConversationMessage) =>
    message?.message_direction !== undefined ||
    message?.message_type !== undefined ||
    message?.sender_type !== undefined;

export const getReportConversationMessages = (conversation: ResolvedConversation) =>
    Array.isArray(conversation.messages)
        ? [...conversation.messages]
            .filter((message) => !message?.private && !message?.is_private && getReportMessageTimestampMs(message) > 0)
            .sort((a, b) => getReportMessageTimestampMs(a) - getReportMessageTimestampMs(b))
        : [];

export const hasUnansweredCustomerMessage = (conversation: ResolvedConversation) => {
    if (conversation.waiting_since) return true;

    const lastNonActivityMessage = conversation.last_non_activity_message;
    if (lastNonActivityMessage && hasReportMessageSenderSignal(lastNonActivityMessage)) {
        return isIncomingReportMessage(lastNonActivityMessage);
    }

    const messages = getReportConversationMessages(conversation);
    if (messages.length > 0) {
        return isIncomingReportMessage(messages[messages.length - 1]);
    }

    if (lastNonActivityMessage?.content && !conversation.first_reply_created_at) {
        return true;
    }

    return !conversation.first_reply_created_at;
};

export const getConversationRevenue = (conversation: ResolvedConversation, tagSettings: TagConfig) =>
    getCurrentSaleAmount(conversation, tagSettings);

export const getConversationStage = (conversation: ResolvedConversation) =>
    conversation.resolvedStage || "other";

export const getConversationSummary = (conversations: ResolvedConversation[], tagSettings: TagConfig) => {
    const totals = {
        leads: conversations.length,
        sqls: 0,
        appointments: 0,
        sales: 0,
        unqualified: 0,
        followups: 0,
        unresolved: 0,
        noResponse: 0,
        revenue: 0,
        withMessages: 0,
        scored: 0,
        scoreSum: 0,
        missingScore: 0,
    };

    conversations.forEach((conversation) => {
        const stage = getConversationStage(conversation);
        if (stage === "sql") totals.sqls += 1;
        if (stage === "appointment") totals.appointments += 1;
        if (isCurrentSale(conversation, tagSettings)) totals.sales += 1;
        if (stage === "unqualified") totals.unqualified += 1;
        if (stage === "followup") totals.followups += 1;
        if (cleanText(conversation.status).toLowerCase() !== "resolved") totals.unresolved += 1;
        if (hasUnansweredCustomerMessage(conversation)) totals.noResponse += 1;
        if (Array.isArray(conversation.messages) && conversation.messages.length > 0) totals.withMessages += 1;
        totals.revenue += getConversationRevenue(conversation, tagSettings);

        const score = getScoreNumber(conversation, tagSettings);
        if (score === null) {
            totals.missingScore += 1;
        } else {
            totals.scored += 1;
            totals.scoreSum += score;
        }
    });

    return {
        ...totals,
        appointmentRate: safeDivision(totals.appointments, totals.leads) * 100,
        salesRate: safeDivision(totals.sales, totals.leads) * 100,
        responseRate: safeDivision(totals.withMessages, totals.leads) * 100,
        averageTicket: safeDivision(totals.revenue, totals.sales),
        averageScore: totals.scored > 0 ? totals.scoreSum / totals.scored : 0,
    };
};

export const getFieldsForTab = (tabId: ReportTabId, tagSettings: TagConfig) => {
    const custom = tagSettings.reportColumnFields?.[tabId];
    return custom && custom.length > 0 ? custom : DEFAULT_REPORT_COLUMN_FIELDS[tabId];
};

export const getSelectedInboxSummary = (input: DashboardReportInput) => {
    const selectedIds = input.globalFilters.selectedInboxes || [];
    if (selectedIds.length === 0) return "Todos los canales";
    const inboxMap = new Map((input.inboxes || []).map((inbox) => [Number(inbox.id), inbox]));
    return selectedIds
        .map((id) => {
            const inbox = inboxMap.get(Number(id));
            return inbox ? getInboxChannelName(inbox) || inbox.name || `Inbox ${id}` : `Inbox ${id}`;
        })
        .join(", ");
};

export const getTabInterpretation = (tabId: ReportTabId) => {
    const notes: Record<ReportTabId, string> = {
        overview: "Lectura gerencial de volumen, oportunidades, citas, ventas y monto para entender el avance comercial.",
        funnel: "Muestra avance por etapas, conversiones entre pasos y puntos donde se pierden o descartan leads.",
        operational: "Sirve para controlar respuesta, carga operativa, responsables y leads que requieren acción.",
        followup: "Resume colas humanas, citas, ventas, montos y leads que deben ser gestionados por el equipo.",
        performance: "Compara responsables por volumen, citas, ventas, pendientes y conversión.",
        trends: "Explica de dónde vienen los leads, qué campañas pesan más y cómo evolucionan ingresos y calidad.",
        scoring: "Clasifica leads en Caliente, Tibio y Frío; los leads sin puntaje entran en Frío.",
        chats: "Documenta conversaciones, estados, canales, etiquetas y mensajes disponibles para revisión o análisis.",
    };
    return notes[tabId];
};

export const getRangeLabel = (filters: DashboardFilters) => ({
    start: filters.startDate ? format(filters.startDate, "yyyy-MM-dd") : "Todo",
    end: filters.endDate ? format(filters.endDate, "yyyy-MM-dd") : "Todo",
});

export const getOwnerPerformanceRows = (dashboardData?: DashboardReportData): OwnerPerformanceRow[] =>
    (Array.isArray(dashboardData?.ownerPerformance) ? dashboardData.ownerPerformance.map(asRecord) : []) as OwnerPerformanceRow[];

export const getInboxMap = (inboxes: ReportInbox[]): InboxMap =>
    new Map((inboxes || []).map((inbox) => [Number(inbox.id), inbox]));

export const getFieldValue = (
    field: string,
    conversation: ResolvedConversation,
    inboxMap: InboxMap,
    tagSettings: TagConfig,
) => {
    const attrs = getAttrs(conversation);
    const inbox = conversation.inbox_id ? inboxMap.get(Number(conversation.inbox_id)) : undefined;
    const canal = getLeadChannelName(conversation, inbox as ReportInbox);
    const displayField = formatFieldLabel(field);

    if (displayField === "Enlace de conversación") {
        return getChatwootUrl(conversation.id) || "Importado";
    }

    switch (field) {
        case "ID": return conversation.id;
        case "Nombre": return getLeadName(conversation);
        case "Telefono": return getLeadPhone(conversation, canal);
        case "Canal": return canal;
        case "Estados":
        case "Etiquetas": return formatBusinessList(conversation.resolvedLabels?.length ? conversation.resolvedLabels : conversation.labels || []);
        case "Etapa": return formatLeadStage(conversation.resolvedStage);
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
        case "Nivel": return getScoreBucketLabel(conversation, tagSettings);
        case "Puntaje":
        case "Score": return getScoreValue(conversation, tagSettings);
        case "Ultimo Mensaje": return getMessagePreview(conversation);
        case "URL Red Social": return getLeadExternalUrl(conversation, canal);
        case "Fecha Ingreso": return formatDateTime(conversation.created_at || conversation.timestamp);
        case "Ultima Interaccion": return formatDateTime(conversation.timestamp || conversation.created_at);
        case "ID Contacto": return conversation.meta?.sender?.id || "";
        case "ID Inbox": return conversation.inbox_id || "";
        case "ID Cuenta": return (conversation as ResolvedConversation & { account_id?: unknown }).account_id || "";
        case "Origen Dato": return formatDataOrigin(conversation.source);
        default: return attrs[field] ?? attrs[field.toLowerCase()] ?? "";
    }
};
