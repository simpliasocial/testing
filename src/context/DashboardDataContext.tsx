import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MinifiedConversation } from '../services/StorageService';
import { chatwootRepository } from '@/infrastructure/chatwoot/ChatwootRepository';
import { dedupeContactAttributeDefinitions } from '@/infrastructure/chatwoot/ContactAttributeDefinitionMapper';
import { hybridConversationRepository, mergeConversationsPreferApi } from '@/infrastructure/conversation/HybridConversationRepository';
import { labelEventClient } from '@/infrastructure/supabase/LabelEventClient';
import { commercialAuditClient } from '@/infrastructure/supabase/CommercialAuditClient';
import { dashboardSettingsRepository } from '@/infrastructure/settings/DashboardSettingsRepository';
import { indexedConversationRepository } from '@/infrastructure/storage/IndexedConversationRepository';
import { supabase } from '../lib/supabase';
import { applyLatestLabelState, collectKnownLabels, getLeadAttrs, resolveLeadStage } from '../lib/conversationState';
import type { CommercialAuditEvent } from '../lib/commercialFacts';
import { DEFAULT_TAG_CONFIG, normalizeTagConfig, type ContactAttributeDefinition, type DashboardFilters, type TagConfig } from '@/domain/dashboard';
import type { ConversationLabelEvent } from '@/domain/conversation';
import type { Inbox } from '@/domain/lead';
import { DashboardDataContext } from './dashboardDataContextValue';
import type { DashboardDataSource, ResolvedConversation } from './dashboardDataTypes';

const POLL_INTERVAL_MS = 30000;
const HISTORICAL_DETAIL_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const HISTORICAL_DETAIL_REFRESH_LIMIT = 250;

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error || 'Error desconocido');

type ErrorLike = {
    name?: string;
    message?: string;
};

type SupabaseInboxRow = {
    chatwoot_inbox_id?: number | string;
    id?: number | string;
    name?: string;
    channel_type?: string;
    website_url?: string;
    website_token?: string;
    provider?: string;
    slug?: string;
};

type ConversationLabelsRow = {
    labels?: unknown;
};

const isErrorLike = (error: unknown): error is ErrorLike =>
    typeof error === 'object' && error !== null;

const isAbortError = (error: unknown) =>
    isErrorLike(error) && (
        error.name === 'AbortError' ||
        error.name === 'CanceledError' ||
        error.message === 'canceled'
    );

const normalizeSupabaseInbox = (inbox: SupabaseInboxRow): Inbox | null => {
    const id = Number(inbox.chatwoot_inbox_id ?? inbox.id);
    if (!Number.isFinite(id)) return null;

    return {
        id,
        name: inbox.name,
        channel_type: inbox.channel_type,
        website_url: inbox.website_url,
        website_token: inbox.website_token,
        provider: inbox.provider,
        slug: inbox.slug
    };
};

export const DashboardDataProvider = ({ children }: { children: ReactNode }) => {
    const [conversations, setConversations] = useState<MinifiedConversation[]>([]);
    const [labelEvents, setLabelEvents] = useState<ConversationLabelEvent[]>([]);
    const [commercialAuditEvents, setCommercialAuditEvents] = useState<CommercialAuditEvent[]>([]);
    const [inboxes, setInboxes] = useState<Inbox[]>([]);
    const [labels, setLabels] = useState<string[]>([]);
    const [contactAttributeDefinitions, setContactAttributeDefinitions] = useState<ContactAttributeDefinition[]>([]);
    const [tagSettings, setTagSettings] = useState<TagConfig>(DEFAULT_TAG_CONFIG);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dataSource, setDataSource] = useState<DashboardDataSource>('HYBRID');
    const [lastLiveFetchAt, setLastLiveFetchAt] = useState<Date | null>(null);
    const [liveError, setLiveError] = useState<string | null>(null);
    const [historicalError, setHistoricalError] = useState<string | null>(null);
    const [globalFilters, setGlobalFilters] = useState<DashboardFilters>({});

    const conversationsRef = useRef<MinifiedConversation[]>([]);
    const abortControllerRef = useRef<AbortController | null>(null);
    const isFetchingRef = useRef(false);
    const lastHistoricalDetailRefreshAtRef = useRef(0);

    const updateVisualState = useCallback(async (newData: MinifiedConversation[], persist = true) => {
        conversationsRef.current = newData;
        setConversations(newData);

        if (persist && newData.length > 0) {
            try {
                await indexedConversationRepository.saveConversations(newData, { replaceAll: true });
            } catch (storageError) {
                console.warn('[Dashboard] IndexedDB cache write failed:', storageError);
            }
        }
    }, []);

    const replaceConversation = useCallback(async (conversation: MinifiedConversation) => {
        let nextConversations: MinifiedConversation[] = [];

        setConversations((prev) => {
            const existingIndex = prev.findIndex((item) => Number(item.id) === Number(conversation.id));
            if (existingIndex >= 0) {
                nextConversations = prev.map((item, index) => (
                    index === existingIndex
                        ? { ...item, ...conversation }
                        : item
                ));
            } else {
                nextConversations = [{ ...conversation }, ...prev];
            }

            conversationsRef.current = nextConversations;
            return nextConversations;
        });

        try {
            await indexedConversationRepository.saveConversations(nextConversations, { replaceAll: true });
        } catch (storageError) {
            console.warn('[Dashboard] IndexedDB cache write failed after conversation patch:', storageError);
        }
    }, []);

    const resolvedConversations = useMemo<ResolvedConversation[]>(() => {
        const patched = applyLatestLabelState(conversations, labelEvents);
        return patched.map(conv => {
            const resolvedAttrs = getLeadAttrs(conv);
            return {
                ...conv,
                resolvedLabels: conv.labels || [],
                resolvedAttrs,
                resolvedStage: resolveLeadStage(conv, tagSettings)
            };
        });
    }, [conversations, labelEvents, tagSettings]);

    const effectiveLabels = useMemo(
        () => collectKnownLabels({
            catalogLabels: labels,
            conversations: resolvedConversations,
            labelEvents
        }),
        [labels, resolvedConversations, labelEvents]
    );

    const updateTagSettings = useCallback(async (newConfig: TagConfig) => {
        const normalizedConfig = normalizeTagConfig(newConfig);
        setTagSettings(normalizedConfig);
        await dashboardSettingsRepository.saveTagSettings(normalizedConfig);
    }, []);

    const loadTagSettings = useCallback(async () => {
        const saved = await dashboardSettingsRepository.loadTagSettings();
        if (saved) setTagSettings(saved);
    }, []);

    const fetchInboxes = useCallback(async (signal: AbortSignal) => {
        try {
            const inboxesData = await chatwootRepository.fetchInboxes(signal);
            setInboxes(Array.isArray(inboxesData)
                ? inboxesData.filter((inbox): inbox is Inbox => Boolean(inbox && inbox.id && inbox.channel_type))
                : []);
            return;
        } catch (apiError: unknown) {
            if (!isAbortError(apiError)) {
                console.warn('[Dashboard] Chatwoot inboxes failed, trying Supabase:', apiError);
            }
        }

        try {
            const { data, error: dbError } = await supabase
                .schema('cw')
                .from('inboxes')
                .select('*')
                .order('name', { ascending: true });

            if (dbError) throw dbError;
            setInboxes(((data || []) as SupabaseInboxRow[])
                .map(normalizeSupabaseInbox)
                .filter((inbox): inbox is Inbox => Boolean(inbox)));
        } catch (dbError) {
            console.error('Failed to fetch inboxes from Supabase:', dbError);
        }
    }, []);

    const fetchLabels = useCallback(async (signal: AbortSignal) => {
        try {
            const labelsData = await chatwootRepository.fetchLabels(signal);
            const normalizedApiLabels = Array.isArray(labelsData)
                ? Array.from(new Set(labelsData.filter(l => typeof l === 'string').map(l => l.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
                : [];
            if (normalizedApiLabels.length > 0) {
                setLabels(normalizedApiLabels);
                return;
            }
        } catch (labelsError: unknown) {
            if (!isAbortError(labelsError)) {
                console.warn('[Dashboard] Chatwoot labels failed, trying fallback:', labelsError);
            }
        }

        try {
            const { data, error: dbError } = await supabase
                .schema('cw')
                .from('conversations_current')
                .select('labels');

            if (dbError) throw dbError;

            const fallbackLabels = Array.from(new Set([
                ...((data || []) as ConversationLabelsRow[]).flatMap((row) => Array.isArray(row.labels) ? row.labels : []),
                ...conversationsRef.current.flatMap((conv) => Array.isArray(conv?.labels) ? conv.labels : [])
            ].map(label => String(label || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

            setLabels(fallbackLabels);
        } catch (dbError) {
            console.error('Failed to fetch fallback labels:', dbError);
            setLabels(Array.from(new Set(
                conversationsRef.current
                    .flatMap((conv) => Array.isArray(conv?.labels) ? conv.labels : [])
                    .map(label => String(label || '').trim())
                    .filter(Boolean)
            )).sort((a, b) => a.localeCompare(b)));
        }
    }, []);

    const fetchContactAttributeDefinitions = useCallback(async (signal: AbortSignal) => {
        try {
            const normalizedDefinitions = await chatwootRepository.fetchContactAttributeDefinitions(signal);
            if (normalizedDefinitions.length > 0) {
                setContactAttributeDefinitions(normalizedDefinitions);
                return;
            }
        } catch (attributeError: unknown) {
            if (!isAbortError(attributeError)) {
                console.warn('[Dashboard] Chatwoot attribute definitions failed, trying Supabase:', attributeError);
            }
        }

        try {
            const { data, error: dbError } = await supabase
                .schema('cw')
                .from('attribute_definitions')
                .select('*')
                .eq('attribute_scope', 'contact')
                .order('attribute_display_name', { ascending: true });

            if (dbError) throw dbError;
            setContactAttributeDefinitions(dedupeContactAttributeDefinitions((data || []) as unknown[]));
        } catch (dbError) {
            console.error('Failed to fetch contact attribute definitions from Supabase:', dbError);
            setContactAttributeDefinitions([]);
        }
    }, []);

    const fetchLabelEvents = useCallback(async () => {
        try {
            const events = await labelEventClient.fetchLabelEvents();
            setLabelEvents(events);
        } catch (eventsError) {
            console.warn('[Dashboard] Could not load conversation label events:', eventsError);
            setLabelEvents([]);
        }
    }, []);

    const fetchCommercialAuditEvents = useCallback(async () => {
        try {
            const events = await commercialAuditClient.fetchAuditEvents();
            setCommercialAuditEvents(events);
        } catch (eventsError) {
            console.warn('[Dashboard] Could not load commercial audit events:', eventsError);
            setCommercialAuditEvents([]);
        }
    }, []);

    const previousLiveFallback = useCallback(() => {
        const liveWindow = hybridConversationRepository.getLiveWindow();
        return conversationsRef.current.filter((conv) => {
            const timestamp = conv.timestamp || conv.created_at || 0;
            return timestamp >= liveWindow.liveStartUnix;
        });
    }, []);

    const refreshHybridData = useCallback(async (signal: AbortSignal, showLoading = false) => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        if (showLoading) setLoading(true);

        try {
            const [historicalResult, liveResult] = await Promise.allSettled([
                hybridConversationRepository.fetchHistoricalBeforeLiveWindow(),
                hybridConversationRepository.fetchLiveConversations(signal)
            ]);

            if (signal.aborted) return;

            const historicalSucceeded = historicalResult.status === 'fulfilled';
            const liveSucceeded = liveResult.status === 'fulfilled';

            const historical = historicalSucceeded ? historicalResult.value.payload : [];
            const live = liveSucceeded ? liveResult.value.payload : previousLiveFallback();

            setHistoricalError(historicalSucceeded ? null : errorMessage(historicalResult.reason));
            setLiveError(liveSucceeded ? null : errorMessage(liveResult.reason));

            if (liveSucceeded) setLastLiveFetchAt(new Date());

            if (!historicalSucceeded && !liveSucceeded && conversationsRef.current.length === 0) {
                setError('No se pudo cargar ni Chatwoot live ni Supabase historico.');
                return;
            }

            let merged = mergeConversationsPreferApi(historical, live);

            const now = Date.now();
            const shouldRefreshHistoricalSnapshots = historicalSucceeded && (
                showLoading ||
                lastHistoricalDetailRefreshAtRef.current === 0 ||
                (now - lastHistoricalDetailRefreshAtRef.current) >= HISTORICAL_DETAIL_REFRESH_INTERVAL_MS
            );

            if (shouldRefreshHistoricalSnapshots) {
                const liveConversationIds = new Set(live.map((conversation) => Number(conversation.id)));
                const staleHistoricalIds = historical
                    .filter((conversation) => !liveConversationIds.has(Number(conversation.id)))
                    .sort((a, b) => (b.timestamp || b.created_at || 0) - (a.timestamp || a.created_at || 0))
                    .map((conversation) => Number(conversation.id))
                    .filter((conversationId) => Number.isFinite(conversationId))
                    .slice(0, HISTORICAL_DETAIL_REFRESH_LIMIT);

                if (staleHistoricalIds.length > 0) {
                    try {
                        const refreshedHistoricalSnapshots = await hybridConversationRepository.refreshConversationDetailsById(
                            staleHistoricalIds,
                            {
                                signal,
                                limit: HISTORICAL_DETAIL_REFRESH_LIMIT
                            }
                        );

                        if (!signal.aborted && refreshedHistoricalSnapshots.length > 0) {
                            merged = mergeConversationsPreferApi(merged, refreshedHistoricalSnapshots);
                        }
                    } catch (historicalRefreshError) {
                        if (!isAbortError(historicalRefreshError)) {
                            console.warn('[Dashboard] Historical snapshot refresh failed, keeping Supabase fallback:', historicalRefreshError);
                        }
                    }
                }

                lastHistoricalDetailRefreshAtRef.current = now;
            }

            await Promise.all([
                fetchLabelEvents(),
                fetchCommercialAuditEvents()
            ]);
            await updateVisualState(merged);

            if (historicalSucceeded && liveSucceeded) setDataSource('HYBRID');
            else if (liveSucceeded) setDataSource('API_ONLY');
            else setDataSource('SUPABASE_ONLY');

            setError(null);
        } catch (unexpectedError: unknown) {
            if (!isAbortError(unexpectedError)) {
                setError(errorMessage(unexpectedError));
            }
        } finally {
            isFetchingRef.current = false;
            setLoading(false);
        }
    }, [fetchCommercialAuditEvents, fetchLabelEvents, previousLiveFallback, updateVisualState]);

    const initData = useCallback(async () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        isFetchingRef.current = false;
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const signal = controller.signal;

        try {
            setLoading(true);

            await loadTagSettings();

            try {
                const cachedConversations = await indexedConversationRepository.loadConversations();
                if (cachedConversations.length > 0 && !signal.aborted) {
                    await updateVisualState(cachedConversations.map(c => ({ ...c, source: c.source || 'cache' })), false);
                }
            } catch (storageError) {
                console.warn('[Dashboard] IndexedDB cache read failed:', storageError);
            }

            await Promise.all([
                fetchInboxes(signal),
                fetchLabels(signal),
                fetchContactAttributeDefinitions(signal),
                fetchLabelEvents(),
                fetchCommercialAuditEvents(),
                refreshHybridData(signal, conversationsRef.current.length === 0)
            ]);
        } catch (initError: unknown) {
            if (!isAbortError(initError)) {
                setError(errorMessage(initError));
                setLoading(false);
            }
        }
    }, [
        fetchCommercialAuditEvents,
        fetchContactAttributeDefinitions,
        fetchInboxes,
        fetchLabelEvents,
        fetchLabels,
        loadTagSettings,
        refreshHybridData,
        updateVisualState
    ]);

    useEffect(() => {
        initData();

        const intervalId = window.setInterval(() => {
            const signal = abortControllerRef.current?.signal;
            if (signal && !signal.aborted) {
                refreshHybridData(signal);
            }
        }, POLL_INTERVAL_MS);

        return () => {
            window.clearInterval(intervalId);
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [initData, refreshHybridData]);

    return (
        <DashboardDataContext.Provider value={{
            conversations: resolvedConversations,
            labelEvents,
            commercialAuditEvents,
            inboxes,
            labels: effectiveLabels,
            contactAttributeDefinitions,
            tagSettings,
            loading,
            error,
            dataSource,
            lastLiveFetchAt,
            liveError,
            historicalError,
            updateTagSettings,
            globalFilters,
            setGlobalFilters,
            replaceConversation,
            refetch: initData
        }}>
            {children}
        </DashboardDataContext.Provider>
    );
};
