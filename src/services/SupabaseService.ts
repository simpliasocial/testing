import { supabase } from '../lib/supabase';
import { ChatwootConversation } from './ChatwootService';
import {
    mapSupabaseConversationRowToChatwoot,
    parseDateToUnix
} from './ConversationMapper';

export interface HistoricalFilters {
    page?: number;
    q?: string;
    since?: string;
    until?: string;
}

export const SupabaseService = {
    getHistoricalConversations: async (params: HistoricalFilters = {}): Promise<{ payload: ChatwootConversation[]; meta: any }> => {
        try {
            const page = params.page || 1;
            const pageSize = 15;
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            let query = supabase
                .schema('cw')
                .from('conversations_current')
                .select('*', { count: 'exact' });

            if (params.q) {
                query = query.or(`nombre_completo.ilike.%${params.q}%,celular.ilike.%${params.q}%,meta->sender->>name.ilike.%${params.q}%`);
            }

            if (params.since) {
                query = query.gte('created_at_chatwoot', params.since);
            }

            if (params.until) {
                query = query.lte('created_at_chatwoot', params.until);
            }

            const { data, error, count } = await query
                .order('created_at_chatwoot', { ascending: false })
                .range(from, to);

            if (error) throw error;

            const payload: ChatwootConversation[] = (data || []).map(mapSupabaseConversationRowToChatwoot);

            return {
                payload,
                meta: {
                    all_count: count || 0,
                    page_count: payload.length
                }
            };
        } catch (error) {
            console.error('Error fetching historical conversations:', error);
            return { payload: [], meta: { all_count: 0 } };
        }
    },

    getHistoricalMessages: async (conversationId: number): Promise<any[]> => {
        try {
            const { data, error } = await supabase
                .schema('cw')
                .from('messages')
                .select('*')
                .eq('chatwoot_conversation_id', conversationId)
                .order('created_at_chatwoot', { ascending: true });

            if (error) throw error;

            return (data || []).map((msg: any) => {
                const numericType = Number(msg.message_type);
                const messageType = Number.isNaN(numericType)
                    ? (msg.message_direction === 'outgoing' ? 1 : 0)
                    : numericType;

                return {
                    id: msg.chatwoot_message_id,
                    content: msg.content,
                    message_type: messageType,
                    sender: msg.sender || {},
                    created_at: parseDateToUnix(msg.created_at_chatwoot)
                };
            });
        } catch (error) {
            console.error(`Error fetching historical messages for ${conversationId}:`, error);
            return [];
        }
    }
};
