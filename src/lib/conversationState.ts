import type { ConversationLabelEvent } from '@/domain/conversation';
import type { MinifiedConversation } from '@/services/StorageService';
import { normalizeLabels, labelsMatch, resolveLeadStage as resolveDomainLeadStage } from '@/domain/lead';
import { resolveLeadAttributes } from './leadAttributes';

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

export const getLeadAttrs = resolveLeadAttributes;

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
    return resolveDomainLeadStage(lead, tags);
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
