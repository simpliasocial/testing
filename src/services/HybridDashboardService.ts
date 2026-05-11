import {
    getLiveWindow,
    getGuayaquilDateString,
    guayaquilEndOfDayIso,
    guayaquilStartOfDayIso,
    toUnixSeconds
} from '@/lib/guayaquilTime';
import { chatwootService } from './ChatwootService';
import { mapChatwootConversationToMinified } from './ConversationMapper';
import type { IncomingMessageTrafficEvent, MinifiedConversation } from '@/domain/conversation';
import {
    conversationActivityTimestamp as activityTimestamp,
    uniqueConversationsById as uniqueById,
} from '@/domain/conversation';
import type { UnknownRecord } from '@/domain/common/types';
import type { ConversationMessage } from '@/domain/lead';
import { supabaseDashboardReadClient } from '@/infrastructure/supabase/SupabaseDashboardReadClient';
import {
    isIncomingCustomerMessage,
    isPublicMessage,
    mapIncomingMessageEvent,
    messageTimestamp,
    uniqueIncomingEvents,
} from '@/shared/conversation/messageTraffic';

const MAX_CHATWOOT_PAGES = 200;
const DETAIL_REFRESH_BATCH_SIZE = 5;

const dateToGuayaquilDay = (date?: Date) => getGuayaquilDateString(date || new Date());

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

type MessageWithConversationContext = {
    message: ConversationMessage;
    conversationId: number;
    inboxId?: number;
};

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
    }): Promise<{ payload: MinifiedConversation[]; meta: UnknownRecord }> {
        const payload: MinifiedConversation[] = [];
        let page = params.page || 1;
        const maxPages = params.paginated ? page : MAX_CHATWOOT_PAGES;
        let apiMeta: UnknownRecord = {};
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
        importedOnly?: boolean;
    } = {}): Promise<{ payload: MinifiedConversation[]; count: number }> {
        return supabaseDashboardReadClient.fetchConversations(params);
    },

    async fetchHistoricalBeforeLiveWindow() {
        const liveWindow = getLiveWindow();
        return this.fetchSupabaseConversations({ beforeIso: liveWindow.liveStartIso });
    },

    async fetchImportedConversations(params: {
        sinceIso?: string;
        untilIso?: string;
    } = {}) {
        return this.fetchSupabaseConversations({
            sinceIso: params.sinceIso,
            untilIso: params.untilIso,
            importedOnly: true
        });
    },

    async fetchSupabaseIncomingMessageEvents(params: {
        sinceIso: string;
        untilIso: string;
        selectedInboxes?: number[];
    }): Promise<IncomingMessageTrafficEvent[]> {
        return supabaseDashboardReadClient.fetchIncomingMessageEvents(params);
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

        const messageLists = await runInBatches<MinifiedConversation, MessageWithConversationContext[]>(
            filteredConversations,
            5,
            async (conv) => {
            const existingMessages = Array.isArray(conv.messages) && conv.messages.length > 0
                ? conv.messages
                : await chatwootService.getMessages(conv.id, { signal: params.signal });

            return existingMessages.map((message) => ({
                message,
                conversationId: conv.id,
                inboxId: conv.inbox_id
            }));
            }
        );

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
        const [historical, imported, live] = await Promise.all([
            this.fetchHistoricalBeforeLiveWindow(),
            this.fetchImportedConversations(),
            this.fetchLiveConversations(signal)
        ]);

        return {
            conversations: mergeConversationsPreferApi([...historical.payload, ...imported.payload], live.payload),
            liveCount: live.payload.length,
            historicalCount: uniqueById([...historical.payload, ...imported.payload]).length
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

        const importedPromise = this.fetchImportedConversations({
            sinceIso: startIso,
            untilIso: endIso
        });

        const livePromise = endIso >= liveWindow.liveStartIso
            ? this.fetchChatwootWindow({
                sinceUnix: Math.max(toUnixSeconds(startIso), liveWindow.liveStartUnix),
                untilUnix: toUnixSeconds(endIso)
            })
            : Promise.resolve({ payload: [], meta: { all_count: 0 } });

        const [historical, imported, live] = await Promise.all([historicalPromise, importedPromise, livePromise]);
        return mergeConversationsPreferApi([...historical.payload, ...imported.payload], live.payload);
    }
};
