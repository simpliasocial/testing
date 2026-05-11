import { cleanText, type UnknownRecord } from "../../../domain/common/types";
import type { LeadStage } from "../../../domain/lead";
import type { FirstResponseMetrics } from "./responseMetrics";
import type {
    DashboardOperationalMetrics,
    DashboardOwnerPerformance,
    DashboardQueueLead,
} from "../viewModel";

export const UNASSIGNED_OWNER_NAME = "Sin responsable";
export const UNASSIGNED_OWNER_SOURCE = "sin_asignar";

type OwnerSource = "responsable" | "agente" | typeof UNASSIGNED_OWNER_SOURCE;

interface OperationalConversation {
    id?: number;
    status?: string;
    resolvedStage?: LeadStage;
    resolvedLabels?: string[];
    labels?: string[];
    timestamp?: number;
    created_at?: number;
    first_reply_created_at?: number;
    source?: string;
    inbox_id?: number;
    meta?: {
        sender?: {
            name?: string;
        };
        assignee?: {
            name?: string;
        };
    };
    resolvedAttrs?: UnknownRecord;
    custom_attributes?: unknown;
    messages?: unknown[];
    last_non_activity_message?: unknown;
}

interface BuildOperationalMetricsParams {
    conversations: OperationalConversation[];
    firstResponseMetrics: FirstResponseMetrics;
    firstResponseGraceSeconds: number;
    followupQueueTags: string[];
    salesQueueTags: string[];
    resolveChannelName: (conversation: OperationalConversation) => string;
    resolveChannelType: (conversation: OperationalConversation) => string;
    getCreatedDate: (conversation: OperationalConversation) => Date;
    hasUnansweredMessage: (conversation: OperationalConversation) => boolean;
}

export interface BuildOperationalMetricsResult {
    ownerPerformance: DashboardOwnerPerformance[];
    operationalMetrics: DashboardOperationalMetrics;
}

export const resolveConversationOwner = (conversation: OperationalConversation) => {
    const attrs = conversation.resolvedAttrs || {};
    const manualResponsible = cleanText(attrs.responsable);
    const assignedAgent = cleanText(conversation.meta?.assignee?.name);

    if (manualResponsible) return { name: manualResponsible, source: "responsable" as OwnerSource };
    if (assignedAgent) return { name: assignedAgent, source: "agente" as OwnerSource };
    return { name: UNASSIGNED_OWNER_NAME, source: UNASSIGNED_OWNER_SOURCE as OwnerSource };
};

const ensureOwner = (
    stats: Map<string, Omit<DashboardOwnerPerformance, "winRate" | "score">>,
    name: string,
    source: OwnerSource,
) => {
    const cleanName = cleanText(name);
    if (!cleanName) return;

    if (!stats.has(cleanName)) {
        stats.set(cleanName, {
            name: cleanName,
            leads: 0,
            appointments: 0,
            unanswered: 0,
            source,
        });
    }
};

export const buildOwnerPerformance = (
    conversations: OperationalConversation[],
    hasUnansweredMessage: (conversation: OperationalConversation) => boolean,
): DashboardOwnerPerformance[] => {
    const ownerStats = new Map<string, Omit<DashboardOwnerPerformance, "winRate" | "score">>();

    conversations.forEach((conversation) => {
        ensureOwner(ownerStats, cleanText(conversation.meta?.assignee?.name), "agente");
        ensureOwner(ownerStats, cleanText(conversation.resolvedAttrs?.responsable), "responsable");
    });

    conversations.forEach((conversation) => {
        const effectiveOwner = resolveConversationOwner(conversation);
        ensureOwner(ownerStats, effectiveOwner.name, effectiveOwner.source);

        const stats = ownerStats.get(effectiveOwner.name);
        if (!stats) return;

        stats.source = effectiveOwner.source === "responsable" || effectiveOwner.source === UNASSIGNED_OWNER_SOURCE
            ? effectiveOwner.source
            : stats.source;
        stats.leads++;
        if (hasUnansweredMessage(conversation)) stats.unanswered++;
        if (conversation.resolvedStage === "appointment") stats.appointments++;
    });

    return Array.from(ownerStats.values())
        .map((stats) => ({
            ...stats,
            winRate: stats.leads > 0 ? Math.round((stats.appointments / stats.leads) * 100) : 0,
            score: Math.min(100, 70 + (stats.appointments * 2)),
        }))
        .sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name));
};

const mapQueueLead = (
    conversation: OperationalConversation,
    resolveChannelName: (conversation: OperationalConversation) => string,
    resolveChannelType: (conversation: OperationalConversation) => string,
): DashboardQueueLead => ({
    id: conversation.id,
    name: conversation.meta?.sender?.name || "Desconocido",
    owner: cleanText(conversation.resolvedAttrs?.responsable) ||
        cleanText(conversation.meta?.assignee?.name) ||
        "Sin Asignar",
    status: conversation.status,
    channel: resolveChannelName(conversation),
    channel_type: resolveChannelType(conversation),
    inbox_id: conversation.inbox_id,
    labels: conversation.labels || [],
    meta: conversation.meta,
    custom_attributes: conversation.custom_attributes,
    messages: conversation.messages || [],
    last_message: conversation.messages && conversation.messages.length > 0
        ? conversation.messages[conversation.messages.length - 1]
        : conversation.last_non_activity_message || null,
    last_non_activity_message: conversation.last_non_activity_message,
    timestamp: conversation.timestamp,
    created_at: conversation.created_at,
    first_reply_created_at: conversation.first_reply_created_at,
    source: conversation.source,
});

const sortByLatestTimestamp = (a: DashboardQueueLead, b: DashboardQueueLead) =>
    Number(b.timestamp || 0) - Number(a.timestamp || 0);

export const buildOperationalMetrics = ({
    conversations,
    firstResponseMetrics,
    firstResponseGraceSeconds,
    followupQueueTags,
    salesQueueTags,
    resolveChannelName,
    resolveChannelType,
    getCreatedDate,
    hasUnansweredMessage,
}: BuildOperationalMetricsParams): BuildOperationalMetricsResult => {
    let leadsWithOwnerCount = 0;
    let unassignedLeadsCount = 0;
    const hourCounts = new Array(24).fill(0);

    conversations.forEach((conversation) => {
        const effectiveOwner = resolveConversationOwner(conversation);

        if (effectiveOwner.source === UNASSIGNED_OWNER_SOURCE) {
            unassignedLeadsCount++;
        } else {
            leadsWithOwnerCount++;
        }

        const createdDate = getCreatedDate(conversation);
        hourCounts[createdDate.getHours()]++;
    });

    const totalLeads = conversations.length;
    const queueMapper = (conversation: OperationalConversation) =>
        mapQueueLead(conversation, resolveChannelName, resolveChannelType);

    return {
        ownerPerformance: buildOwnerPerformance(conversations, hasUnansweredMessage),
        operationalMetrics: {
            averageFirstResponseSeconds: firstResponseMetrics.firstResponseAverageSeconds,
            firstResponseAverageSeconds: firstResponseMetrics.firstResponseAverageSeconds,
            firstResponseRawAverageSeconds: firstResponseMetrics.firstResponseRawAverageSeconds,
            firstResponseGraceSeconds,
            firstResponseMedianSeconds: firstResponseMetrics.firstResponseMedianSeconds,
            firstResponseCount: firstResponseMetrics.firstResponseCount,
            leadsWithOwnerCount,
            unassignedLeadsCount,
            totalLeads,
            leadsWithOwnerPercentage: totalLeads > 0 ? Math.round((leadsWithOwnerCount / totalLeads) * 100) : 0,
            leadsSinRespuesta: conversations.filter(hasUnansweredMessage).length,
            slaPercentage: 0,
            agingData: [],
            trafficData: hourCounts.map((count, hour) => ({
                hour: `${hour.toString().padStart(2, "0")}:00`,
                count,
                label: `${hour.toString().padStart(2, "0")}:00`,
            })),
            followUpQueue: conversations
                .filter((conversation) => conversation.resolvedLabels?.some((label) => followupQueueTags.includes(label)))
                .map(queueMapper)
                .sort(sortByLatestTimestamp),
            scheduledAppointmentsQueue: conversations
                .filter((conversation) => conversation.resolvedLabels?.some((label) => salesQueueTags.includes(label)))
                .map(queueMapper)
                .sort(sortByLatestTimestamp),
            activeLeads: conversations
                .filter((conversation) => conversation.status !== "resolved")
                .slice(0, 10)
                .map((conversation) => ({
                    id: conversation.id,
                    name: conversation.meta?.sender?.name || "Sin Nombre",
                    owner: cleanText(conversation.resolvedAttrs?.responsable) ||
                        cleanText(conversation.meta?.assignee?.name) ||
                        "Sin Asignar",
                    status: conversation.status,
                    channel: resolveChannelName(conversation),
                    timestamp: conversation.timestamp,
                })),
        },
    };
};
