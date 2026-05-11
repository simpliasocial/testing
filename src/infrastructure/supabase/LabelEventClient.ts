import type { ConversationLabelEvent, LabelEventSource } from "../../domain/conversation";
import type { UnknownRecord } from "../../domain/common/types";
import { getLabelDelta } from "../../domain/lead";
import { supabase } from "../../lib/supabase";

export const labelEventClient = {
    async fetchLabelEvents(): Promise<ConversationLabelEvent[]> {
        const { data, error } = await supabase
            .schema("cw")
            .from("conversation_label_events")
            .select("*")
            .order("occurred_at", { ascending: true });

        if (error) throw error;
        return (data || []) as ConversationLabelEvent[];
    },

    async recordConversationLabelChange(params: {
        conversationId: number;
        previousLabels: unknown;
        nextLabels: unknown;
        eventSource?: LabelEventSource;
        occurredAt?: string;
        rawPayload?: UnknownRecord;
    }) {
        const delta = getLabelDelta(params.previousLabels, params.nextLabels);
        if (delta.added.length === 0 && delta.removed.length === 0) return null;

        const occurredAt = params.occurredAt || new Date().toISOString();
        const eventSource = params.eventSource || "dashboard";
        const eventKey = [
            eventSource,
            params.conversationId,
            occurredAt,
            delta.previous.join("|"),
            delta.next.join("|"),
        ].join(":");

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
            event_key: eventKey,
        };

        const { data, error } = await supabase
            .schema("cw")
            .from("conversation_label_events")
            .upsert(row, { onConflict: "event_key", ignoreDuplicates: true })
            .select()
            .maybeSingle();

        if (error) throw error;
        return data;
    },
};

export const LabelEventService = labelEventClient;
