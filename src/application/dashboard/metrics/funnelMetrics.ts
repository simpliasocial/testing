import type { LeadStage } from "../../../domain/lead";
import type { DashboardDataFilters, DashboardValuePoint } from "../viewModel";

interface FunnelConversation {
    resolvedStage?: LeadStage;
    resolvedLabels?: string[];
    labels?: string[];
    historical_labels?: string[];
}

type FunnelStage = "sale" | "appointment" | "sql" | "unqualified";

export interface HistoricalFunnelMetrics {
    saleCount: number;
    appointmentCount: number;
    sqlCount: number;
    data: DashboardValuePoint[];
}

const titleizeLabel = (label: string) =>
    label
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

export const collectConversationLabelSet = (conversations: FunnelConversation[]) => {
    const labelSet = new Set<string>();

    conversations.forEach((conversation) => {
        (conversation.resolvedLabels || []).forEach((label) => labelSet.add(label));
    });

    return labelSet;
};

export const buildLabelDistribution = (
    labelSet: Set<string>,
    conversations: FunnelConversation[],
): DashboardValuePoint[] =>
    Array.from(labelSet)
        .map((label) => ({
            label: titleizeLabel(label),
            key: label,
            value: conversations.filter((conversation) => conversation.resolvedLabels?.includes(label)).length,
        }))
        .sort((a, b) => (b.value || 0) - (a.value || 0));

export const hasHistoricalLabel = (conversation: FunnelConversation, keys: string[]) => {
    if (keys.length === 0) return false;

    const searchSpace = new Set([
        ...(conversation.historical_labels || []),
        ...(conversation.resolvedLabels || []),
        ...(conversation.labels || []),
    ]);

    return keys.some((key) => searchSpace.has(key));
};

export const getTagsForFunnelStage = (
    filters: DashboardDataFilters,
    stage: FunnelStage,
) => {
    switch (stage) {
        case "sale":
            return [...(filters.saleTags || []), filters.humanSaleTargetLabel || "venta_exitosa"].filter(Boolean);
        case "appointment":
            return [
                ...(filters.appointmentTags || []),
                ...(filters.humanSalesQueueTags || []),
                filters.humanAppointmentTargetLabel || "cita_agendada_humano",
            ].filter(Boolean);
        case "sql":
            return filters.sqlTags || [];
        case "unqualified":
            return filters.unqualifiedTags || [];
        default:
            return [];
    }
};

export const buildHistoricalFunnelMetrics = (
    conversations: FunnelConversation[],
    filters: DashboardDataFilters,
    isCurrentSaleLead: (conversation: FunnelConversation) => boolean,
): HistoricalFunnelMetrics => {
    let saleCount = 0;
    let appointmentCount = 0;
    let sqlCount = 0;

    const saleTags = getTagsForFunnelStage(filters, "sale");
    const appointmentTags = getTagsForFunnelStage(filters, "appointment");
    const sqlTags = getTagsForFunnelStage(filters, "sql");

    conversations.forEach((conversation) => {
        const reachedSale = isCurrentSaleLead(conversation) || hasHistoricalLabel(conversation, saleTags);
        const reachedAppointment = reachedSale || hasHistoricalLabel(conversation, appointmentTags);
        const reachedSql = reachedAppointment || hasHistoricalLabel(conversation, sqlTags);

        if (reachedSale) saleCount++;
        if (reachedAppointment) appointmentCount++;
        if (reachedSql) sqlCount++;
    });

    return {
        saleCount,
        appointmentCount,
        sqlCount,
        data: [
            { label: "Llegaron a SQL", value: sqlCount, color: "hsl(200, 70%, 50%)" },
            { label: "Alcanzaron Cita", value: appointmentCount, color: "hsl(45, 93%, 58%)" },
            { label: "Cerraron Venta", value: saleCount, color: "hsl(262, 83%, 58%)" },
        ],
    };
};

export const buildCurrentFunnelData = (
    sqlCount: number,
    appointmentCount: number,
    saleCount: number,
): DashboardValuePoint[] => [
    { label: "Interesado", value: sqlCount, color: "hsl(200, 70%, 50%)" },
    { label: "Cita Agendada", value: appointmentCount, color: "hsl(45, 93%, 58%)" },
    { label: "Venta Exitosa", value: saleCount, color: "hsl(262, 83%, 58%)" },
];

export const resolveDisplayFunnel = (
    funnelData: DashboardValuePoint[],
    labelDistribution: DashboardValuePoint[],
) => {
    const hasStandardFunnelData = funnelData.some((item) => (item.value || 0) > 0);
    if (hasStandardFunnelData) return funnelData;

    return labelDistribution.slice(0, 5).map((item) => ({
        label: item.label,
        value: item.value,
        color: `hsl(${Math.random() * 360}, 60%, 50%)`,
    }));
};
