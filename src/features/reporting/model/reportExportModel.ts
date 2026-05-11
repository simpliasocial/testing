import { formatBusinessLabel } from "../../../lib/displayCopy";
import {
    bucketFromScore,
    getBucketRangeLabel,
    normalizeScoreThresholds,
    SCORE_BUCKET_ORDER,
    type ScoreBucket,
    type ScoreThresholds,
} from "../../../domain/lead";
import {
    cleanReportText,
    endOfLocalDay,
    normalizeCell,
    numberCell,
    parseTimestampMs,
    safeFilePart,
    safeSheetName,
    startOfLocalDay,
} from "../../../shared/report/reportFormatting";

export {
    cleanReportText,
    endOfLocalDay,
    normalizeCell,
    numberCell,
    parseTimestampMs,
    safeFilePart,
    safeSheetName,
    startOfLocalDay,
} from "../../../shared/report/reportFormatting";

export const REPORT_STAGE_LABELS: Record<string, string> = {
    sale: "Venta exitosa",
    appointment: "Cita agendada",
    unqualified: "No calificado",
    followup: "Seguimiento humano",
    sql: "SQL",
    other: "Otro",
};

export const formatLeadStage = (value: unknown) => {
    const stage = cleanReportText(value);
    return REPORT_STAGE_LABELS[stage] || stage || "Otro";
};

export interface ReportDateInboxFilters {
    startDate?: Date;
    endDate?: Date;
    selectedInboxes?: number[];
}

export interface ReportConversationFilterItem {
    inbox_id?: unknown;
    created_at?: unknown;
    timestamp?: unknown;
}

export const filterReportConversations = <TConversation extends ReportConversationFilterItem>(
    conversations: TConversation[],
    filters: ReportDateInboxFilters,
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

export const safeDivision = (value: number, base: number) => (base > 0 ? value / base : 0);

const currencyFormatter = new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const decimalFormatter = new Intl.NumberFormat("es-EC", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
});

export const formatCurrencyValue = (value: unknown) => currencyFormatter.format(numberCell(value));

export const formatPercentValue = (value: unknown) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "";
    const percent = Math.abs(numeric) > 0 && Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
    return `${decimalFormatter.format(percent)}%`;
};

export const formatDuration = (seconds: unknown) => {
    const totalSeconds = Math.max(0, Math.round(numberCell(seconds)));
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
};

export const ensureReportRows = (
    rows: Array<Record<string, unknown>>,
    message = "Sin datos con los filtros actuales",
) => rows.length > 0 ? rows : [{ Estado: "Sin datos", Detalle: message }];

export const withSection = (sectionName: string, rows: Array<Record<string, unknown>>) =>
    ensureReportRows(rows, `Sin datos para ${sectionName}`).map((row) => ({
        Sección: sectionName,
        ...row,
    }));

export const rowsFromArray = (
    items: Array<Record<string, unknown>> = [],
    labelKey = "name",
    valueKey = "value",
) =>
    items.map((item) => ({
        Nombre: labelKey === "label"
            ? formatBusinessLabel(item?.[labelKey] ?? item?.label ?? item?.date ?? item?.name ?? "")
            : item?.[labelKey] ?? item?.label ?? item?.date ?? item?.name ?? "",
        Valor: item?.[valueKey] ?? item?.count ?? item?.leads ?? item?.sales ?? 0,
        Porcentaje: item?.percentage ?? item?.rate ?? item?.winRate ?? "",
    }));

export interface ReportLabelItem {
    labels?: string[];
    resolvedLabels?: string[];
}

export interface ReportDistributionItem extends ReportLabelItem {
    resolvedStage?: unknown;
    status?: unknown;
    source?: unknown;
}

const countRows = (
    values: unknown[],
    keyName: string,
    fallback: string,
    formatValue: (value: unknown) => string,
) => {
    const grouped = new Map<string, number>();
    values.forEach((value) => {
        const display = formatValue(value) || fallback;
        grouped.set(display, (grouped.get(display) || 0) + 1);
    });

    return Array.from(grouped.entries())
        .map(([label, Leads]) => ({ [keyName]: label, Leads }))
        .sort((a, b) => b.Leads - a.Leads);
};

export const getReportConversationLabels = (conversation: ReportLabelItem) =>
    conversation.resolvedLabels?.length
        ? conversation.resolvedLabels
        : conversation.labels || [];

export const buildStatusRows = (conversations: ReportDistributionItem[]) =>
    countRows(conversations.map((conversation) => conversation.status), "Estado", "Sin estado", formatConversationStatus);

export const buildStageRows = (conversations: ReportDistributionItem[]) =>
    countRows(conversations.map((conversation) => conversation.resolvedStage), "Etapa", "Otro", formatLeadStage);

export const buildLabelRows = (conversations: ReportDistributionItem[]) =>
    countRows(conversations.flatMap(getReportConversationLabels), "Etiqueta", "Sin etiqueta", formatBusinessLabel);

export const buildSourceRows = (conversations: ReportDistributionItem[]) =>
    countRows(conversations.map((conversation) => conversation.source), "Origen", "Sin origen", formatDataOrigin);

const REPORT_SCORE_BUCKET_LABELS: Record<ScoreBucket, string> = {
    hot: "Caliente",
    warm: "Tibio",
    cold: "Frío",
};

export interface ReportQualityItem {
    score: number | null;
}

export interface ReportQualityConfig {
    scoreAttributeKey?: unknown;
    scoreThresholds?: Partial<ScoreThresholds> | null;
}

export const buildQualityDistributionRows = (
    items: ReportQualityItem[],
    config: ReportQualityConfig = {},
) => {
    const thresholds = normalizeScoreThresholds(config.scoreThresholds);
    const bucketCounts = new Map<ScoreBucket, number>(SCORE_BUCKET_ORDER.map((bucket) => [bucket, 0]));
    let missingScoreCount = 0;

    items.forEach((item) => {
        const bucket = bucketFromScore(item.score, thresholds);
        bucketCounts.set(bucket, (bucketCounts.get(bucket) || 0) + 1);
        if (item.score === null) missingScoreCount += 1;
    });

    return SCORE_BUCKET_ORDER.map((bucket) => ({
        Nivel: REPORT_SCORE_BUCKET_LABELS[bucket],
        Rango: getBucketRangeLabel(bucket, thresholds),
        Leads: bucketCounts.get(bucket) || 0,
        Porcentaje: formatPercentValue(safeDivision(bucketCounts.get(bucket) || 0, items.length) * 100),
        "Sin puntaje incluidos": bucket === "cold" ? missingScoreCount : "",
    }));
};

export const buildQualityConfigRows = (
    items: ReportQualityItem[],
    config: ReportQualityConfig = {},
) => {
    const thresholds = normalizeScoreThresholds(config.scoreThresholds);
    const scoreField = cleanReportText(config.scoreAttributeKey) || "score / lead_score / puntaje";
    const missingScoreCount = items.filter((item) => item.score === null).length;

    return [
        { Metrica: "Campo de puntaje usado", Valor: scoreField },
        { Metrica: "Total encontrados", Valor: items.length },
        { Metrica: "Sin puntaje incluidos en Frío", Valor: missingScoreCount },
        { Metrica: "Desde Caliente", Valor: thresholds.hotMin },
        { Metrica: "Desde Tibio", Valor: thresholds.warmMin },
        { Metrica: "Rangos usados", Valor: SCORE_BUCKET_ORDER.map((bucket) => `${REPORT_SCORE_BUCKET_LABELS[bucket]}: ${getBucketRangeLabel(bucket, thresholds)}`).join(" | ") },
    ];
};

export const buildFunnelRows = (items: Array<Record<string, unknown>> = [], sectionName: string) =>
    rowsFromArray(items, "label", "value").map((row, index) => ({
        Sección: sectionName,
        Orden: index + 1,
        Etapa: row.Nombre,
        Leads: row.Valor,
        Porcentaje: formatPercentValue(row.Porcentaje),
    }));

export const buildFunnelConversionRows = (items: Array<Record<string, unknown>> = []) => {
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

export const buildNamedValueRows = (
    items: Array<Record<string, unknown>> = [],
    nameLabel: string,
    valueLabel: string,
    labelKey = "name",
    valueKey = "value",
) => rowsFromArray(items, labelKey, valueKey).map((row) => ({
    [nameLabel]: row.Nombre,
    [valueLabel]: row.Valor,
    Porcentaje: formatPercentValue(row.Porcentaje),
}));

export const metricRow = (Metrica: string, Valor: unknown, Formula: string, Interpretación: string) => ({
    Metrica,
    Valor,
    Formula,
    Interpretación,
});

export interface SalesReportRow {
    Canal?: unknown;
    "Monto numérico"?: unknown;
    "Monto Numerico"?: unknown;
    "Monto numerico"?: unknown;
    "Fecha en que se registró el monto"?: unknown;
}

export const getSalesReportAmount = (row: SalesReportRow) =>
    numberCell(row["Monto numérico"] ?? row["Monto numerico"] ?? row["Monto Numerico"]);

export const buildSalesSummaryRows = (salesRows: SalesReportRow[]) => {
    const byChannel = new Map<string, { Canal: string; Ventas: number; Monto: number }>();
    const byMonth = new Map<string, { Periodo: string; Ventas: number; Monto: number }>();

    salesRows.forEach((row) => {
        const amount = getSalesReportAmount(row);
        const channel = cleanReportText(row.Canal) || "Otro";
        const channelRow = byChannel.get(channel) || { Canal: channel, Ventas: 0, Monto: 0 };
        channelRow.Ventas += 1;
        channelRow.Monto += amount;
        byChannel.set(channel, channelRow);

        const month = cleanReportText(row["Fecha en que se registró el monto"]).slice(0, 7) || "Sin fecha";
        const monthRow = byMonth.get(month) || { Periodo: month, Ventas: 0, Monto: 0 };
        monthRow.Ventas += 1;
        monthRow.Monto += amount;
        byMonth.set(month, monthRow);
    });

    return {
        salesTotal: salesRows.reduce((sum, row) => sum + getSalesReportAmount(row), 0),
        byChannel: Array.from(byChannel.values()),
        byMonth: Array.from(byMonth.values()),
    };
};

export const formatConversationStatus = (value: unknown) => {
    const status = cleanReportText(value).toLowerCase();
    if (status === "open") return "Abierto";
    if (status === "resolved") return "Resuelto";
    if (status === "pending") return "Pendiente";
    if (status === "snoozed") return "Pausado";
    return formatBusinessLabel(value) || "";
};

export const formatDataOrigin = (value: unknown) => {
    const source = cleanReportText(value).toLowerCase();
    if (source === "api") return "Datos recientes";
    if (source === "supabase") return "Historial disponible";
    if (source === "cache") return "Información guardada";
    return formatBusinessLabel(value) || "";
};
