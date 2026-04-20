import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { chatwootService } from '../services/ChatwootService';
import { StorageService, MinifiedConversation } from '../services/StorageService';
import { SyncService } from '../services/SyncService';
import { supabase } from '../lib/supabase';

export interface DashboardFilters {
    startDate?: Date;
    endDate?: Date;
    selectedInboxes?: number[];
}

export interface TagConfig {
    sqlTags: string[];
    appointmentTags: string[];
    saleTags: string[];
    unqualifiedTags: string[];
}

type DashboardDataContextType = {
    conversations: MinifiedConversation[];
    inboxes: any[];
    labels: string[];
    tagSettings: TagConfig;
    loading: boolean;
    error: string | null;
    dataSource: 'API' | 'SUPABASE';
    updateTagSettings: (config: TagConfig) => void;
    globalFilters: DashboardFilters;
    setGlobalFilters: React.Dispatch<React.SetStateAction<DashboardFilters>>;
    refetch: () => Promise<void>;
};

const DEFAULT_TAG_CONFIG: TagConfig = {
    sqlTags: ['interesado', 'crear_confianza', 'crear_urgencia'],
    appointmentTags: ['cita_agendada', 'cita'],
    saleTags: ['venta_exitosa', 'venta'],
    unqualifiedTags: ['desinteresado', 'descartado']
};

const DashboardDataContext = createContext<DashboardDataContextType>({
    conversations: [],
    inboxes: [],
    labels: [],
    tagSettings: DEFAULT_TAG_CONFIG,
    loading: true,
    error: null,
    dataSource: 'API',
    updateTagSettings: () => { },
    globalFilters: {},
    setGlobalFilters: () => { },
    refetch: async () => { }
});

export const useDashboardContext = () => useContext(DashboardDataContext);

const BATCH_SIZE = 2; // concurrent requests per batch

const minimizeConvs = (conv: any): MinifiedConversation => {
    return {
        id: conv.id,
        status: conv.status,
        labels: conv.labels || [],
        timestamp: conv.timestamp || conv.created_at,
        created_at: conv.created_at,
        first_reply_created_at: conv.first_reply_created_at,
        meta: {
            sender: {
                name: conv.meta?.sender?.name,
                email: conv.meta?.sender?.email,
                phone_number: conv.meta?.sender?.phone_number,
                custom_attributes: conv.meta?.sender?.custom_attributes
            },
            assignee: {
                name: conv.meta?.assignee?.name,
                email: conv.meta?.assignee?.email
            }
        },
        custom_attributes: conv.custom_attributes,
        messages: conv.messages,
        inbox_id: conv.inbox_id
    };
};

export const DashboardDataProvider = ({ children }: { children: ReactNode }) => {
    const [conversations, setConversations] = useState<MinifiedConversation[]>([]);
    const [inboxes, setInboxes] = useState<any[]>([]);
    const [labels, setLabels] = useState<string[]>([]);
    const [tagSettings, setTagSettings] = useState<TagConfig>(DEFAULT_TAG_CONFIG);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dataSource, setDataSource] = useState<'API' | 'SUPABASE'>('API');
    const [globalFilters, setGlobalFilters] = useState<DashboardFilters>({});
    const conversationsRef = useRef<MinifiedConversation[]>([]);
    const abortControllerRef = useRef<AbortController | null>(null);
    const retryCountRef = useRef(0);

    const updateVisualState = (newData: MinifiedConversation[]) => {
        conversationsRef.current = newData;
        setConversations(newData);
    };

    const updateTagSettings = async (newConfig: TagConfig) => {
        setTagSettings(newConfig);
        // Local fallback
        localStorage.setItem('dashboard_tag_settings', JSON.stringify(newConfig));

        // Cloud persistence
        try {
            await supabase
                .from('dashboard_tag_settings')
                .upsert({ account_id: 0, settings: newConfig, updated_at: new Date() }, { onConflict: 'account_id' });
        } catch (e) {
            console.error("Failed to save settings to cloud", e);
        }
    };

    const loadTagSettings = async () => {
        // 1. Try cloud first
        try {
            const { data, error } = await supabase
                .from('dashboard_tag_settings')
                .select('settings')
                .eq('account_id', 0)
                .single();

            if (data?.settings) {
                setTagSettings(data.settings);
                localStorage.setItem('dashboard_tag_settings', JSON.stringify(data.settings));
                return;
            }
        } catch (e) {
            console.warn("Cloud settings load failed, using local/default", e);
        }

        // 2. Local fallback
        const saved = localStorage.getItem('dashboard_tag_settings');
        if (saved) {
            try {
                setTagSettings(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse saved tag settings", e);
            }
        }
    };

    const fetchInboxes = async (signal: AbortSignal) => {
        try {
            const inboxesData = await chatwootService.getInboxes({ signal } as any);
            setInboxes(Array.isArray(inboxesData) ? inboxesData.filter(i => i && i.id && i.channel_type) : []);
        } catch (err: any) {
            if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
                console.error("Failed to fetch inboxes:", err);
            }
        }
    };

    const fetchLabels = async (signal: AbortSignal) => {
        try {
            const labelsData = await chatwootService.getLabels({ signal } as any);
            setLabels(Array.isArray(labelsData) ? labelsData.filter(l => typeof l === 'string') : []);
        } catch (err: any) {
            if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
                console.error("Failed to fetch labels:", err);
            }
        }
    };

    const processSync = async (signal: AbortSignal) => {
        try {
            console.log(`[Sync] Attempting Chatwoot API (Attempt ${retryCountRef.current + 1})`);
            const latestSavedConv = conversationsRef.current[0]; // Assuming sorted locally (descending by timestamp/ID)

            let page = 1;
            let keepFetching = true;
            let newConversations: MinifiedConversation[] = [];

            while (keepFetching && !signal.aborted) {
                const response = await chatwootService.getConversations({ status: 'all', page, signal } as any);
                const apiConversations = response.payload || [];

                if (apiConversations.length === 0) {
                    keepFetching = false;
                    break;
                }

                const minifiedBatch = apiConversations.map(minimizeConvs);
                console.log(`[Sync] Page ${page} fetched ${minifiedBatch.length} conversations`);

                if (latestSavedConv) {
                    // Incremental update: check if our newest saved item is in this page
                    const foundIndex = minifiedBatch.findIndex(c => c.id === latestSavedConv.id);
                    if (foundIndex !== -1) {
                        // Found overlap, take only newer stuff
                        const validNewItems = minifiedBatch.slice(0, foundIndex);
                        newConversations = [...newConversations, ...validNewItems];
                        keepFetching = false; // We found the connection
                    } else {
                        newConversations = [...newConversations, ...minifiedBatch];
                        page++;
                    }
                } else {
                    // Full sync: we have no data, keep downloading everything
                    newConversations = [...newConversations, ...minifiedBatch];
                    page++;

                    // Simple rate limiting to avoid hitting the API too hard
                    if (page % BATCH_SIZE === 0) {
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }

            if (!signal.aborted) {
                if (newConversations.length > 0) {
                    // Determine new complete set
                    // Filter out duplicates just in case
                    const map = new Map<number, MinifiedConversation>();
                    conversationsRef.current.forEach(c => map.set(c.id, c));
                    newConversations.forEach(c => map.set(c.id, c));

                    const merged = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);

                    await StorageService.saveConversations(newConversations);
                    updateVisualState(merged);
                }

                // SUCCESS: Reset retries and set data source to API
                retryCountRef.current = 0;
                setDataSource('API');
            }

            // After UI is updated, trigger Supabase background sync (historical)
            const checkBootstrap = async () => {
                const { data: cursor, error: cursorError } = await supabase
                    .schema('cw')
                    .from('sync_cursor')
                    .select('cursor_name')
                    .eq('cursor_name', 'daily_delta')
                    .maybeSingle();

                if (cursorError) {
                    console.warn("[Sync] Cursor check warning (Supabase might be initializing):", cursorError);
                    return;
                }

                if (!cursor) {
                    console.log("[Sync] Starting bootstrap sync...");
                    await SyncService.bootstrap();
                    // After bootstrap, initialize daily cursor
                    await supabase.schema('cw').from('sync_cursor').upsert({
                        cursor_name: 'daily_delta',
                        last_until_ts: new Date().toISOString()
                    });
                } else {
                    await SyncService.runDailySync();
                }
            };

            checkBootstrap().catch(err => console.error("[Sync] Supabase Sync Error:", err));

        } catch (err: any) {
            if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
                console.error("[Sync] Chatwoot API error:", err);
                retryCountRef.current++;

                // Fallback after 3 consecutive errors
                if (retryCountRef.current >= 3) {
                    console.warn("[Sync] Consecutive failures. falling back to Supabase.");
                    setDataSource('SUPABASE');
                    await fetchFromSupabase();
                }
            }
        }
    };

    const fetchFromSupabase = async () => {
        try {
            console.log("Fetching fallback data from Supabase...");
            const { data: convs, error: dbError } = await supabase
                .schema('cw')
                .from('conversations_current')
                .select('*')
                .order('last_activity_at_chatwoot', { ascending: false });

            if (dbError) throw dbError;

            if (convs && convs.length > 0) {
                const mapped = convs.map(c => ({
                    id: c.chatwoot_conversation_id,
                    status: c.status,
                    labels: c.labels || [],
                    timestamp: Math.floor(new Date(c.created_at_chatwoot).getTime() / 1000),
                    created_at: Math.floor(new Date(c.created_at_chatwoot).getTime() / 1000),
                    first_reply_created_at: c.first_reply_created_at_chatwoot ? Math.floor(new Date(c.first_reply_created_at_chatwoot).getTime() / 1000) : undefined,
                    meta: c.meta || {
                        sender: {},
                        assignee: {}
                    },
                    custom_attributes: c.custom_attributes,
                    inbox_id: c.chatwoot_inbox_id
                }));
                updateVisualState(mapped as any);
            }
        } catch (err) {
            console.error("Failed to fetch from Supabase fallback:", err);
        }
    };

    const fetchHistoricalRangeFromSupabase = async (startDate: Date, endDate: Date) => {
        try {
            console.log(`Fetching historical data from Supabase for range: ${startDate.toISOString()} - ${endDate.toISOString()}`);
            setLoading(true);
            const { data: convs, error: dbError } = await supabase
                .schema('cw')
                .from('conversations_current')
                .select('*')
                .gte('created_at_chatwoot', startDate.toISOString())
                .lte('created_at_chatwoot', endDate.toISOString());

            if (dbError) throw dbError;

            if (convs && convs.length > 0) {
                const mapped = convs.map(c => ({
                    id: c.chatwoot_conversation_id,
                    status: c.status,
                    labels: c.labels || [],
                    timestamp: Math.floor(new Date(c.created_at_chatwoot).getTime() / 1000),
                    created_at: Math.floor(new Date(c.created_at_chatwoot).getTime() / 1000),
                    first_reply_created_at: c.first_reply_created_at_chatwoot ? Math.floor(new Date(c.first_reply_created_at_chatwoot).getTime() / 1000) : undefined,
                    meta: c.meta || { sender: {}, assignee: {} },
                    custom_attributes: c.custom_attributes,
                    inbox_id: c.chatwoot_inbox_id
                }));

                // Merge with existing conversations avoiding duplicates
                const map = new Map<number, MinifiedConversation>();
                conversationsRef.current.forEach(c => map.set(c.id, c));
                mapped.forEach(c => map.set((c as any).id, c as any));
                const merged = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);

                updateVisualState(merged);
            }
        } catch (err) {
            console.error("Failed to fetch historical data from Supabase:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (globalFilters.startDate) {
            const startDate = new Date(globalFilters.startDate);
            const endDate = globalFilters.endDate ? new Date(globalFilters.endDate) : new Date();

            // Chatwoot typically retains 1 year of data.
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

            // Fetch from Supabase if:
            // 1. The range starts more than a year ago.
            // 2. OR we want to ensure we have all data for this range (since local cache might be partial)
            // for now, we follow the 1-year rule strictly as requested, but also if local data is empty for a selected range
            if (startDate < oneYearAgo) {
                console.log("Date range is older than 1 year, fetching historical data from Supabase");
                fetchHistoricalRangeFromSupabase(startDate, endDate);
            }
        }
    }, [globalFilters.startDate, globalFilters.endDate]);

    const initData = async () => {
        loadTagSettings();
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;
        const signal = controller.signal;

        try {
            setLoading(true);

            // 1. Carga Inmediata (Cache-first) 
            const cachedConversations = await StorageService.loadConversations();
            if (cachedConversations.length > 0) {
                updateVisualState(cachedConversations);
                setLoading(false); // Make it responsive immediately
            }

            // 2. Load the metadata
            await Promise.all([
                fetchInboxes(signal),
                fetchLabels(signal)
            ]);

            // 3. Sync Historical or Incremental
            await processSync(signal);

            setLoading(false);

        } catch (err: any) {
            if (err.name !== 'AbortError') {
                setError(err.message || "Failed to initialize standard data.");
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        initData();

        // Polling en segundo plano
        const intervalId = setInterval(() => {
            if (abortControllerRef.current) {
                processSync(abortControllerRef.current.signal);
            }
        }, 30000);

        return () => {
            clearInterval(intervalId);
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    return (
        <DashboardDataContext.Provider value={{
            conversations,
            inboxes,
            labels,
            tagSettings,
            loading,
            error,
            dataSource,
            updateTagSettings,
            globalFilters,
            setGlobalFilters,
            refetch: initData
        }}>
            {children}
        </DashboardDataContext.Provider>
    );
};
