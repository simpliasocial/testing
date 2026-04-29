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
} from "@/lib/leadDisplay";
import { formatBusinessLabel, formatBusinessList, formatFieldLabel } from "@/lib/displayCopy";
import {
    buildCommercialAuditRows,
    getCommercialSaleDate,
    getCurrentSaleAmount,
    isCurrentSale,
    parseAmount,
    type CommercialAuditEvent,
} from "@/lib/commercialFacts";
import {
    bucketFromScore,
    formatScoreValue,
    getBucketRangeLabel,
    normalizeScoreThresholds,
    parseNumericScore,
    SCORE_BUCKET_COPY,
    SCORE_BUCKET_ORDER,
    type ScoreBucket,
} from "@/lib/leadScoreClassification";

export interface ReportSection {
    title: string;
    rows: Array<Record<string, unknown>>;
    kind?: "summary" | "kpi" | "analysis" | "detail";
    sheetName?: string;
    description?: string;
}

export interface DashboardReportInput {
    title: string;
    tabIds: ReportTabId[];
    conversations: ResolvedConversation[];
    inboxes: any[];
    tagSettings: TagConfig;
    globalFilters: DashboardFilters;
    dashboardData?: any;
    commercialAuditEvents?: CommercialAuditEvent[];
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

const getScoreNumber = (conversation: ResolvedConversation, tagSettings: TagConfig) =>
    parseNumericScore(getScoreValue(conversation, tagSettings));

const getScoreBucket = (conversation: ResolvedConversation, tagSettings: TagConfig) =>
    bucketFromScore(getScoreNumber(conversation, tagSettings), normalizeScoreThresholds(tagSettings.scoreThresholds));

const getScoreBucketLabel = (conversation: ResolvedConversation, tagSettings: TagConfig) =>
    SCORE_BUCKET_COPY[getScoreBucket(conversation, tagSettings)].label;

const getCampaignValue = (conversation: ResolvedConversation) => {
    const attrs = getAttrs(conversation);
    return attrs.campana || attrs.utm_campaign || attrs.origen || "Sin campaña";
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
        case "Nivel": return getScoreBucketLabel(conversation, tagSettings);
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

const buildScoringRows = (
    conversations: ResolvedConversation[],
    inboxMap: Map<number, any>,
    tagSettings: TagConfig,
) => conversations
    .map((conversation) => {
        const inbox = conversation.inbox_id ? inboxMap.get(Number(conversation.inbox_id)) : undefined;
        const canal = getLeadChannelName(conversation, inbox);
        const score = getScoreNumber(conversation, tagSettings);
        const bucket = bucketFromScore(score, normalizeScoreThresholds(tagSettings.scoreThresholds));

        return {
            "ID Conversacion": conversation.id,
            "Nombre del Lead": getLeadName(conversation),
            Canal: canal,
            Número: getLeadPhone(conversation, canal),
            Estados: formatBusinessList(getConversationLabels(conversation), " | "),
            "Historial de mensajes": getMessagePreview(conversation),
            "URL comercial": getLeadExternalUrl(conversation, canal),
            "Enlace de conversación": getChatwootUrl(conversation.id),
            Nivel: SCORE_BUCKET_COPY[bucket].label,
            Puntaje: formatScoreValue(score),
            Campaña: getCampaignValue(conversation),
            "Fecha de ingreso": formatExcelTimestamp(conversation.created_at || conversation.timestamp),
            "Última interacción": formatExcelTimestamp(conversation.timestamp || conversation.created_at),
            "Origen del dato": formatDataOrigin(conversation.source),
        };
    })
    .sort((a, b) => {
        const scoreA = parseNumericScore(a.Puntaje) ?? Number.NEGATIVE_INFINITY;
        const scoreB = parseNumericScore(b.Puntaje) ?? Number.NEGATIVE_INFINITY;
        return scoreB - scoreA;
    });

const rowsFromArray = (items: any[] = [], labelKey = "name", valueKey = "value") =>
    items.map((item) => ({
        Nombre: labelKey === "label"
            ? formatBusinessLabel(item?.[labelKey] ?? item?.label ?? item?.date ?? item?.name ?? "")
            : item?.[labelKey] ?? item?.label ?? item?.date ?? item?.name ?? "",
        Valor: item?.[valueKey] ?? item?.count ?? item?.leads ?? item?.sales ?? 0,
        Porcentaje: item?.percentage ?? item?.rate ?? item?.winRate ?? "",
    }));

const REPORT_TIME_ZONE = "America/Guayaquil";

const currencyFormatter = new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 0 });

const decimalFormatter = new Intl.NumberFormat("es-EC", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
});

const formatIntegerValue = (value: unknown) => integerFormatter.format(numberCell(value));

const formatCurrencyValue = (value: unknown) => currencyFormatter.format(numberCell(value));

const formatPercentValue = (value: unknown) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "";
    const percent = Math.abs(numeric) > 0 && Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
    return `${decimalFormatter.format(percent)}%`;
};

const formatDuration = (seconds: unknown) => {
    const totalSeconds = Math.max(0, Math.round(numberCell(seconds)));
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
};

const formatReportDateTime = (value: unknown = new Date()) => {
    const date = value instanceof Date ? value : new Date(parseTimestampMs(value));
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("es-EC", {
        timeZone: REPORT_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
};

const ensureReportRows = (rows: Array<Record<string, unknown>>, message = "Sin datos con los filtros actuales") =>
    rows.length > 0 ? rows : [{ Estado: "Sin datos", Detalle: message }];

const withSection = (sectionName: string, rows: Array<Record<string, unknown>>) =>
    ensureReportRows(rows, `Sin datos para ${sectionName}`).map((row) => ({
        Sección: sectionName,
        ...row,
    }));

const safeDivision = (value: number, base: number) => (base > 0 ? value / base : 0);

const getResponsibleValue = (conversation: ResolvedConversation) => {
    const attrs = getAttrs(conversation);
    return attrs.responsable || conversation.meta?.assignee?.name || "Sin responsable";
};

const getConversationRevenue = (conversation: ResolvedConversation, tagSettings: TagConfig) =>
    getCurrentSaleAmount(conversation, tagSettings);

const getConversationStage = (conversation: ResolvedConversation) =>
    conversation.resolvedStage || "other";

const getReportMessageTimestampMs = (message: any) =>
    parseTimestampMs(message?.created_at_chatwoot || message?.created_at || message?.timestamp);

const isIncomingReportMessage = (message: any) =>
    message?.message_direction === "incoming" ||
    Number(message?.message_type) === 0 ||
    cleanText(message?.message_type).toLowerCase() === "incoming" ||
    cleanText(message?.sender_type).toLowerCase() === "contact";

const hasReportMessageSenderSignal = (message: any) =>
    message?.message_direction !== undefined ||
    message?.message_type !== undefined ||
    message?.sender_type !== undefined;

const getReportConversationMessages = (conversation: ResolvedConversation) =>
    Array.isArray(conversation.messages)
        ? [...conversation.messages]
            .filter((message: any) => !message?.private && !message?.is_private && getReportMessageTimestampMs(message) > 0)
            .sort((a: any, b: any) => getReportMessageTimestampMs(a) - getReportMessageTimestampMs(b))
        : [];

const hasUnansweredCustomerMessage = (conversation: ResolvedConversation) => {
    if ((conversation as any).waiting_since) return true;

    const lastNonActivityMessage = (conversation as any).last_non_activity_message;
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

const getConversationSummary = (conversations: ResolvedConversation[], tagSettings: TagConfig) => {
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

const createBucketCounter = () =>
    Object.fromEntries(SCORE_BUCKET_ORDER.map((bucket) => [bucket, 0])) as Record<ScoreBucket, number>;

const buildDimensionRows = (
    conversations: ResolvedConversation[],
    inboxMap: Map<number, any>,
    tagSettings: TagConfig,
    dimensionLabel: string,
    resolveDimension: (conversation: ResolvedConversation, inboxMap: Map<number, any>) => unknown,
) => {
    const thresholds = normalizeScoreThresholds(tagSettings.scoreThresholds);
    const grouped = new Map<string, {
        leads: number;
        sqls: number;
        appointments: number;
        sales: number;
        unanswered: number;
        revenue: number;
        scoreSum: number;
        scored: number;
        buckets: Record<ScoreBucket, number>;
    }>();

    conversations.forEach((conversation) => {
        const key = cleanText(resolveDimension(conversation, inboxMap)) || "Sin dato";
        const current = grouped.get(key) || {
            leads: 0,
            sqls: 0,
            appointments: 0,
            sales: 0,
            unanswered: 0,
            revenue: 0,
            scoreSum: 0,
            scored: 0,
            buckets: createBucketCounter(),
        };
        const stage = getConversationStage(conversation);
        const score = getScoreNumber(conversation, tagSettings);
        const bucket = bucketFromScore(score, thresholds);

        current.leads += 1;
        if (stage === "sql") current.sqls += 1;
        if (stage === "appointment") current.appointments += 1;
        if (isCurrentSale(conversation, tagSettings)) current.sales += 1;
        if (hasUnansweredCustomerMessage(conversation)) current.unanswered += 1;
        current.revenue += getConversationRevenue(conversation, tagSettings);
        current.buckets[bucket] += 1;
        if (score !== null) {
            current.scoreSum += score;
            current.scored += 1;
        }
        grouped.set(key, current);
    });

    return Array.from(grouped.entries())
        .map(([key, value]) => ({
            [dimensionLabel]: key,
            Leads: value.leads,
            SQLs: value.sqls,
            Citas: value.appointments,
            Ventas: value.sales,
            "Sin respuesta": value.unanswered,
            "Monto ventas": value.revenue,
            "Tasa cita": formatPercentValue(safeDivision(value.appointments, value.leads) * 100),
            "Tasa venta": formatPercentValue(safeDivision(value.sales, value.leads) * 100),
            "Puntaje promedio": value.scored > 0 ? Number((value.scoreSum / value.scored).toFixed(2)) : "",
            Caliente: value.buckets.hot,
            Tibio: value.buckets.warm,
            Frío: value.buckets.cold,
            Bajo: value.buckets.low,
        }))
        .sort((a, b) => numberCell(b.Leads) - numberCell(a.Leads));
};

const buildStatusRows = (conversations: ResolvedConversation[]) => {
    const grouped = new Map<string, number>();
    conversations.forEach((conversation) => {
        const status = formatConversationStatus(conversation.status) || "Sin estado";
        grouped.set(status, (grouped.get(status) || 0) + 1);
    });
    return Array.from(grouped.entries())
        .map(([Estado, Leads]) => ({ Estado, Leads }))
        .sort((a, b) => b.Leads - a.Leads);
};

const buildStageRows = (conversations: ResolvedConversation[]) => {
    const grouped = new Map<string, number>();
    conversations.forEach((conversation) => {
        const stage = STAGE_LABELS[getConversationStage(conversation)] || "Otro";
        grouped.set(stage, (grouped.get(stage) || 0) + 1);
    });
    return Array.from(grouped.entries())
        .map(([Etapa, Leads]) => ({ Etapa, Leads }))
        .sort((a, b) => b.Leads - a.Leads);
};

const buildLabelRows = (conversations: ResolvedConversation[]) => {
    const grouped = new Map<string, number>();
    conversations.forEach((conversation) => {
        getConversationLabels(conversation).forEach((label) => {
            const display = formatBusinessLabel(label) || "Sin etiqueta";
            grouped.set(display, (grouped.get(display) || 0) + 1);
        });
    });
    return Array.from(grouped.entries())
        .map(([Etiqueta, Leads]) => ({ Etiqueta, Leads }))
        .sort((a, b) => b.Leads - a.Leads);
};

const buildSourceRows = (conversations: ResolvedConversation[]) => {
    const grouped = new Map<string, number>();
    conversations.forEach((conversation) => {
        const source = formatDataOrigin(conversation.source) || "Sin origen";
        grouped.set(source, (grouped.get(source) || 0) + 1);
    });
    return Array.from(grouped.entries())
        .map(([Origen, Leads]) => ({ Origen, Leads }))
        .sort((a, b) => b.Leads - a.Leads);
};

const buildQualityDistributionRows = (conversations: ResolvedConversation[], tagSettings: TagConfig) => {
    const thresholds = normalizeScoreThresholds(tagSettings.scoreThresholds);
    const bucketCounts = new Map<ScoreBucket, number>(SCORE_BUCKET_ORDER.map((bucket) => [bucket, 0]));
    let missingScoreCount = 0;

    conversations.forEach((conversation) => {
        const score = getScoreNumber(conversation, tagSettings);
        const bucket = bucketFromScore(score, thresholds);
        bucketCounts.set(bucket, (bucketCounts.get(bucket) || 0) + 1);
        if (score === null) missingScoreCount += 1;
    });

    return SCORE_BUCKET_ORDER.map((bucket) => ({
        Nivel: SCORE_BUCKET_COPY[bucket].label,
        Rango: getBucketRangeLabel(bucket, thresholds),
        Leads: bucketCounts.get(bucket) || 0,
        Porcentaje: formatPercentValue(safeDivision(bucketCounts.get(bucket) || 0, conversations.length) * 100),
        "Sin puntaje incluidos": bucket === "low" ? missingScoreCount : "",
    }));
};

const buildQualityConfigRows = (conversations: ResolvedConversation[], tagSettings: TagConfig) => {
    const thresholds = normalizeScoreThresholds(tagSettings.scoreThresholds);
    const scoreField = cleanText(tagSettings.scoreAttributeKey) || "score / lead_score / puntaje";
    const missingScoreCount = conversations.filter((conversation) => getScoreNumber(conversation, tagSettings) === null).length;

    return [
        { Metrica: "Campo de puntaje usado", Valor: scoreField },
        { Metrica: "Total encontrados", Valor: conversations.length },
        { Metrica: "Sin puntaje incluidos en Bajo", Valor: missingScoreCount },
        { Metrica: "Desde Caliente", Valor: thresholds.hotMin },
        { Metrica: "Desde Tibio", Valor: thresholds.warmMin },
        { Metrica: "Desde Frío", Valor: thresholds.coldMin },
        { Metrica: "Rangos usados", Valor: SCORE_BUCKET_ORDER.map((bucket) => `${SCORE_BUCKET_COPY[bucket].label}: ${getBucketRangeLabel(bucket, thresholds)}`).join(" | ") },
    ];
};

const buildFunnelRows = (items: any[] = [], sectionName: string) =>
    rowsFromArray(items, "label", "value").map((row, index) => ({
        Sección: sectionName,
        Orden: index + 1,
        Etapa: row.Nombre,
        Leads: row.Valor,
        Porcentaje: formatPercentValue(row.Porcentaje),
    }));

const buildFunnelConversionRows = (items: any[] = []) => {
    const normalized = rowsFromArray(items, "label", "value");
    return normalized.slice(1).map((row, index) => {
        const previous = normalized[index];
        const current = numberCell(row.Valor);
        const base = numberCell(previous?.Valor);
        return {
            Desde: previous?.Nombre || "",
            Hacia: row.Nombre,
            "Base anterior": base,
            Resultado: current,
            Conversión: formatPercentValue(safeDivision(current, base) * 100),
        };
    });
};

const buildNamedValueRows = (
    items: any[] = [],
    nameLabel: string,
    valueLabel: string,
    labelKey = "name",
    valueKey = "value",
) => rowsFromArray(items, labelKey, valueKey).map((row) => ({
    [nameLabel]: row.Nombre,
    [valueLabel]: row.Valor,
    Porcentaje: formatPercentValue(row.Porcentaje),
}));

const getSelectedInboxSummary = (input: DashboardReportInput) => {
    const selectedIds = input.globalFilters.selectedInboxes || [];
    if (selectedIds.length === 0) return "Todos los canales";
    const inboxMap = getInboxMap(input.inboxes);
    return selectedIds
        .map((id) => {
            const inbox = inboxMap.get(Number(id));
            return inbox ? getInboxChannelName(inbox) || inbox.name || `Inbox ${id}` : `Inbox ${id}`;
        })
        .join(", ");
};

const getTabInterpretation = (tabId: ReportTabId) => {
    const notes: Record<ReportTabId, string> = {
        overview: "Lectura gerencial de volumen, oportunidades, citas, ventas y monto para entender el avance comercial.",
        funnel: "Muestra avance por etapas, conversiones entre pasos y puntos donde se pierden o descartan leads.",
        operational: "Sirve para controlar respuesta, carga operativa, responsables y leads que requieren acción.",
        followup: "Resume colas humanas, citas, ventas, montos y leads que deben ser gestionados por el equipo.",
        performance: "Compara responsables por volumen, citas, ventas, pendientes y conversión.",
        trends: "Explica de dónde vienen los leads, qué campañas pesan más y cómo evolucionan ingresos y calidad.",
        scoring: "Clasifica leads en Caliente, Tibio, Frío y Bajo; los leads sin puntaje entran en Bajo.",
        chats: "Documenta conversaciones, estados, canales, etiquetas y mensajes disponibles para revisión o análisis.",
    };
    return notes[tabId];
};

const buildSummaryRows = (
    input: DashboardReportInput,
    tabId: ReportTabId,
    conversations: ResolvedConversation[],
) => {
    const { start, end } = getRangeLabel(input.globalFilters);
    const selectedTabs = input.tabIds.map((id) => REPORT_TAB_LABELS[id]).join(", ");

    return [
        { Campo: "Reporte", Valor: input.title },
        { Campo: "Pestaña", Valor: REPORT_TAB_LABELS[tabId] },
        { Campo: "Pestañas solicitadas", Valor: selectedTabs },
        { Campo: "Periodo", Valor: `${start} a ${end}` },
        { Campo: "Canales filtrados", Valor: getSelectedInboxSummary(input) },
        { Campo: "Generado", Valor: formatReportDateTime() },
        { Campo: "Zona horaria", Valor: REPORT_TIME_ZONE },
        { Campo: "Total encontrado", Valor: conversations.length },
        { Campo: "Datos incluidos", Valor: "Resumen ejecutivo, KPIs, análisis por dimensión, cambios relevantes cuando existan y detalle de leads." },
        { Campo: "Lectura recomendada", Valor: getTabInterpretation(tabId) },
        { Campo: "Nota de uso", Valor: "Excel y CSV contienen el detalle completo; PDF prioriza lectura ejecutiva y puede recortar tablas largas." },
    ];
};

const metricRow = (Metrica: string, Valor: unknown, Formula: string, Interpretación: string) => ({
    Metrica,
    Valor,
    Formula,
    Interpretación,
});

const buildKpiRows = (
    tabId: ReportTabId,
    conversations: ResolvedConversation[],
    inboxMap: Map<number, any>,
    dashboardData: any,
    tagSettings: TagConfig,
) => {
    const kpis = dashboardData?.kpis || {};
    const operational = dashboardData?.operationalMetrics || {};
    const human = dashboardData?.humanMetrics || {};
    const totals = getConversationSummary(conversations, tagSettings);

    if (tabId === "overview") {
        return [
            metricRow("Total leads", numberCell(kpis.totalLeads || totals.leads), "Leads creados en el periodo filtrado", "Volumen total de oportunidades recibidas."),
            metricRow("SQLs", numberCell(kpis.interestedLeads || totals.sqls), "Leads en etapa SQL/interesado", "Oportunidades con señal comercial clara."),
            metricRow("Citas agendadas", numberCell(kpis.scheduledAppointments || totals.appointments), "Leads que llegaron a cita", "Paso clave antes de venta o cierre."),
            metricRow("Ventas exitosas", numberCell(kpis.closedSales || totals.sales), "Leads cerrados como venta", "Resultado comercial final del periodo."),
            metricRow("Tasa de cita", formatPercentValue(kpis.schedulingRate || totals.appointmentRate), "Citas / Leads", "Eficiencia para convertir leads en citas."),
            metricRow("Tasa de venta", formatPercentValue(totals.salesRate), "Ventas / Leads", "Eficiencia general del embudo."),
            metricRow("Monto periodo", formatCurrencyValue(kpis.monthlyProfit || totals.revenue), "Suma de montos de venta", "Ingreso atribuido al periodo filtrado."),
            metricRow("Monto total", formatCurrencyValue(kpis.totalProfit || totals.revenue), "Suma total disponible", "Referencia de ingreso acumulado disponible en datos."),
        ];
    }

    if (tabId === "funnel") {
        return [
            metricRow("Leads en embudo", totals.leads, "Total filtrado", "Base sobre la que se calculan las tasas."),
            metricRow("SQLs", numberCell(kpis.interestedLeads || totals.sqls), "Leads interesados/SQL", "Primer nivel de intención comercial."),
            metricRow("Citas", numberCell(kpis.scheduledAppointments || totals.appointments), "Leads con cita", "Conversión intermedia relevante."),
            metricRow("Ventas", numberCell(kpis.closedSales || totals.sales), "Leads con venta", "Cierres comerciales."),
            metricRow("Descartados", numberCell(kpis.unqualified || totals.unqualified), "Leads no calificados", "Pérdidas o leads fuera de perfil."),
            metricRow("Conversión lead a venta", formatPercentValue(totals.salesRate), "Ventas / Leads", "Lectura de salud del embudo."),
        ];
    }

    if (tabId === "operational") {
        return [
            metricRow("Promedio primera respuesta", formatDuration(operational.firstResponseAverageSeconds), "Tiempo medio hasta primera respuesta", "Velocidad operativa de atención."),
            metricRow("Mediana primera respuesta", formatDuration(operational.firstResponseMedianSeconds), "Mediana de muestras válidas", "Referencia menos sensible a casos extremos."),
            metricRow("Leads con responsable", numberCell(operational.leadsWithOwnerCount), "Leads asignados", "Cobertura de asignación del equipo."),
            metricRow("Asignación", formatPercentValue(operational.leadsWithOwnerPercentage), "Leads con responsable / total", "Qué tan ordenada está la carga comercial."),
            metricRow("Leads sin respuesta", numberCell(operational.leadsSinRespuesta ?? totals.noResponse), "Última interacción del cliente sin respuesta posterior", "Misma lógica usada por la tarjeta de Operación."),
            metricRow("Leads activos", totals.unresolved, "Leads no resueltos", "Carga viva del periodo."),
        ];
    }

    if (tabId === "followup") {
        return [
            metricRow("Cola de seguimiento", numberCell(human.followupCurrent ?? human.followup ?? totals.followups), "Leads con etiquetas de seguimiento", "Trabajo pendiente para gestión humana."),
            metricRow("Conversiones a cita", numberCell(human.humanAppointmentConversions || human.appointments || totals.appointments), "Seguimientos que pasaron a cita", "Efectividad del equipo humano."),
            metricRow("Tasa conversión seguimiento", formatPercentValue(human.humanAppointmentConversionRate || human.conversionRate), "Citas humanas / cola gestionada", "Calidad de la gestión humana."),
            metricRow("Ventas humanas", numberCell(human.salesCount || totals.sales), "Ventas con etiqueta objetivo", "Cierres atribuibles a gestión humana."),
            metricRow("Volumen ventas", formatCurrencyValue(human.salesVolume || totals.revenue), "Suma de montos de venta", "Impacto económico del seguimiento."),
            metricRow("Ticket promedio", formatCurrencyValue(human.averageTicket || totals.averageTicket), "Monto ventas / ventas", "Valor medio de cierre."),
        ];
    }

    if (tabId === "performance") {
        const owners = Array.isArray(dashboardData?.ownerPerformance) ? dashboardData.ownerPerformance : [];
        const bestOwner = [...owners].sort((a: any, b: any) => numberCell(b.appointments) - numberCell(a.appointments))[0];
        const followupCount = numberCell(human.followupCurrent ?? human.followup ?? totals.followups);
        const humanAppointments = numberCell(human.humanAppointmentConversions ?? human.appointments ?? totals.appointments);
        const humanConversion = human.humanAppointmentConversionRate ?? human.conversionRate ?? safeDivision(humanAppointments, followupCount + humanAppointments) * 100;
        const humanSales = numberCell(human.salesCount ?? totals.sales);
        const humanRevenue = human.salesVolume ?? totals.revenue;
        const humanAverageTicket = human.averageTicket ?? totals.averageTicket;
        return [
            metricRow("Responsables con actividad", owners.length || new Set(conversations.map(getResponsibleValue)).size, "Responsables únicos", "Cobertura de trabajo humano."),
            metricRow("Seguimiento", followupCount, "Leads en seguimiento humano", "Trabajo gestionado por el equipo."),
            metricRow("Citas humanas", humanAppointments, "Leads que llegaron a cita", "Resultado directo del seguimiento."),
            metricRow("Conversión", formatPercentValue(humanConversion), "Citas / (seguimiento + citas)", "Mismo cálculo visible en Rendimiento Humano."),
            metricRow("Ventas", humanSales, "Leads vendidos", "Cierres por equipo."),
            metricRow("Total vendido", formatCurrencyValue(humanRevenue), "Suma de montos de venta", "Ingreso atribuido a ventas."),
            metricRow("Ticket promedio", formatCurrencyValue(humanAverageTicket), "Total vendido / ventas", "Valor promedio de cierre."),
            metricRow("Mejor responsable por citas", bestOwner?.name || "Sin dato", "Ranking por citas", "Referencia rápida del responsable con mayor resultado."),
        ];
    }

    if (tabId === "trends") {
        return [
            metricRow("Leads analizados", totals.leads, "Total filtrado", "Base de tendencias."),
            metricRow("Canales con leads", new Set(conversations.map((conversation) => getFieldValue("Canal", conversation, inboxMap, tagSettings))).size, "Canales distintos", "Diversidad de origen comercial."),
            metricRow("Campañas con leads", new Set(conversations.map(getCampaignValue)).size, "Campañas distintas", "Diversidad de campaña/origen."),
            metricRow("Ingresos detectados", formatCurrencyValue(totals.revenue), "Suma de ventas", "Impacto económico de las tendencias."),
            metricRow("Puntaje promedio", totals.scored > 0 ? Number(totals.averageScore.toFixed(2)) : "Sin puntajes", "Promedio de leads con score", "Calidad media de leads con dato disponible."),
        ];
    }

    if (tabId === "scoring") {
        const thresholds = normalizeScoreThresholds(tagSettings.scoreThresholds);
        return [
            metricRow("Leads evaluados", totals.leads, "Total filtrado", "Leads considerados para calidad."),
            metricRow("Con puntaje", totals.scored, "Leads con score numérico", "Base con dato real de scoring."),
            metricRow("Sin puntaje", totals.missingScore, "Leads sin score", "Se clasifican como Bajo para no quedar fuera del reporte."),
            metricRow("Puntaje promedio", totals.scored > 0 ? Number(totals.averageScore.toFixed(2)) : "Sin puntajes", "Promedio de puntajes", "Lectura general de calidad."),
            metricRow("Rangos activos", `Caliente ${thresholds.hotMin}+ | Tibio ${thresholds.warmMin}-${thresholds.hotMin - 1} | Frío ${thresholds.coldMin}-${thresholds.warmMin - 1} | Bajo <${thresholds.coldMin}`, "Configuración admin", "Rangos usados en tabla, KPIs, gráficas y exportes."),
        ];
    }

    return [
        metricRow("Conversaciones exportadas", totals.leads, "Total filtrado", "Conversaciones incluidas en el reporte."),
        metricRow("Con mensajes cargados", totals.withMessages, "Conversaciones con historial de mensajes", "Disponibilidad de contexto conversacional."),
        metricRow("Canales", new Set(conversations.map((conversation) => getFieldValue("Canal", conversation, inboxMap, tagSettings))).size, "Canales distintos", "Cobertura de origen."),
        metricRow("Estados distintos", new Set(conversations.map((conversation) => formatConversationStatus(conversation.status))).size, "Estados Chatwoot", "Variedad de estados operativos."),
    ];
};

const buildAnalysisRows = (
    tabId: ReportTabId,
    conversations: ResolvedConversation[],
    inboxMap: Map<number, any>,
    dashboardData: any,
    tagSettings: TagConfig,
) => {
    const trends = dashboardData?.trendMetrics || {};
    const addRows: Array<Record<string, unknown>> = [];
    const add = (sectionName: string, rows: Array<Record<string, unknown>>) => {
        addRows.push(...withSection(sectionName, rows));
    };

    if (tabId === "overview") {
        add("Embudo resumido", buildFunnelRows(dashboardData?.funnelData || [], "Embudo resumido").map(({ Sección, ...row }) => row));
        add("Leads por canal", buildDimensionRows(conversations, inboxMap, tagSettings, "Canal", (conversation, map) => {
            const inbox = conversation.inbox_id ? map.get(Number(conversation.inbox_id)) : undefined;
            return getLeadChannelName(conversation, inbox);
        }));
        add("Detalle comercial por campaña", buildDimensionRows(conversations, inboxMap, tagSettings, "Campaña", getCampaignValue));
        return addRows;
    }

    if (tabId === "funnel") {
        add("Embudo actual", buildFunnelRows(dashboardData?.funnelData || [], "Embudo actual").map(({ Sección, ...row }) => row));
        add("Embudo histórico", buildFunnelRows(dashboardData?.historicalFunnelData || [], "Embudo histórico").map(({ Sección, ...row }) => row));
        add("Conversión entre etapas", buildFunnelConversionRows(dashboardData?.funnelData || []));
        add("Distribución por etapa", buildStageRows(conversations));
        add("Pérdidas y descalificación", buildNamedValueRows(dashboardData?.disqualificationReasons || trends.disqualificationStats || [], "Motivo", "Leads"));
        return addRows;
    }

    if (tabId === "operational") {
        add("Carga por responsable", buildDimensionRows(conversations, inboxMap, tagSettings, "Responsable", getResponsibleValue));
        add("Carga por canal", buildDimensionRows(conversations, inboxMap, tagSettings, "Canal", (conversation, map) => {
            const inbox = conversation.inbox_id ? map.get(Number(conversation.inbox_id)) : undefined;
            return getLeadChannelName(conversation, inbox);
        }));
        add("Estados operativos", buildStatusRows(conversations));
        add("Origen de datos", buildSourceRows(conversations));
        return addRows;
    }

    if (tabId === "followup") {
        const saleConversations = filterSalesConversations(conversations, { selectedInboxes: [] }, tagSettings);
        add("Colas por etapa", buildStageRows(conversations));
        add("Ventas por canal", buildDimensionRows(saleConversations, inboxMap, tagSettings, "Canal", (conversation, map) => {
            const inbox = conversation.inbox_id ? map.get(Number(conversation.inbox_id)) : undefined;
            return getLeadChannelName(conversation, inbox);
        }));
        add("Ventas por día", buildNamedValueRows(dashboardData?.humanMetrics?.salesByDate || [], "Fecha", "Ventas", "date", "sales"));
        add("Detalle por responsable", buildDimensionRows(conversations, inboxMap, tagSettings, "Responsable", getResponsibleValue));
        return addRows;
    }

    if (tabId === "performance") {
        add("Ranking por responsable", (dashboardData?.ownerPerformance || []).map((owner: any) => ({
            Responsable: owner.name || "Sin responsable",
            Leads: owner.leads || 0,
            Citas: owner.appointments || 0,
            "Sin respuesta": owner.unanswered || 0,
            Conversión: formatPercentValue(owner.winRate || 0),
            Origen: owner.source || "",
        })));
        add("Detalle por responsable", buildDimensionRows(conversations, inboxMap, tagSettings, "Responsable", getResponsibleValue));
        return addRows;
    }

    if (tabId === "trends") {
        add("Leads por canal", buildNamedValueRows(trends.channelLeads || dashboardData?.channelData || [], "Canal", "Leads"));
        add("Campañas", buildNamedValueRows(dashboardData?.campaignData || trends.campaignList || [], "Campaña", "Leads", "name", "leads"));
        add("Ingresos por periodo", buildNamedValueRows(trends.revenuePeaks || trends.revenuePeakDays || [], "Periodo", "Monto", "date", "value"));
        add("Calidad por canal", buildDimensionRows(conversations, inboxMap, tagSettings, "Canal", (conversation, map) => {
            const inbox = conversation.inbox_id ? map.get(Number(conversation.inbox_id)) : undefined;
            return getLeadChannelName(conversation, inbox);
        }));
        return addRows;
    }

    if (tabId === "scoring") {
        add("Rangos usados", buildQualityConfigRows(conversations, tagSettings));
        add("Distribución de calidad", buildQualityDistributionRows(conversations, tagSettings));
        add("Promedio por canal", buildDimensionRows(conversations, inboxMap, tagSettings, "Canal", (conversation, map) => {
            const inbox = conversation.inbox_id ? map.get(Number(conversation.inbox_id)) : undefined;
            return getLeadChannelName(conversation, inbox);
        }));
        add("Promedio por campaña", buildDimensionRows(conversations, inboxMap, tagSettings, "Campaña", getCampaignValue));
        add("Promedio por estado", buildDimensionRows(conversations, inboxMap, tagSettings, "Estado", (conversation) => formatConversationStatus(conversation.status)));
        return addRows;
    }

    add("Estados de conversación", buildStatusRows(conversations));
    add("Canales", buildDimensionRows(conversations, inboxMap, tagSettings, "Canal", (conversation, map) => {
        const inbox = conversation.inbox_id ? map.get(Number(conversation.inbox_id)) : undefined;
        return getLeadChannelName(conversation, inbox);
    }));
    add("Etiquetas", buildLabelRows(conversations));
    add("Origen de datos", buildSourceRows(conversations));
    return addRows;
};

const getSheetNameForSection = (tabId: ReportTabId, baseName: string, isSingleTab: boolean) =>
    isSingleTab ? baseName : `${REPORT_TAB_LABELS[tabId]} ${baseName}`;

const buildTabReportSections = (
    input: DashboardReportInput,
    tabId: ReportTabId,
    filteredConversations: ResolvedConversation[],
    inboxMap: Map<number, any>,
): ReportSection[] => {
    const tabLabel = REPORT_TAB_LABELS[tabId];
    const isSingleTab = input.tabIds.length === 1;
    const auditEvents = input.commercialAuditEvents || [];
    const auditRows = buildCommercialAuditRows(filteredConversations, auditEvents, input.tagSettings);
    const detailRows = tabId === "scoring"
        ? buildScoringRows(filteredConversations, inboxMap, input.tagSettings)
        : buildConversationRows(tabId, filteredConversations, inboxMap, input.tagSettings);

    const sections: ReportSection[] = [
        {
            title: `${tabLabel} - 00 Resumen`,
            sheetName: getSheetNameForSection(tabId, "00 Resumen", isSingleTab),
            kind: "summary",
            description: "Contexto del reporte, filtros aplicados, fecha de generación y notas de lectura.",
            rows: ensureReportRows(buildSummaryRows(input, tabId, filteredConversations)),
        },
        {
            title: `${tabLabel} - 01 KPIs`,
            sheetName: getSheetNameForSection(tabId, "01 KPIs", isSingleTab),
            kind: "kpi",
            description: "Métricas principales con fórmula e interpretación para lectura gerencial.",
            rows: ensureReportRows(buildKpiRows(tabId, filteredConversations, inboxMap, input.dashboardData, input.tagSettings)),
        },
        {
            title: `${tabLabel} - 02 Analisis`,
            sheetName: getSheetNameForSection(tabId, "02 Analisis", isSingleTab),
            kind: "analysis",
            description: "Cortes por canal, campaña, etapa, responsable, estado o calidad según la pestaña.",
            rows: ensureReportRows(buildAnalysisRows(tabId, filteredConversations, inboxMap, input.dashboardData, input.tagSettings)),
        },
    ];

    if (auditRows.length > 0) {
        sections.push({
            title: `${tabLabel} - 03 Cambios relevantes`,
            sheetName: getSheetNameForSection(tabId, "03 Cambios relevantes", isSingleTab),
            kind: "analysis",
            description: "Cambios comerciales importantes que ayudan a entender ventas y montos del reporte.",
            rows: auditRows,
        });
    }

    sections.push(
        {
            title: `${tabLabel} - 99 Detalle`,
            sheetName: getSheetNameForSection(tabId, "99 Detalle", isSingleTab),
            kind: "detail",
            description: "Filas completas listas para filtrar, revisar o cruzar con otras fuentes.",
            rows: ensureReportRows(detailRows, "No hay leads en el detalle con los filtros actuales."),
        },
    );

    return sections;
};

export const buildDashboardReportSections = (input: DashboardReportInput): ReportSection[] => {
    const filteredConversations = filterReportConversations(input.conversations, input.globalFilters);
    const inboxMap = getInboxMap(input.inboxes);

    return input.tabIds.flatMap((tabId) =>
        buildTabReportSections(input, tabId, filteredConversations, inboxMap)
    );
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
    return getCommercialSaleDate(conversation, (value) => new Date(parseTimestampMs(value))).getTime();
};

const filterSalesConversations = (conversations: ResolvedConversation[], filters: DashboardFilters, tagSettings: TagConfig) => {
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

const getSectionColumns = (section: ReportSection) =>
    Array.from(new Set(section.rows.flatMap((row) => Object.keys(row))));

const sectionToCsv = (section: ReportSection) => {
    const columns = getSectionColumns(section);
    const lines = [
        [csvEscape("Seccion"), csvEscape(section.title)].join(","),
        [csvEscape("Tipo"), csvEscape(section.kind || "datos")].join(","),
        [csvEscape("Descripcion"), csvEscape(section.description || "")].join(","),
        columns.map(csvEscape).join(","),
        ...section.rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
    ];
    return lines.join("\n");
};

const exportCsv = (sections: ReportSection[], fileName: string) => {
    const csv = sections.map(sectionToCsv).join("\n\n");
    downloadBlob(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }), fileName);
};

const getColumnWidths = (rows: Array<Record<string, unknown>>, columns: string[]) =>
    columns.map((column) => {
        const maxContentLength = rows.reduce((max, row) => Math.max(max, normalizeCell(row[column]).length), column.length);
        return { wch: Math.min(48, Math.max(14, maxContentLength + 2)) };
    });

const getUniqueSheetName = (name: string, usedNames: Set<string>) => {
    const base = safeSheetName(name).slice(0, 31);
    if (!usedNames.has(base)) {
        usedNames.add(base);
        return base;
    }

    let index = 2;
    while (true) {
        const suffix = ` ${index}`;
        const candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
        if (!usedNames.has(candidate)) {
            usedNames.add(candidate);
            return candidate;
        }
        index += 1;
    }
};

const exportExcel = (sections: ReportSection[], fileName: string) => {
    const workbook = xlsx.utils.book_new();
    const usedNames = new Set<string>();
    sections.forEach((section, index) => {
        const columns = getSectionColumns(section);
        const worksheet = xlsx.utils.json_to_sheet(section.rows, { header: columns });
        if (worksheet["!ref"]) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
        worksheet["!cols"] = getColumnWidths(section.rows, columns);
        xlsx.utils.book_append_sheet(workbook, worksheet, getUniqueSheetName(section.sheetName || `${index + 1} ${section.title}`, usedNames));
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
        "Reporte ejecutivo del dashboard",
        `Generado: ${formatReportDateTime()}`,
        `Zona horaria: ${REPORT_TIME_ZONE}`,
        "Nota: el PDF prioriza lectura ejecutiva. El detalle completo y filtrable vive en Excel/CSV.",
        "",
    ];

    sections.forEach((section) => {
        lines.push(section.title);
        if (section.description) lines.push(section.description);
        const columns = getSectionColumns(section).slice(0, section.kind === "detail" ? 8 : 10);
        const rowLimit = section.kind === "detail" ? 40 : 120;
        if (columns.length > 0) lines.push(columns.join(" | "));
        section.rows.slice(0, rowLimit).forEach((row) => {
            lines.push(columns.map((column) => normalizeCell(row[column])).join(" | "));
        });
        if (section.rows.length > rowLimit) lines.push(`... ${section.rows.length - rowLimit} filas adicionales en Excel/CSV`);
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
