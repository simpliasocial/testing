import React, { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { chatwootService } from '../services/ChatwootService';
import { StorageService, MinifiedConversation } from '../services/StorageService';
import { HybridDashboardService, mergeConversationsPreferApi } from '../services/HybridDashboardService';
import { ConversationLabelEvent, LabelEventService } from '../services/LabelEventService';
import { supabase } from '../lib/supabase';
import { applyLatestLabelState, collectKnownLabels, getLeadAttrs, resolveLeadStage } from '../lib/conversationState';
import {
    DEFAULT_CRITICAL_REPORT_PROFILE_CONFIG,
    DEFAULT_REPORT_COLUMN_FIELDS,
    type CriticalReportProfileConfig
} from '../lib/reportCatalog';

export interface DashboardFilters {
    startDate?: Date;
    endDate?: Date;
    selectedInboxes?: number[];
}

export interface ChatwootAttributeDefinition {
    chatwoot_attribute_id?: number;
    attribute_key: string;
    attribute_display_name: string;
    attribute_display_type: string;
    attribute_description?: string;
    attribute_scope?: string;
    regex_pattern?: string | null;
    regex_cue?: string | null;
    raw_payload?: any;
}

export interface ScoreThresholds {
    highMin: number;
    mediumMin: number;
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
    scoreAttributeKey?: string;
    scoreAppointmentLabels?: string[];
    scoreThresholds?: ScoreThresholds;
    excelExportFields?: string[];
    reportColumnFields?: Record<string, string[]>;
    criticalReportProfiles?: Record<string, CriticalReportProfileConfig>;
}

export interface ResolvedConversation extends MinifiedConversation {
    resolvedLabels: string[];
    resolvedAttrs: Record<string, any>;
    resolvedStage: 'sale' | 'appointment' | 'unqualified' | 'followup' | 'sql' | 'other';
}

type DashboardDataSource = 'HYBRID' | 'API_ONLY' | 'SUPABASE_ONLY';

type DashboardDataContextType = {
    conversations: ResolvedConversation[];
    labelEvents: ConversationLabelEvent[];
    inboxes: any[];
    labels: string[];
    contactAttributeDefinitions: ChatwootAttributeDefinition[];
    tagSettings: TagConfig;
    loading: boolean;
    error: string | null;
    dataSource: DashboardDataSource;
    lastLiveFetchAt: Date | null;
    liveError: string | null;
    historicalError: string | null;
    updateTagSettings: (config: TagConfig) => Promise<void>;
    globalFilters: DashboardFilters;
    setGlobalFilters: React.Dispatch<React.SetStateAction<DashboardFilters>>;
    replaceConversation: (conversation: MinifiedConversation) => Promise<void>;
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
    scoreAttributeKey: '',
    scoreAppointmentLabels: ['cita_agendada', 'cita', 'cita_agendada_humano'],
    scoreThresholds: {
        highMin: 20,
        mediumMin: 10
    },
    excelExportFields: [
        "ID",
        "Nombre",
        "Telefono",
        "Canal",
        "Etiquetas",
        "Correo",
        "Monto",
        "Fecha Monto",
        "Agencia",
        "Check-in",
        "Check-out",
        "URL Red Social",
        "Enlace Chatwoot",
        "Fecha Ingreso",
        "Ultima Interaccion"
    ],
    reportColumnFields: DEFAULT_REPORT_COLUMN_FIELDS,
    criticalReportProfiles: DEFAULT_CRITICAL_REPORT_PROFILE_CONFIG
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

const normalizeScoreThresholds = (value?: Partial<ScoreThresholds> | null): ScoreThresholds => {
    const defaultHigh = DEFAULT_TAG_CONFIG.scoreThresholds?.highMin ?? 20;
    const defaultMedium = DEFAULT_TAG_CONFIG.scoreThresholds?.mediumMin ?? 10;

    const parsedHigh = Number(value?.highMin);
    const parsedMedium = Number(value?.mediumMin);

    const highMin = Number.isFinite(parsedHigh) ? parsedHigh : defaultHigh;
    const mediumMin = Number.isFinite(parsedMedium) ? parsedMedium : defaultMedium;

    if (highMin <= mediumMin) {
        return {
            highMin: defaultHigh,
            mediumMin: defaultMedium
        };
    }

    return {
        highMin,
        mediumMin
    };
};

const normalizeReportColumnFields = (value?: Record<string, unknown> | null) => {
    const entries = Object.entries(DEFAULT_REPORT_COLUMN_FIELDS).map(([tabId, fallback]) => {
        const configured = value?.[tabId];
        return [tabId, normalizeTagArray(configured, fallback)];
    });

    return Object.fromEntries(entries);
};

const normalizeCriticalReportProfiles = (value?: Record<string, Partial<CriticalReportProfileConfig>> | null) => {
    const entries = Object.entries(DEFAULT_CRITICAL_REPORT_PROFILE_CONFIG).map(([key, fallback]) => {
        const configured = value?.[key];
        return [
            key,
            {
                tabIds: normalizeTagArray(configured?.tabIds, fallback.tabIds || []),
                fileFormats: normalizeTagArray(configured?.fileFormats, fallback.fileFormats || []),
                isActive: typeof configured?.isActive === 'boolean' ? configured.isActive : fallback.isActive
            }
        ];
    });

    return Object.fromEntries(entries);
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
    humanAppointmentFieldKeys: normalizeTagArray(value?.humanAppointmentFieldKeys, DEFAULT_TAG_CONFIG.humanAppointmentFieldKeys || []),
    scoreAttributeKey: String(value?.scoreAttributeKey || DEFAULT_TAG_CONFIG.scoreAttributeKey || '').trim(),
    scoreAppointmentLabels: normalizeTagArray(value?.scoreAppointmentLabels, DEFAULT_TAG_CONFIG.scoreAppointmentLabels || []),
    scoreThresholds: normalizeScoreThresholds(value?.scoreThresholds),
    excelExportFields: normalizeTagArray(value?.excelExportFields, DEFAULT_TAG_CONFIG.excelExportFields || []),
    reportColumnFields: normalizeReportColumnFields(value?.reportColumnFields),
    criticalReportProfiles: normalizeCriticalReportProfiles(value?.criticalReportProfiles)
});

const persistTagSettingsLocally = (config: TagConfig) => {
    const serialized = JSON.stringify(normalizeTagConfig(config));
    try {
        localStorage.setItem(TAG_SETTINGS_STORAGE_KEY, serialized);
    } catch (storageError) {
        try {
            localStorage.removeItem(TAG_SETTINGS_STORAGE_KEY);
            localStorage.setItem(TAG_SETTINGS_STORAGE_KEY, serialized);
        } catch (retryError) {
            console.warn('[Dashboard] Could not persist tag settings in localStorage:', retryError);
        }
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
const HISTORICAL_DETAIL_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const HISTORICAL_DETAIL_REFRESH_LIMIT = 250;

const DashboardDataContext = createContext<DashboardDataContextType>({
    conversations: [],
    labelEvents: [],
    inboxes: [],
    labels: [],
    contactAttributeDefinitions: [],
    tagSettings: DEFAULT_TAG_CONFIG,
    loading: true,
    error: null,
    dataSource: 'HYBRID',
    lastLiveFetchAt: null,
    liveError: null,
    historicalError: null,
    updateTagSettings: async () => { },
    globalFilters: {},
    setGlobalFilters: () => { },
    replaceConversation: async () => { },
    refetch: async () => { }
});

export const useDashboardContext = () => useContext(DashboardDataContext);

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error || 'Error desconocido');

const isAbortError = (error: any) =>
    error?.name === 'AbortError' ||
    error?.name === 'CanceledError' ||
    error?.message === 'canceled';

const normalizeText = (value: unknown) => String(value || '').trim();

const resolveAttributeScope = (definition: any) => {
    const rawPayload = definition?.raw_payload || definition;
    const directScope = normalizeText(definition?.attribute_scope || rawPayload?.attribute_scope).toLowerCase();
    if (directScope.includes('conversation')) return 'conversation';
    if (directScope.includes('contact')) return 'contact';

    const directModel = normalizeText(definition?.attribute_model || rawPayload?.attribute_model_type).toLowerCase();
    if (directModel.includes('conversation')) return 'conversation';
    if (directModel.includes('contact')) return 'contact';

    const numericModel = Number(rawPayload?.attribute_model ?? definition?.attribute_model);
    if (!Number.isNaN(numericModel)) {
        return numericModel === 0 ? 'conversation' : 'contact';
    }

    return 'contact';
};

const normalizeAttributeDefinition = (definition: any): ChatwootAttributeDefinition | null => {
    const rawPayload = definition?.raw_payload || definition;
    const attribute_key = normalizeText(definition?.attribute_key || rawPayload?.attribute_key || rawPayload?.key);
    if (!attribute_key) return null;

    const chatwoot_attribute_id = Number(definition?.chatwoot_attribute_id ?? rawPayload?.id);

    return {
        chatwoot_attribute_id: Number.isNaN(chatwoot_attribute_id) ? undefined : chatwoot_attribute_id,
        attribute_key,
        attribute_display_name: normalizeText(definition?.attribute_display_name || rawPayload?.attribute_display_name || attribute_key),
        attribute_display_type: normalizeText(definition?.attribute_display_type || rawPayload?.attribute_display_type || rawPayload?.type),
        attribute_description: normalizeText(definition?.attribute_description || rawPayload?.attribute_description || rawPayload?.description || rawPayload?.regex_cue),
        attribute_scope: resolveAttributeScope(definition),
        regex_pattern: definition?.regex_pattern ?? rawPayload?.regex_pattern ?? null,
        regex_cue: definition?.regex_cue ?? rawPayload?.regex_cue ?? null,
        raw_payload: rawPayload
    };
};

const dedupeAttributeDefinitions = (definitions: any[]) => {
    const byKey = new Map<string, ChatwootAttributeDefinition>();

    definitions.forEach((definition) => {
        const normalizedDefinition = normalizeAttributeDefinition(definition);
        if (!normalizedDefinition) return;

        const existing = byKey.get(normalizedDefinition.attribute_key);
        byKey.set(normalizedDefinition.attribute_key, {
            ...existing,
            ...normalizedDefinition
        });
    });

    return Array.from(byKey.values())
        .filter((definition) => definition.attribute_scope !== 'conversation')
        .sort((a, b) =>
            (a.attribute_display_name || a.attribute_key).localeCompare(b.attribute_display_name || b.attribute_key)
        );
};

export const DashboardDataProvider = ({ children }: { children: ReactNode }) => {
    const [conversations, setConversations] = useState<MinifiedConversation[]>([]);
    const [labelEvents, setLabelEvents] = useState<ConversationLabelEvent[]>([]);
    const [inboxes, setInboxes] = useState<any[]>([]);
    const [labels, setLabels] = useState<string[]>([]);
    const [contactAttributeDefinitions, setContactAttributeDefinitions] = useState<ChatwootAttributeDefinition[]>([]);
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

    const updateVisualState = async (newData: MinifiedConversation[], persist = true) => {
        conversationsRef.current = newData;
        setConversations(newData);

        if (persist && newData.length > 0) {
            try {
                await StorageService.saveConversations(newData, { replaceAll: true });
            } catch (storageError) {
                console.warn('[Dashboard] IndexedDB cache write failed:', storageError);
            }
        }
    };

    const replaceConversation = async (conversation: MinifiedConversation) => {
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
            await StorageService.saveConversations(nextConversations, { replaceAll: true });
        } catch (storageError) {
            console.warn('[Dashboard] IndexedDB cache write failed after conversation patch:', storageError);
        }
    };

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
            const { error: publicError } = await supabase
                .from('dashboard_tag_settings')
                .upsert({ account_id: 0, settings: normalizedConfig, updated_at: new Date().toISOString() }, { onConflict: 'account_id' });
            if (publicError) throw publicError;
        } catch (publicError) {
            console.error('Failed to save dashboard tag settings:', publicError);
            throw publicError;
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
            const normalizedApiLabels = Array.isArray(labelsData)
                ? Array.from(new Set(labelsData.filter(l => typeof l === 'string').map(l => l.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
                : [];
            if (normalizedApiLabels.length > 0) {
                setLabels(normalizedApiLabels);
                return;
            }
        } catch (labelsError: any) {
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
                ...(data || []).flatMap((row: any) => Array.isArray(row?.labels) ? row.labels : []),
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
    };

    const fetchContactAttributeDefinitions = async (signal: AbortSignal) => {
        try {
            const apiDefinitions = await chatwootService.getAttributeDefinitions({ signal });
            const normalizedDefinitions = dedupeAttributeDefinitions(apiDefinitions || []);
            if (normalizedDefinitions.length > 0) {
                setContactAttributeDefinitions(normalizedDefinitions);
                return;
            }
        } catch (attributeError: any) {
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
            setContactAttributeDefinitions(dedupeAttributeDefinitions(data || []));
        } catch (dbError) {
            console.error('Failed to fetch contact attribute definitions from Supabase:', dbError);
            setContactAttributeDefinitions([]);
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
                        const refreshedHistoricalSnapshots = await HybridDashboardService.refreshConversationDetailsById(
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

            await fetchLabelEvents();
            await updateVisualState(merged);

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
                fetchContactAttributeDefinitions(signal),
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
            conversations: resolvedConversations,
            labelEvents,
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
