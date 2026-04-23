import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { chatwootService } from '../services/ChatwootService';
import { StorageService, MinifiedConversation } from '../services/StorageService';
import { HybridDashboardService, mergeConversationsPreferApi } from '../services/HybridDashboardService';
import { ConversationLabelEvent, LabelEventService } from '../services/LabelEventService';
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
    scoreHighTags?: string[];
    scoreMediumTags?: string[];
    scoreLowTags?: string[];
    humanFollowupQueueTags?: string[];
    humanAppointmentTargetLabel?: string;
    humanSalesQueueTags?: string[];
    humanSaleTargetLabel?: string;
    humanAppointmentFieldKeys?: string[];
}

type DashboardDataSource = 'HYBRID' | 'API_ONLY' | 'SUPABASE_ONLY';

type DashboardDataContextType = {
    conversations: MinifiedConversation[];
    labelEvents: ConversationLabelEvent[];
    inboxes: any[];
    labels: string[];
    tagSettings: TagConfig;
    loading: boolean;
    error: string | null;
    dataSource: DashboardDataSource;
    lastLiveFetchAt: Date | null;
    liveError: string | null;
    historicalError: string | null;
    updateTagSettings: (config: TagConfig) => void;
    globalFilters: DashboardFilters;
    setGlobalFilters: React.Dispatch<React.SetStateAction<DashboardFilters>>;
    refetch: () => Promise<void>;
};

export const DEFAULT_TAG_CONFIG: TagConfig = {
    sqlTags: ['interesado', 'crear_confianza', 'crear_urgencia'],
    appointmentTags: ['cita_agendada', 'cita'],
    saleTags: ['venta_exitosa', 'venta'],
    unqualifiedTags: ['desinteresado', 'descartado'],
    humanFollowupQueueTags: ['seguimiento_humano'],
    humanAppointmentTargetLabel: 'cita_agendada_humano',
    humanSalesQueueTags: ['cita_agendada', 'cita_agendada_humano'],
    humanSaleTargetLabel: 'venta_exitosa',
    humanAppointmentFieldKeys: []
};

const TAG_SETTINGS_STORAGE_KEY = 'dashboard_tag_settings';

const normalizeTagArray = (value: unknown, fallback: string[]) => {
    if (!Array.isArray(value)) return [...fallback];
    return Array.from(new Set(
        value
            .map(item => String(item || '').trim())
            .filter(Boolean)
    ));
};

export const normalizeTagConfig = (value?: Partial<TagConfig> | null): TagConfig => ({
    sqlTags: normalizeTagArray(value?.sqlTags, DEFAULT_TAG_CONFIG.sqlTags),
    appointmentTags: normalizeTagArray(value?.appointmentTags, DEFAULT_TAG_CONFIG.appointmentTags),
    saleTags: normalizeTagArray(value?.saleTags, DEFAULT_TAG_CONFIG.saleTags),
    unqualifiedTags: normalizeTagArray(value?.unqualifiedTags, DEFAULT_TAG_CONFIG.unqualifiedTags),
    scoreHighTags: normalizeTagArray(value?.scoreHighTags, DEFAULT_TAG_CONFIG.scoreHighTags || []),
    scoreMediumTags: normalizeTagArray(value?.scoreMediumTags, DEFAULT_TAG_CONFIG.scoreMediumTags || []),
    scoreLowTags: normalizeTagArray(value?.scoreLowTags, DEFAULT_TAG_CONFIG.scoreLowTags || []),
    humanFollowupQueueTags: normalizeTagArray(value?.humanFollowupQueueTags, DEFAULT_TAG_CONFIG.humanFollowupQueueTags || []),
    humanAppointmentTargetLabel: String(value?.humanAppointmentTargetLabel || DEFAULT_TAG_CONFIG.humanAppointmentTargetLabel || '').trim() || DEFAULT_TAG_CONFIG.humanAppointmentTargetLabel,
    humanSalesQueueTags: normalizeTagArray(value?.humanSalesQueueTags, DEFAULT_TAG_CONFIG.humanSalesQueueTags || []),
    humanSaleTargetLabel: String(value?.humanSaleTargetLabel || DEFAULT_TAG_CONFIG.humanSaleTargetLabel || '').trim() || DEFAULT_TAG_CONFIG.humanSaleTargetLabel,
    humanAppointmentFieldKeys: normalizeTagArray(value?.humanAppointmentFieldKeys, DEFAULT_TAG_CONFIG.humanAppointmentFieldKeys || [])
});

const persistTagSettingsLocally = (config: TagConfig) => {
    try {
        localStorage.setItem(TAG_SETTINGS_STORAGE_KEY, JSON.stringify(config));
    } catch (storageError) {
        console.warn('[Dashboard] Could not persist tag settings in localStorage:', storageError);
    }
};

const readLocalTagSettings = (): TagConfig | null => {
    try {
        const saved = localStorage.getItem(TAG_SETTINGS_STORAGE_KEY);
        if (!saved) return null;
        return normalizeTagConfig(JSON.parse(saved));
    } catch (storageError) {
        console.warn('[Dashboard] Could not read local tag settings:', storageError);
        return null;
    }
};

const POLL_INTERVAL_MS = 30000;

const DashboardDataContext = createContext<DashboardDataContextType>({
    conversations: [],
    labelEvents: [],
    inboxes: [],
    labels: [],
    tagSettings: DEFAULT_TAG_CONFIG,
    loading: true,
    error: null,
    dataSource: 'HYBRID',
    lastLiveFetchAt: null,
    liveError: null,
    historicalError: null,
    updateTagSettings: () => { },
    globalFilters: {},
    setGlobalFilters: () => { },
    refetch: async () => { }
});

export const useDashboardContext = () => useContext(DashboardDataContext);

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error || 'Error desconocido');

const isAbortError = (error: any) =>
    error?.name === 'AbortError' ||
    error?.name === 'CanceledError' ||
    error?.message === 'canceled';

export const DashboardDataProvider = ({ children }: { children: ReactNode }) => {
    const [conversations, setConversations] = useState<MinifiedConversation[]>([]);
    const [labelEvents, setLabelEvents] = useState<ConversationLabelEvent[]>([]);
    const [inboxes, setInboxes] = useState<any[]>([]);
    const [labels, setLabels] = useState<string[]>([]);
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

    const updateVisualState = async (newData: MinifiedConversation[], persist = true) => {
        conversationsRef.current = newData;
        setConversations(newData);

        if (persist && newData.length > 0) {
            try {
                await StorageService.saveConversations(newData);
            } catch (storageError) {
                console.warn('[Dashboard] IndexedDB cache write failed:', storageError);
            }
        }
    };

    const updateTagSettings = async (newConfig: TagConfig) => {
        const normalizedConfig = normalizeTagConfig(newConfig);
        setTagSettings(normalizedConfig);
        persistTagSettingsLocally(normalizedConfig);

        try {
            const { error: cwError } = await supabase
                .schema('cw')
                .from('dashboard_tag_settings')
                .upsert({ account_id: 0, settings: normalizedConfig, updated_at: new Date().toISOString() }, { onConflict: 'account_id' });

            if (cwError) throw cwError;
            return;
        } catch (cwError) {
            console.warn('[Dashboard] cw.dashboard_tag_settings unavailable, falling back to public:', cwError);
        }

        try {
            await supabase
                .from('dashboard_tag_settings')
                .upsert({ account_id: 0, settings: normalizedConfig, updated_at: new Date().toISOString() }, { onConflict: 'account_id' });
        } catch (publicError) {
            console.error('Failed to save dashboard tag settings:', publicError);
        }
    };

    const loadTagSettings = async () => {
        try {
            const { data, error: cwError } = await supabase
                .schema('cw')
                .from('dashboard_tag_settings')
                .select('settings')
                .eq('account_id', 0)
                .maybeSingle();

            if (cwError) throw cwError;
            if (data?.settings) {
                const normalizedConfig = normalizeTagConfig(data.settings);
                setTagSettings(normalizedConfig);
                persistTagSettingsLocally(normalizedConfig);
                return;
            }
        } catch (cwError) {
            console.warn('[Dashboard] Could not load settings from cw schema:', cwError);
        }

        try {
            const { data, error: publicError } = await supabase
                .from('dashboard_tag_settings')
                .select('settings')
                .eq('account_id', 0)
                .maybeSingle();

            if (publicError) throw publicError;
            if (data?.settings) {
                const normalizedConfig = normalizeTagConfig(data.settings);
                setTagSettings(normalizedConfig);
                persistTagSettingsLocally(normalizedConfig);
                return;
            }
        } catch (publicError) {
            console.warn('[Dashboard] Cloud settings load failed, using local/default:', publicError);
        }

        const saved = readLocalTagSettings();
        if (saved) {
            setTagSettings(saved);
        }
    };

    const fetchInboxes = async (signal: AbortSignal) => {
        try {
            const inboxesData = await chatwootService.getInboxes({ signal });
            setInboxes(Array.isArray(inboxesData) ? inboxesData.filter(i => i && i.id && i.channel_type) : []);
            return;
        } catch (apiError: any) {
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
            setInboxes((data || []).map((inbox: any) => ({
                id: inbox.chatwoot_inbox_id,
                name: inbox.name,
                channel_type: inbox.channel_type
            })));
        } catch (dbError) {
            console.error('Failed to fetch inboxes from Supabase:', dbError);
        }
    };

    const fetchLabels = async (signal: AbortSignal) => {
        try {
            const labelsData = await chatwootService.getLabels({ signal });
            setLabels(Array.isArray(labelsData) ? labelsData.filter(l => typeof l === 'string') : []);
        } catch (labelsError: any) {
            if (!isAbortError(labelsError)) {
                console.error('Failed to fetch labels:', labelsError);
            }
        }
    };

    const fetchLabelEvents = async () => {
        try {
            const events = await LabelEventService.fetchLabelEvents();
            setLabelEvents(events);
        } catch (eventsError) {
            console.warn('[Dashboard] Could not load conversation label events:', eventsError);
            setLabelEvents([]);
        }
    };

    const previousLiveFallback = () => {
        const liveWindow = HybridDashboardService.getLiveWindow();
        return conversationsRef.current.filter((conv) => {
            const timestamp = conv.timestamp || conv.created_at || 0;
            return timestamp >= liveWindow.liveStartUnix;
        });
    };

    const refreshHybridData = async (signal: AbortSignal, showLoading = false) => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        if (showLoading) setLoading(true);

        try {
            const [historicalResult, liveResult] = await Promise.allSettled([
                HybridDashboardService.fetchHistoricalBeforeLiveWindow(),
                HybridDashboardService.fetchLiveConversations(signal)
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

            const merged = mergeConversationsPreferApi(historical, live);
            await updateVisualState(merged);
            await fetchLabelEvents();

            if (historicalSucceeded && liveSucceeded) setDataSource('HYBRID');
            else if (liveSucceeded) setDataSource('API_ONLY');
            else setDataSource('SUPABASE_ONLY');

            setError(null);
        } catch (unexpectedError: any) {
            if (!isAbortError(unexpectedError)) {
                setError(errorMessage(unexpectedError));
            }
        } finally {
            isFetchingRef.current = false;
            setLoading(false);
        }
    };

    const initData = async () => {
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
                const cachedConversations = await StorageService.loadConversations();
                if (cachedConversations.length > 0 && !signal.aborted) {
                    await updateVisualState(cachedConversations.map(c => ({ ...c, source: c.source || 'cache' })), false);
                    setLoading(false);
                }
            } catch (storageError) {
                console.warn('[Dashboard] IndexedDB cache read failed:', storageError);
            }

            await Promise.all([
                fetchInboxes(signal),
                fetchLabels(signal),
                fetchLabelEvents(),
                refreshHybridData(signal, conversationsRef.current.length === 0)
            ]);
        } catch (initError: any) {
            if (!isAbortError(initError)) {
                setError(errorMessage(initError));
                setLoading(false);
            }
        }
    };

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
    }, []);

    return (
        <DashboardDataContext.Provider value={{
            conversations,
            labelEvents,
            inboxes,
            labels,
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
            refetch: initData
        }}>
            {children}
        </DashboardDataContext.Provider>
    );
};
