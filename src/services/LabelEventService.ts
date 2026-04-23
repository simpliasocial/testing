import { supabase } from '@/lib/supabase';

export type LabelEventSource = 'dashboard' | 'webhook' | 'sync_diff' | 'repair';

export interface ConversationLabelEvent {
    id?: number;
    chatwoot_conversation_id: number;
    previous_labels: string[];
    next_labels: string[];
    added_labels: string[];
    removed_labels: string[];
    event_source: LabelEventSource;
    occurred_at: string;
    detected_at?: string;
    raw_payload?: Record<string, any>;
    event_key?: string;
}

const normalizeLabels = (labels: unknown): string[] => {
    if (!Array.isArray(labels)) return [];
    return Array.from(new Set(
        labels
            .map(label => String(label || '').trim())
            .filter(Boolean)
    )).sort();
};

export const getLabelDelta = (previousLabels: unknown, nextLabels: unknown) => {
    const previous = normalizeLabels(previousLabels);
    const next = normalizeLabels(nextLabels);
    const previousSet = new Set(previous);
    const nextSet = new Set(next);

    return {
        previous,
        next,
        added: next.filter(label => !previousSet.has(label)),
        removed: previous.filter(label => !nextSet.has(label))
    };
};

export const LabelEventService = {
    async fetchLabelEvents(): Promise<ConversationLabelEvent[]> {
        const { data, error } = await supabase
            .schema('cw')
            .from('conversation_label_events')
            .select('*')
            .order('occurred_at', { ascending: true });

        if (error) throw error;
        return (data || []) as ConversationLabelEvent[];
    },

    async recordConversationLabelChange(params: {
        conversationId: number;
        previousLabels: unknown;
        nextLabels: unknown;
        eventSource?: LabelEventSource;
        occurredAt?: string;
        rawPayload?: Record<string, any>;
    }) {
        const delta = getLabelDelta(params.previousLabels, params.nextLabels);
        if (delta.added.length === 0 && delta.removed.length === 0) return null;

        const occurredAt = params.occurredAt || new Date().toISOString();
        const eventSource = params.eventSource || 'dashboard';
        const eventKey = [
            eventSource,
            params.conversationId,
            occurredAt,
            delta.previous.join('|'),
            delta.next.join('|')
        ].join(':');

        const row = {
            chatwoot_conversation_id: params.conversationId,
            previous_labels: delta.previous,
            next_labels: delta.next,
            added_labels: delta.added,
            removed_labels: delta.removed,
            event_source: eventSource,
            occurred_at: occurredAt,
            detected_at: new Date().toISOString(),
            raw_payload: params.rawPayload || {},
            event_key: eventKey
        };

        const { data, error } = await supabase
            .schema('cw')
            .from('conversation_label_events')
            .upsert(row, { onConflict: 'event_key', ignoreDuplicates: true })
            .select()
            .maybeSingle();

        if (error) throw error;
        return data;
    }
};
