import { supabase } from "../../lib/supabase";
import type { IncomingMessageTrafficEvent, MinifiedConversation } from "../../domain/conversation";
import { uniqueConversationsById } from "../../domain/conversation";
import type { ConversationMessage } from "../../domain/lead";
import { mapIncomingMessageEvent } from "../../shared/conversation/messageTraffic";
import { mapSupabaseConversationRowToMinified } from "../conversation/ConversationMapper";

const SUPABASE_PAGE_SIZE = 1000;

export interface SupabaseConversationReadFilters {
    beforeIso?: string;
    sinceIso?: string;
    untilIso?: string;
    search?: string;
    page?: number;
    pageSize?: number;
    importedOnly?: boolean;
}

export interface SupabaseConversationReadResult {
    payload: MinifiedConversation[];
    count: number;
}

export interface SupabaseIncomingTrafficFilters {
    sinceIso: string;
    untilIso: string;
    selectedInboxes?: number[];
}

export const supabaseDashboardReadClient = {
    async fetchConversations(params: SupabaseConversationReadFilters = {}): Promise<SupabaseConversationReadResult> {
        const pageSize = params.pageSize || SUPABASE_PAGE_SIZE;
        const payload: MinifiedConversation[] = [];
        let page = params.page || 1;
        let totalCount = 0;

        while (true) {
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            let query = supabase
                .schema("cw")
                .from("conversations_current")
                .select("*", { count: "exact" });

            if (params.beforeIso) query = query.lt("created_at_chatwoot", params.beforeIso);
            if (params.sinceIso) query = query.gte("created_at_chatwoot", params.sinceIso);
            if (params.untilIso) query = query.lte("created_at_chatwoot", params.untilIso);
            if (params.importedOnly) query = query.lt("chatwoot_conversation_id", 0);
            if (params.search) {
                query = query.or(`nombre_completo.ilike.%${params.search}%,celular.ilike.%${params.search}%,correo.ilike.%${params.search}%,meta->sender->>name.ilike.%${params.search}%`);
            }

            const { data, error, count } = await query
                .order("created_at_chatwoot", { ascending: false })
                .range(from, to);

            if (error) throw error;

            totalCount = count || totalCount;
            const rows = data || [];
            payload.push(...rows.map(mapSupabaseConversationRowToMinified));

            if (params.page || rows.length < pageSize) break;
            page += 1;
        }

        return { payload: uniqueConversationsById(payload), count: totalCount || payload.length };
    },

    async fetchIncomingMessageEvents(params: SupabaseIncomingTrafficFilters): Promise<IncomingMessageTrafficEvent[]> {
        const payload: IncomingMessageTrafficEvent[] = [];
        let page = 1;

        while (true) {
            const from = (page - 1) * SUPABASE_PAGE_SIZE;
            const to = from + SUPABASE_PAGE_SIZE - 1;

            let query = supabase
                .schema("cw")
                .from("messages")
                .select("chatwoot_message_id, chatwoot_conversation_id, chatwoot_inbox_id, message_direction, message_type, sender_type, is_private, created_at_chatwoot")
                .eq("message_direction", "incoming")
                .eq("is_private", false)
                .gte("created_at_chatwoot", params.sinceIso)
                .lte("created_at_chatwoot", params.untilIso);

            if (params.selectedInboxes && params.selectedInboxes.length > 0) {
                query = query.in("chatwoot_inbox_id", params.selectedInboxes);
            }

            const { data, error } = await query
                .order("created_at_chatwoot", { ascending: true })
                .range(from, to);

            if (error) throw error;

            const rows = (data || []) as ConversationMessage[];
            rows.forEach((message) => {
                const event = mapIncomingMessageEvent(message, "supabase");
                if (event) payload.push(event);
            });

            if (rows.length < SUPABASE_PAGE_SIZE) break;
            page += 1;
        }

        return payload;
    },
};
