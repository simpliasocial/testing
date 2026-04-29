import { supabase } from '@/lib/supabase';
import {
    getLiveWindow,
    getGuayaquilDateString,
    getGuayaquilHour,
    getGuayaquilHourLabel,
    guayaquilEndOfDayIso,
    guayaquilStartOfDayIso,
    toUnixSeconds
} from '@/lib/guayaquilTime';
import { chatwootService } from './ChatwootService';
import {
    mapChatwootConversationToMinified,
    mapSupabaseConversationRowToMinified
} from './ConversationMapper';
import { MinifiedConversation } from './StorageService';

const MAX_CHATWOOT_PAGES = 200;
const SUPABASE_PAGE_SIZE = 1000;
const DETAIL_REFRESH_BATCH_SIZE = 5;

export interface IncomingMessageTrafficEvent {
    id: string;
    conversationId: number;
    inboxId?: number;
    createdAtIso: string;
    createdAtUnix: number;
    date: string;
    hour: number;
    hourLabel: string;
    source: 'api' | 'supabase';
}

const activityTimestamp = (conv: MinifiedConversation) => conv.timestamp || conv.created_at || 0;

const uniqueById = (conversations: MinifiedConversation[]) => {
    const map = new Map<number, MinifiedConversation>();
    conversations.forEach((conv) => {
        if (conv.id) map.set(conv.id, conv);
    });
    return Array.from(map.values()).sort((a, b) => activityTimestamp(b) - activityTimestamp(a));
};

const toIsoFromTimestamp = (value: any) => {
    if (!value) return '';
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
        return new Date(numeric < 10000000000 ? numeric * 1000 : numeric).toISOString();
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const messageTimestamp = (message: any) => {
    const iso = toIsoFromTimestamp(message?.created_at_chatwoot || message?.created_at || message?.timestamp);
    return iso ? Math.floor(new Date(iso).getTime() / 1000) : 0;
};

const isIncomingCustomerMessage = (message: any) =>
    message?.message_direction === 'incoming' ||
    Number(message?.message_type) === 0 ||
    String(message?.message_type || '').toLowerCase() === 'incoming' ||
    String(message?.sender_type || '').toLowerCase() === 'contact';

const isPublicMessage = (message: any) =>
    !message?.private && !message?.is_private;

const mapIncomingMessageEvent = (
    message: any,
    source: 'api' | 'supabase',
    fallbackConversationId?: number,
    fallbackInboxId?: number
): IncomingMessageTrafficEvent | null => {
    const createdAtIso = toIsoFromTimestamp(message?.created_at_chatwoot || message?.created_at || message?.timestamp);
    if (!createdAtIso) return null;

    const date = new Date(createdAtIso);
    if (Number.isNaN(date.getTime())) return null;

    const conversationId = Number(message?.chatwoot_conversation_id || message?.conversation_id || fallbackConversationId);
    const inboxId = Number(message?.chatwoot_inbox_id || message?.inbox_id || fallbackInboxId);

    return {
        id: String(message?.chatwoot_message_id || message?.id || `${source}_${conversationId}_${date.getTime()}`),
        conversationId,
        inboxId: Number.isFinite(inboxId) ? inboxId : undefined,
        createdAtIso,
        createdAtUnix: Math.floor(date.getTime() / 1000),
        date: getGuayaquilDateString(date),
        hour: getGuayaquilHour(date),
        hourLabel: getGuayaquilHourLabel(date),
        source
    };
};

const dateToGuayaquilDay = (date?: Date) => getGuayaquilDateString(date || new Date());

const uniqueIncomingEvents = (events: IncomingMessageTrafficEvent[]) => {
    const map = new Map<string, IncomingMessageTrafficEvent>();
    events.forEach((event) => map.set(event.id, event));
    return Array.from(map.values()).sort((a, b) => a.createdAtUnix - b.createdAtUnix);
};

const runInBatches = async <T, R>(items: T[], batchSize: number, worker: (item: T) => Promise<R>) => {
    const results: R[] = [];
    for (let index = 0; index < items.length; index += batchSize) {
        const batch = items.slice(index, index + batchSize);
        results.push(...await Promise.all(batch.map(worker)));
    }
    return results;
};

const uniqueIds = (values: number[]) =>
    Array.from(new Set(values.filter((value) => Number.isFinite(value) && value > 0)));

export const mergeConversationsPreferApi = (
    historical: MinifiedConversation[],
    live: MinifiedConversation[]
) => {
    const map = new Map<number, MinifiedConversation>();
    historical.forEach((conv) => map.set(conv.id, conv));
    live.forEach((conv) => map.set(conv.id, { ...conv, source: 'api' }));
    return Array.from(map.values()).sort((a, b) => activityTimestamp(b) - activityTimestamp(a));
};

export const HybridDashboardService = {
    getLiveWindow,

    async fetchChatwootWindow(params: {
        sinceUnix: number;
        untilUnix: number;
        signal?: AbortSignal;
        inboxId?: string;
        labels?: string[];
        search?: string;
        page?: number;
        paginated?: boolean;
    }): Promise<{ payload: MinifiedConversation[]; meta: any }> {
        const payload: MinifiedConversation[] = [];
        let page = params.page || 1;
        let maxPages = params.paginated ? page : MAX_CHATWOOT_PAGES;
        let apiMeta: any = {};
        const seenConversationIds = new Set<number>();

        while (page <= maxPages && !params.signal?.aborted) {
            const response = await chatwootService.getConversations({
                page,
                status: 'all',
                sort_by: 'last_activity_at_desc',
                since: params.sinceUnix.toString(),
                until: params.untilUnix.toString(),
                inbox_id: params.inboxId,
                labels: params.labels,
                q: params.search,
                signal: params.signal
            });

            const batch = response.payload || [];
            apiMeta = response.meta || {};
            if (batch.length === 0) break;
            const batchIds = batch
                .map((conv) => Number(conv?.id))
                .filter((id) => Number.isFinite(id) && id > 0);
            const newBatchIds = batchIds.filter((id) => !seenConversationIds.has(id));
            batchIds.forEach((id) => seenConversationIds.add(id));

            const mapped = batch
                .map(mapChatwootConversationToMinified)
                .filter((conv) => {
                    const ts = activityTimestamp(conv);
                    return ts >= params.sinceUnix && ts <= params.untilUnix;
                });

            payload.push(...mapped);

            if (params.paginated) break;

            const oldestTimestamp = Math.min(
                ...batch.map((conv) => activityTimestamp(mapChatwootConversationToMinified(conv))).filter(Boolean)
            );

            if (oldestTimestamp && oldestTimestamp < params.sinceUnix) break;
            if (newBatchIds.length === 0) break;

            page += 1;
        }

        const uniquePayload = uniqueById(payload);
        return {
            payload: uniquePayload,
            meta: {
                ...apiMeta,
                all_count: apiMeta?.all_count || apiMeta?.count || uniquePayload.length,
                page_count: uniquePayload.length
            }
        };
    },

    async fetchLiveConversations(signal?: AbortSignal) {
        const liveWindow = getLiveWindow();
        return this.fetchChatwootWindow({
            sinceUnix: liveWindow.liveStartUnix,
            untilUnix: liveWindow.nowUnix,
            signal
        });
    },

    async refreshConversationDetailsById(
        conversationIds: number[],
        params: { signal?: AbortSignal; limit?: number } = {}
    ): Promise<MinifiedConversation[]> {
        const ids = uniqueIds(conversationIds);
        if (ids.length === 0) return [];

        const limitedIds = typeof params.limit === 'number' && params.limit > 0
            ? ids.slice(0, params.limit)
            : ids;

        const refreshed = await runInBatches(limitedIds, DETAIL_REFRESH_BATCH_SIZE, async (conversationId) => {
            const detail = await chatwootService.getConversationDetails(conversationId, { signal: params.signal });
            if (!detail) return null;
            return mapChatwootConversationToMinified(detail);
        });

        return uniqueById(refreshed.filter((conversation): conversation is MinifiedConversation => Boolean(conversation)));
    },

    async fetchTodayConversations(params: {
        page?: number;
        signal?: AbortSignal;
        inboxId?: string;
        labels?: string[];
        search?: string;
    } = {}) {
        const liveWindow = getLiveWindow();
        return this.fetchChatwootWindow({
            sinceUnix: liveWindow.todayStartUnix,
            untilUnix: liveWindow.tomorrowStartUnix - 1,
            page: params.page,
            signal: params.signal,
            inboxId: params.inboxId,
            labels: params.labels,
            search: params.search,
            paginated: true
        });
    },

    async fetchSupabaseConversations(params: {
        beforeIso?: string;
        sinceIso?: string;
        untilIso?: string;
        search?: string;
        page?: number;
        pageSize?: number;
    } = {}): Promise<{ payload: MinifiedConversation[]; count: number }> {
        const pageSize = params.pageSize || SUPABASE_PAGE_SIZE;
        const payload: MinifiedConversation[] = [];
        let page = params.page || 1;
        let totalCount = 0;

        while (true) {
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            let query = supabase
                .schema('cw')
                .from('conversations_current')
                .select('*', { count: 'exact' });

            if (params.beforeIso) query = query.lt('created_at_chatwoot', params.beforeIso);
            if (params.sinceIso) query = query.gte('created_at_chatwoot', params.sinceIso);
            if (params.untilIso) query = query.lte('created_at_chatwoot', params.untilIso);
            if (params.search) {
                query = query.or(`nombre_completo.ilike.%${params.search}%,celular.ilike.%${params.search}%,correo.ilike.%${params.search}%,meta->sender->>name.ilike.%${params.search}%`);
            }

            const { data, error, count } = await query
                .order('created_at_chatwoot', { ascending: false })
                .range(from, to);

            if (error) throw error;

            totalCount = count || totalCount;
            const rows = data || [];
            payload.push(...rows.map(mapSupabaseConversationRowToMinified));

            if (params.page || rows.length < pageSize) break;
            page += 1;
        }

        return { payload: uniqueById(payload), count: totalCount || payload.length };
    },

    async fetchHistoricalBeforeLiveWindow() {
        const liveWindow = getLiveWindow();
        return this.fetchSupabaseConversations({ beforeIso: liveWindow.liveStartIso });
    },

    async fetchSupabaseIncomingMessageEvents(params: {
        sinceIso: string;
        untilIso: string;
        selectedInboxes?: number[];
    }): Promise<IncomingMessageTrafficEvent[]> {
        const pageSize = SUPABASE_PAGE_SIZE;
        const payload: IncomingMessageTrafficEvent[] = [];
        let page = 1;

        while (true) {
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            let query = supabase
                .schema('cw')
                .from('messages')
                .select('chatwoot_message_id, chatwoot_conversation_id, chatwoot_inbox_id, message_direction, message_type, sender_type, is_private, created_at_chatwoot')
                .eq('message_direction', 'incoming')
                .eq('is_private', false)
                .gte('created_at_chatwoot', params.sinceIso)
                .lte('created_at_chatwoot', params.untilIso);

            if (params.selectedInboxes && params.selectedInboxes.length > 0) {
                query = query.in('chatwoot_inbox_id', params.selectedInboxes);
            }

            const { data, error } = await query
                .order('created_at_chatwoot', { ascending: true })
                .range(from, to);

            if (error) throw error;

            const rows = data || [];
            rows.forEach((message: any) => {
                const event = mapIncomingMessageEvent(message, 'supabase');
                if (event) payload.push(event);
            });

            if (rows.length < pageSize) break;
            page += 1;
        }

        return payload;
    },

    async fetchLiveIncomingMessageEvents(params: {
        sinceUnix: number;
        untilUnix: number;
        selectedInboxes?: number[];
        signal?: AbortSignal;
    }): Promise<IncomingMessageTrafficEvent[]> {
        const conversations = await this.fetchChatwootWindow({
            sinceUnix: params.sinceUnix,
            untilUnix: params.untilUnix,
            signal: params.signal
        });

        const filteredConversations = conversations.payload.filter((conv) =>
            !params.selectedInboxes?.length || params.selectedInboxes.includes(Number(conv.inbox_id))
        );

        const messageLists = await runInBatches(filteredConversations, 5, async (conv) => {
            const existingMessages = Array.isArray(conv.messages) && conv.messages.length > 0
                ? conv.messages
                : await chatwootService.getMessages(conv.id, { signal: params.signal });

            return existingMessages.map((message: any) => ({
                message,
                conversationId: conv.id,
                inboxId: conv.inbox_id
            }));
        });

        const events: IncomingMessageTrafficEvent[] = [];
        messageLists.flat().forEach(({ message, conversationId, inboxId }) => {
            if (!isPublicMessage(message) || !isIncomingCustomerMessage(message)) return;

            const ts = messageTimestamp(message);
            if (!ts || ts < params.sinceUnix || ts > params.untilUnix) return;

            const event = mapIncomingMessageEvent(message, 'api', conversationId, inboxId);
            if (event) events.push(event);
        });

        return events;
    },

    async fetchHybridIncomingMessageEvents(params: {
        startDate?: Date;
        endDate?: Date;
        selectedInboxes?: number[];
        signal?: AbortSignal;
    }): Promise<IncomingMessageTrafficEvent[]> {
        const startDay = dateToGuayaquilDay(params.startDate);
        const endDay = dateToGuayaquilDay(params.endDate || params.startDate || new Date());
        const sinceIso = guayaquilStartOfDayIso(startDay);
        const untilIso = guayaquilEndOfDayIso(endDay);
        const liveWindow = getLiveWindow();

        const historicalUntilIso = untilIso < liveWindow.liveStartIso
            ? untilIso
            : new Date(new Date(liveWindow.liveStartIso).getTime() - 1).toISOString();

        const historicalPromise = sinceIso < liveWindow.liveStartIso
            ? this.fetchSupabaseIncomingMessageEvents({
                sinceIso,
                untilIso: historicalUntilIso,
                selectedInboxes: params.selectedInboxes
            })
            : Promise.resolve([]);

        const liveSinceUnix = Math.max(toUnixSeconds(sinceIso), liveWindow.liveStartUnix);
        const liveUntilUnix = Math.min(toUnixSeconds(untilIso), liveWindow.nowUnix);
        const livePromise = liveUntilUnix >= liveSinceUnix
            ? this.fetchLiveIncomingMessageEvents({
                sinceUnix: liveSinceUnix,
                untilUnix: liveUntilUnix,
                selectedInboxes: params.selectedInboxes,
                signal: params.signal
            })
            : Promise.resolve([]);

        const [historicalResult, liveResult] = await Promise.allSettled([historicalPromise, livePromise]);
        const historical = historicalResult.status === 'fulfilled' ? historicalResult.value : [];
        const live = liveResult.status === 'fulfilled' ? liveResult.value : [];

        if (historicalResult.status === 'rejected') {
            console.warn('[HybridDashboardService] Supabase incoming traffic failed:', historicalResult.reason);
        }
        if (liveResult.status === 'rejected') {
            console.warn('[HybridDashboardService] Chatwoot live incoming traffic failed:', liveResult.reason);
        }
        if (historicalResult.status === 'rejected' && liveResult.status === 'rejected') {
            throw liveResult.reason || historicalResult.reason;
        }

        return uniqueIncomingEvents([...historical, ...live]);
    },

    async fetchHybridConversations(signal?: AbortSignal) {
        const [historical, live] = await Promise.all([
            this.fetchHistoricalBeforeLiveWindow(),
            this.fetchLiveConversations(signal)
        ]);

        return {
            conversations: mergeConversationsPreferApi(historical.payload, live.payload),
            liveCount: live.payload.length,
            historicalCount: historical.payload.length
        };
    },

    async fetchHybridReportConversations(startDate: string, endDate: string) {
        const startIso = guayaquilStartOfDayIso(startDate);
        const endIso = guayaquilEndOfDayIso(endDate);
        const liveWindow = getLiveWindow();
        const historicalCutoffIso = new Date(new Date(liveWindow.liveStartIso).getTime() - 1).toISOString();
        const historicalUntilIso = endIso < liveWindow.liveStartIso ? endIso : historicalCutoffIso;

        const historicalPromise = startIso < liveWindow.liveStartIso
            ? this.fetchSupabaseConversations({
                sinceIso: startIso,
                untilIso: historicalUntilIso
            })
            : Promise.resolve({ payload: [], count: 0 });

        const livePromise = endIso >= liveWindow.liveStartIso
            ? this.fetchChatwootWindow({
                sinceUnix: Math.max(toUnixSeconds(startIso), liveWindow.liveStartUnix),
                untilUnix: toUnixSeconds(endIso)
            })
            : Promise.resolve({ payload: [], meta: { all_count: 0 } });

        const [historical, live] = await Promise.all([historicalPromise, livePromise]);
        return mergeConversationsPreferApi(historical.payload, live.payload);
    }
};
