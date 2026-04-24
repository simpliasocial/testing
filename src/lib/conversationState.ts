import type { ConversationLabelEvent } from '@/services/LabelEventService';
import type { MinifiedConversation } from '@/services/StorageService';

const normalizeLabels = (labels: unknown): string[] => {
    if (!Array.isArray(labels)) return [];

    return Array.from(new Set(
        labels
            .map((label) => String(label || '').trim())
            .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b));
};

const labelsMatch = (left: string[], right: string[]) =>
    left.length === right.length && left.every((label, index) => label === right[index]);

const eventTimestamp = (event: ConversationLabelEvent) => {
    const occurredAt = new Date(event?.occurred_at || event?.detected_at || 0).getTime();
    return Number.isNaN(occurredAt) ? 0 : occurredAt;
};

export const applyLatestLabelState = (
    conversations: MinifiedConversation[],
    labelEvents: ConversationLabelEvent[]
) => {
    if (!Array.isArray(conversations) || conversations.length === 0) return [];
    if (!Array.isArray(labelEvents) || labelEvents.length === 0) return conversations;

    const latestEventByConversation = new Map<number, ConversationLabelEvent>();

    const eventsByConversation = new Map<number, ConversationLabelEvent[]>();

    [...labelEvents]
        .sort((a, b) => eventTimestamp(a) - eventTimestamp(b))
        .forEach((event) => {
            const conversationId = Number(event?.chatwoot_conversation_id);
            if (Number.isNaN(conversationId)) return;
            latestEventByConversation.set(conversationId, event);

            const existing = eventsByConversation.get(conversationId) || [];
            existing.push(event);
            eventsByConversation.set(conversationId, existing);
        });

    return conversations.map((conversation) => {
        const conversationId = Number(conversation.id);
        const latestEvent = latestEventByConversation.get(conversationId);
        const historicalEvents = eventsByConversation.get(conversationId) || [];

        let currentLabels = normalizeLabels(conversation.labels);
        if (latestEvent && conversation.source !== 'api') {
            const nextLabels = normalizeLabels(latestEvent.next_labels);
            if (!labelsMatch(currentLabels, nextLabels)) {
                currentLabels = nextLabels;
            }
        }

        const historicalLabels = Array.from(new Set([
            ...currentLabels,
            ...historicalEvents.flatMap(e => [
                ...normalizeLabels(e.previous_labels),
                ...normalizeLabels(e.next_labels),
                ...normalizeLabels(e.added_labels),
                ...normalizeLabels(e.removed_labels)
            ])
        ]));

        return {
            ...conversation,
            labels: currentLabels,
            historical_labels: historicalLabels
        };
    });
};

export const getLeadAttrs = (lead: Partial<MinifiedConversation> | any) => ({
    ...(lead?.custom_attributes || {}),
    ...(lead?.meta?.sender?.custom_attributes || {})
});

export const resolveLeadStage = (lead: MinifiedConversation, tags: {
    sqlTags?: string[];
    appointmentTags?: string[];
    saleTags?: string[];
    unqualifiedTags?: string[];
    humanFollowupQueueTags?: string[];
    humanAppointmentTargetLabel?: string;
    humanSalesQueueTags?: string[];
    humanSaleTargetLabel?: string;
}) => {
    const labels = lead.labels || [];

    // 1. Sale (Highest priority)
    const saleLabels = [
        ...(tags.saleTags || []),
        tags.humanSaleTargetLabel || 'venta_exitosa'
    ].filter(Boolean);
    if (labels.some(l => saleLabels.includes(l))) return 'sale';

    // 2. Appointment
    const appointmentLabels = [
        ...(tags.appointmentTags || []),
        ...(tags.humanSalesQueueTags || []),
        tags.humanAppointmentTargetLabel || 'cita_agendada_humano'
    ].filter(Boolean);
    if (labels.some(l => appointmentLabels.includes(l))) return 'appointment';

    // 3. Unqualified
    if (labels.some(l => (tags.unqualifiedTags || []).includes(l))) return 'unqualified';

    // 4. Human Followup
    if (labels.some(l => (tags.humanFollowupQueueTags || []).includes(l))) return 'followup';

    // 5. SQL
    if (labels.some(l => (tags.sqlTags || []).includes(l))) return 'sql';

    return 'other';
};

export const collectKnownLabels = (params: {
    catalogLabels?: string[];
    conversations?: MinifiedConversation[];
    labelEvents?: ConversationLabelEvent[];
}) => {
    const catalogLabels = Array.isArray(params.catalogLabels) ? params.catalogLabels : [];
    const conversations = Array.isArray(params.conversations) ? params.conversations : [];
    const labelEvents = Array.isArray(params.labelEvents) ? params.labelEvents : [];

    const latestEventByConversation = new Map<number, ConversationLabelEvent>();
    [...labelEvents]
        .sort((a, b) => eventTimestamp(a) - eventTimestamp(b))
        .forEach((event) => {
            const conversationId = Number(event?.chatwoot_conversation_id);
            if (Number.isNaN(conversationId)) return;
            latestEventByConversation.set(conversationId, event);
        });

    return Array.from(new Set([
        ...catalogLabels,
        ...conversations.flatMap((conversation) => normalizeLabels(conversation.labels)),
        ...Array.from(latestEventByConversation.values()).flatMap((event) => normalizeLabels(event.next_labels))
    ].map((label) => String(label || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
};
