import { supabase } from "../../lib/supabase";
import type { ChatwootConversation } from "../../domain/conversation";
import type { UnknownRecord } from "../../domain/common/types";
import { asRecord, isRecord } from "../../domain/common/types";
import type { ConversationMessage } from "../../domain/lead";
import {
    mapSupabaseConversationRowToChatwoot,
    parseDateToUnix,
} from "../conversation/ConversationMapper";

export interface HistoricalFilters {
    page?: number;
    q?: string;
    since?: string;
    until?: string;
}

export interface HistoricalConversationMeta {
    all_count: number;
    page_count: number;
}

export interface HistoricalConversationResult {
    payload: ChatwootConversation[];
    meta: HistoricalConversationMeta;
}

const DEFAULT_PAGE_SIZE = 15;

const toMessageId = (value: unknown) =>
    typeof value === "number" || typeof value === "string" ? value : undefined;

const toOptionalString = (value: unknown) =>
    value === undefined || value === null ? undefined : String(value);

const toBoolean = (value: unknown) => value === true || value === "true";

const resolveMessageType = (row: UnknownRecord) => {
    const numericType = Number(row.message_type);
    if (!Number.isNaN(numericType)) return numericType;
    return row.message_direction === "outgoing" ? 1 : 0;
};

const mapSupabaseMessageRow = (rowValue: unknown): ConversationMessage => {
    const row = asRecord(rowValue);

    return {
        id: toMessageId(row.chatwoot_message_id || row.id),
        content: toOptionalString(row.content),
        message_type: resolveMessageType(row),
        message_direction: toOptionalString(row.message_direction),
        sender_type: toOptionalString(row.sender_type),
        is_private: toBoolean(row.is_private),
        sender: asRecord(row.sender),
        attachments: Array.isArray(row.attachments) ? row.attachments : [],
        content_attributes: asRecord(row.content_attributes),
        created_at: parseDateToUnix(row.created_at_chatwoot),
    };
};

const mapHistoricalMessages = (rows: unknown): ConversationMessage[] =>
    Array.isArray(rows) ? rows.filter(isRecord).map(mapSupabaseMessageRow) : [];

export const supabaseHistoricalClient = {
    async getHistoricalConversations(params: HistoricalFilters = {}): Promise<HistoricalConversationResult> {
        try {
            const page = params.page || 1;
            const from = (page - 1) * DEFAULT_PAGE_SIZE;
            const to = from + DEFAULT_PAGE_SIZE - 1;

            let query = supabase
                .schema("cw")
                .from("conversations_current")
                .select("*", { count: "exact" });

            if (params.q) {
                query = query.or(`nombre_completo.ilike.%${params.q}%,celular.ilike.%${params.q}%,meta->sender->>name.ilike.%${params.q}%`);
            }

            if (params.since) {
                query = query.gte("created_at_chatwoot", params.since);
            }

            if (params.until) {
                query = query.lte("created_at_chatwoot", params.until);
            }

            const { data, error, count } = await query
                .order("created_at_chatwoot", { ascending: false })
                .range(from, to);

            if (error) throw error;

            const payload = (data || []).map(mapSupabaseConversationRowToChatwoot);

            return {
                payload,
                meta: {
                    all_count: count || 0,
                    page_count: payload.length,
                },
            };
        } catch (error) {
            console.error("Error fetching historical conversations:", error);
            return { payload: [], meta: { all_count: 0, page_count: 0 } };
        }
    },

    async getHistoricalMessages(conversationId: number): Promise<ConversationMessage[]> {
        try {
            const { data, error } = await supabase
                .schema("cw")
                .from("messages")
                .select("*")
                .eq("chatwoot_conversation_id", conversationId)
                .order("created_at_chatwoot", { ascending: true });

            if (error) throw error;

            return mapHistoricalMessages(data || []);
        } catch (error) {
            console.error(`Error fetching historical messages for ${conversationId}:`, error);
            return [];
        }
    },
};
