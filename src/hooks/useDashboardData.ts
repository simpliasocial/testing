import { useMemo } from 'react';
import { useDashboardContext } from '../context/DashboardDataContext';
import { getGuayaquilDateString } from '../lib/guayaquilTime';
import { getLeadAttrs } from '../lib/conversationState';
import { getLeadChannelName } from '../lib/leadDisplay';
import { getCommercialAuditSummary, getCommercialSaleDate, isCurrentSale, parseAmount } from '../lib/commercialFacts';

export interface DashboardFilters {
    startDate?: Date;
    endDate?: Date;
    selectedInboxes?: number[];
    sqlTags?: string[];
    appointmentTags?: string[];
    saleTags?: string[];
    unqualifiedTags?: string[];
    humanFollowupQueueTags?: string[];
    humanAppointmentTargetLabel?: string;
    humanSalesQueueTags?: string[];
    humanSaleTargetLabel?: string;
    humanAppointmentFieldKeys?: string[];
}

const FIRST_RESPONSE_GRACE_SECONDS = 60;
const UNASSIGNED_OWNER_NAME = 'Sin responsable';
const UNASSIGNED_OWNER_SOURCE = 'sin_asignar';

export const useDashboardData = (filtersOrMonth: DashboardFilters | Date | null = {}) => {
    const filters: DashboardFilters = useMemo(() => {
        if (!filtersOrMonth) return {};
        if (filtersOrMonth instanceof Date) {
            return {
                startDate: new Date(filtersOrMonth.getFullYear(), filtersOrMonth.getMonth(), 1),
                endDate: new Date(filtersOrMonth.getFullYear(), filtersOrMonth.getMonth() + 1, 0)
            };
        }
        return filtersOrMonth;
    }, [filtersOrMonth]);

    const { startDate, endDate, selectedInboxes = [], ...overrideTags } = filters;
    const { conversations: allConversations = [], labelEvents = [], commercialAuditEvents = [], inboxes, labels: configuredLabels, tagSettings: globalTagSettings, loading, error, refetch: contextRefetch } = useDashboardContext();

    const sqlTags = overrideTags.sqlTags || globalTagSettings.sqlTags;
    const appointmentTags = overrideTags.appointmentTags || globalTagSettings.appointmentTags;
    const saleTags = overrideTags.saleTags || globalTagSettings.saleTags;
    const unqualifiedTags = overrideTags.unqualifiedTags || globalTagSettings.unqualifiedTags;
    const humanFollowupQueueTags = overrideTags.humanFollowupQueueTags || globalTagSettings.humanFollowupQueueTags || ['seguimiento_humano'];
    const humanAppointmentTargetLabel = overrideTags.humanAppointmentTargetLabel || globalTagSettings.humanAppointmentTargetLabel || 'cita_agendada_humano';
    const humanSalesQueueTags = overrideTags.humanSalesQueueTags || globalTagSettings.humanSalesQueueTags || ['cita_agendada', 'cita_agendada_humano'];
    const humanSaleTargetLabel = overrideTags.humanSaleTargetLabel || globalTagSettings.humanSaleTargetLabel || 'venta_exitosa';

    const emptyData = {
        kpis: {
            totalLeads: 0,
            interestedLeads: 0,
            scheduledAppointments: 0,
            closedSales: 0,
            unqualified: 0,
            schedulingRate: 0,
            discardRate: 0,
            responseRate: 0,
            monthlyProfit: 0,
            totalProfit: 0
        },
        funnelData: [] as any[],
        historicalFunnelData: [] as any[],
        labelDistribution: [] as any[],
        recentAppointments: [] as any[],
        channelData: [] as any[],
        campaignData: [] as any[],
        weeklyTrend: [] as any[],
        monthlyTrend: [] as any[],
        disqualificationReasons: [] as any[],
        allLabels: [] as string[],
        dataCapture: {
            completionRate: 0,
            fieldRates: [] as any[],
            incomplete: 0,
            funnelDropoff: 0
        },
        responseTime: 0,
        ownerPerformance: [] as any[],
        operationalMetrics: {
            averageFirstResponseSeconds: 0,
            firstResponseAverageSeconds: 0,
            firstResponseRawAverageSeconds: 0,
            firstResponseGraceSeconds: FIRST_RESPONSE_GRACE_SECONDS,
            firstResponseMedianSeconds: 0,
            firstResponseCount: 0,
            incomingMessageTrafficByHour: [] as any[],
            incomingMessageTrafficByDateHour: [] as any[],
            trafficMeta: null as any,
            leadsWithOwnerCount: 0,
            totalLeads: 0,
            leadsWithOwnerPercentage: 0,
            leadsSinRespuesta: 0,
            slaPercentage: 0,
            agingData: [] as any[],
            activeLeads: [] as any[],
            trafficData: [] as any[],
            followUpQueue: [] as any[],
            scheduledAppointmentsQueue: [] as any[]
        },
        humanMetrics: {
            followup: 0,
            appointments: 0,
            followupCurrent: 0,
            humanAppointmentConversions: 0,
            humanAppointmentConversionRate: 0,
            humanAppointmentMode: 'estimated_legacy' as 'exact' | 'mixed' | 'estimated_legacy',
            salesCount: 0,
            salesVolume: 0,
            averageTicket: 0,
            conversionRate: 0,
            salesByDate: [] as any[],
            trackingStartedAt: null as string | null,
            nonAccountableAmountCount: 0,
            nonAccountableAmountTotal: 0,
            historicalSalesNotCurrentCount: 0,
            removedAmountCount: 0,
            commercialAuditRows: 0
        },
        trendMetrics: {
            channelLeads: [] as any[],
            disqualificationStats: [] as any[],
            campaignList: [] as any[],
            revenuePeaks: [] as any[]
        }
    };

    const data = useMemo(() => {
        if (!allConversations || allConversations.length === 0) {
            return emptyData;
        }

        // Helper to parsing Chatwoot timestamps (seconds vs ms)
        const parseTs = (ts: any): Date => {
            if (!ts) return new Date(0);
            const n = Number(ts);
            if (isNaN(n)) return new Date(ts); // ISO string
            if (n < 10000000000) return new Date(n * 1000);
            return new Date(n);
        };

        const getCreatedDate = (conv: any): Date => parseTs(conv.created_at || conv.timestamp);
        const getActivityDate = (conv: any): Date => parseTs(conv.timestamp || conv.created_at);
        const getCreatedUnix = (conv: any): number => {
            const created = conv.created_at || conv.timestamp || 0;
            const n = Number(created);
            if (!Number.isNaN(n)) return n < 10000000000 ? n : Math.floor(n / 1000);
            return Math.floor(parseTs(created).getTime() / 1000);
        };

        try {
            // 1. Determine Global Filter Range
            let globalStart: Date;
            let globalEnd: Date;

            if (startDate && endDate) {
                globalStart = new Date(startDate);
                globalStart.setHours(0, 0, 0, 0);
                globalEnd = new Date(endDate);
                globalEnd.setHours(23, 59, 59, 999);
            } else if (startDate) {
                globalStart = new Date(startDate);
                globalStart.setHours(0, 0, 0, 0);
                globalEnd = new Date();
                globalEnd.setHours(23, 59, 59, 999);
            } else {
                // TRUE HISTORICAL: From 2024 to Forever
                globalStart = new Date(2024, 0, 1);
                globalEnd = new Date(2030, 0, 1); // Way in the future
            }

            console.log(`[Dashboard] Range: ${globalStart.toLocaleDateString()} -> ${globalEnd.toLocaleDateString()}`);
            console.log(`[Dashboard] Total conversations in memory: ${allConversations.length}`);
            allConversations.forEach((c, idx) => {
                if (idx < 5) console.debug(`[Dashboard] Example Conv ${c.id} created: ${getCreatedDate(c).toLocaleString()} activity: ${getActivityDate(c).toLocaleString()}`);
            });

            // 2. Determine Monthly Trend Range
            let trendStart = globalStart;
            let trendEnd = globalEnd;

            const commercialTagSettings = {
                ...globalTagSettings,
                ...overrideTags,
                saleTags,
                humanSaleTargetLabel,
            };
            const isCurrentSaleLead = (conv: any) => isCurrentSale(conv, commercialTagSettings);

            // Filter Data for KPIs
            const kpiConversations = allConversations.filter(conv => {
                // 1. Channel Filter
                if (selectedInboxes.length > 0 && !selectedInboxes.includes(conv.inbox_id)) {
                    return false;
                }

                // 2. Date Filter
                const convDate = getCreatedDate(conv);
                const isInRange = convDate >= globalStart && convDate <= globalEnd;

                return isInRange;
            });

            console.log(`[Dashboard] kpiConversations filtered: ${kpiConversations.length}`);

            // Calculate Gain (Period vs Total)
            let monthlyProfit = 0;
            let totalProfit = 0;

            allConversations.forEach(conv => {
                // 1. Channel Filter for Profit too? Usually yes to be consistent
                if (selectedInboxes.length > 0 && !selectedInboxes.includes(conv.inbox_id)) {
                    return;
                }

                if (!isCurrentSaleLead(conv)) {
                    return;
                }

                const monto = parseAmount(conv.resolvedAttrs.monto_operacion);

                if (monto > 0) {
                    totalProfit += monto;

                    const fechaMonto = getCommercialSaleDate(conv, parseTs);
                    if (fechaMonto >= globalStart && fechaMonto <= globalEnd) {
                        monthlyProfit += monto;
                    }
                }
            });

            const totalLeads = kpiConversations.length;

            const countByPrimaryStage = (stage: string) =>
                kpiConversations.filter((conv) => conv.resolvedStage === stage).length;

            const interestedLeadsCount = countByPrimaryStage('sql');

            // == DYNAMIC DISCOVERY ==
            const allLabelSet = new Set<string>();
            const allAttributeKeys = new Set<string>();

            allConversations.forEach(conv => {
                (conv.resolvedLabels || []).forEach(l => allLabelSet.add(l));
            });

            // Count every label found for distribution
            const labelDistribution = Array.from(allLabelSet).map(label => ({
                label: label.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                key: label,
                value: kpiConversations.filter(c => c.resolvedLabels.includes(label)).length
            })).sort((a, b) => b.value - a.value);

            const hasHistoricalLabel = (conv: any, keys: string[]) => {
                if (!keys || keys.length === 0) return false;
                const searchSpace = new Set([
                    ...(conv.historical_labels || []),
                    ...(conv.resolvedLabels || []),
                    ...(conv.labels || [])
                ]);
                return keys.some(k => searchSpace.has(k));
            };

            const _getTagsForStage = (stage: 'sale' | 'appointment' | 'sql' | 'unqualified') => {
                switch (stage) {
                    case 'sale':
                        return [...(filters.saleTags || []), filters.humanSaleTargetLabel || 'venta_exitosa'].filter(Boolean);
                    case 'appointment':
                        return [
                            ...(filters.appointmentTags || []),
                            ...(filters.humanSalesQueueTags || []),
                            filters.humanAppointmentTargetLabel || 'cita_agendada_humano'
                        ].filter(Boolean);
                    case 'sql':
                        return filters.sqlTags || [];
                    case 'unqualified':
                        return filters.unqualifiedTags || [];
                    default: return [];
                }
            };

            let historicalVentaExitosaCount = 0;
            let historicalCitaAgendadaCount = 0;
            let historicalInteresadoCount = 0;

            const stageSaleTags = _getTagsForStage('sale');
            const apptTags = _getTagsForStage('appointment');
            const sqlTags = _getTagsForStage('sql');

            kpiConversations.forEach(conv => {
                // Cascading Funnel Logic: If they reached a deeper stage, they automatically succeeded in the prior stages.
                const reachedSale = isCurrentSaleLead(conv) || hasHistoricalLabel(conv, stageSaleTags);
                const reachedAppt = reachedSale || hasHistoricalLabel(conv, apptTags);
                const reachedSql = reachedAppt || hasHistoricalLabel(conv, sqlTags);

                if (reachedSale) historicalVentaExitosaCount++;
                if (reachedAppt) historicalCitaAgendadaCount++;
                if (reachedSql) historicalInteresadoCount++;
            });

            // Core KPI Mappings (Strict to Current Tags)
            const interesadoCount = countByPrimaryStage('sql');
            const citaAgendadaCount = countByPrimaryStage('appointment');
            const ventaExitosaCount = kpiConversations.filter(isCurrentSaleLead).length;
            const desinteresadoCount = countByPrimaryStage('unqualified');

            const schedulingRateVar = totalLeads > 0 ? Math.round((citaAgendadaCount / totalLeads) * 100) : 0;
            const discardRateVar = totalLeads > 0 ? Math.round((desinteresadoCount / totalLeads) * 100) : 0;
            const interactedConversations = kpiConversations.filter(c => c.status !== 'new').length;
            const responseRateVar = totalLeads > 0 ? Math.round((interactedConversations / totalLeads) * 100) : 0;

            const recentAppointments = kpiConversations
                .filter(c => {
                    const stage = c.resolvedStage;
                    return stage === 'appointment' || stage === 'sale';
                })
                .slice(0, 5) // Most recent 5
                .map(conv => {
                    return {
                        id: conv.id,
                        name: conv.meta?.sender?.name || conv.resolvedAttrs.nombre_completo || 'Sin Nombre',
                        cellphone: conv.meta?.sender?.phone_number || conv.resolvedAttrs.celular || 'Sin Teléfono',
                        agency: conv.resolvedAttrs.agencia || 'Sin Agencia',
                        date: conv.resolvedAttrs.fecha_visita || 'Pendiente',
                        time: conv.resolvedAttrs.hora_visita || '',
                        status: conv.resolvedStage === 'sale' ? 'Finalizado' : 'Confirmado'
                    };
                });

            const funnelData = [
                { label: "Interesado", value: interesadoCount, color: "hsl(200, 70%, 50%)" },
                { label: "Cita Agendada", value: citaAgendadaCount, color: "hsl(45, 93%, 58%)" },
                { label: "Venta Exitosa", value: ventaExitosaCount, color: "hsl(262, 83%, 58%)" },
            ];

            const historicalFunnelData = [
                { label: "Llegaron a SQL", value: historicalInteresadoCount, color: "hsl(200, 70%, 50%)" },
                { label: "Alcanzaron Cita", value: historicalCitaAgendadaCount, color: "hsl(45, 93%, 58%)" },
                { label: "Cerraron Venta", value: historicalVentaExitosaCount, color: "hsl(262, 83%, 58%)" },
            ];

            // If the standard funnel is empty, we show the top labels instead
            const displayFunnel = (interesadoCount === 0 && citaAgendadaCount === 0 && ventaExitosaCount === 0)
                ? labelDistribution.slice(0, 5).map(l => ({ label: l.label, value: l.value, color: `hsl(${Math.random() * 360}, 60%, 50%)` }))
                : funnelData;

            const inboxMap = new Map((inboxes || []).map((inbox: any) => [inbox.id, inbox]));
            const getChannelDisplayName = (conv: any) =>
                getLeadChannelName(conv, inboxMap.get(conv.inbox_id!));

            const channelCounts = new Map<string, number>();
            kpiConversations.forEach(conv => {
                const channelName = getChannelDisplayName(conv);
                channelCounts.set(channelName, (channelCounts.get(channelName) || 0) + 1);
            });

            const channelData = Array.from(channelCounts.entries()).map(([name, count]) => ({
                name, count, percentage: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0
            }));

            // Customer-service response timing from official Chatwoot first_reply metric.
            const getMessageTs = (message: any) => {
                const raw = message?.created_at_chatwoot || message?.created_at || message?.timestamp;
                const parsed = parseTs(raw);
                const seconds = Math.floor(parsed.getTime() / 1000);
                return Number.isFinite(seconds) ? seconds : 0;
            };
            const isIncomingMessage = (message: any) =>
                message?.message_direction === 'incoming' ||
                Number(message?.message_type) === 0 ||
                String(message?.message_type).toLowerCase() === 'incoming' ||
                String(message?.sender_type || '').toLowerCase() === 'contact';
            const hasMessageSenderSignal = (message: any) =>
                message?.message_direction !== undefined ||
                message?.message_type !== undefined ||
                message?.sender_type !== undefined;
            const getConversationMessages = (conv: any) =>
                Array.isArray(conv.messages)
                    ? conv.messages
                        .filter((message: any) => !message?.private && !message?.is_private && getMessageTs(message) > 0)
                        .sort((a: any, b: any) => getMessageTs(a) - getMessageTs(b))
                    : [];
            const getFirstResponseSeconds = (conv: any) => {
                if (conv.first_reply_created_at && conv.created_at) {
                    const diff = Number(conv.first_reply_created_at) - Number(conv.created_at);
                    if (diff >= 0 && diff <= 86400) return diff;
                }

                return null;
            };
            const hasUnansweredCustomerMessage = (conv: any) => {
                if (conv.waiting_since) return true;

                if (conv.last_non_activity_message && hasMessageSenderSignal(conv.last_non_activity_message)) {
                    return isIncomingMessage(conv.last_non_activity_message);
                }

                const messages = getConversationMessages(conv);
                if (messages.length > 0) {
                    const lastMessage = messages[messages.length - 1];
                    return isIncomingMessage(lastMessage);
                }

                if (conv.last_non_activity_message?.content && !conv.first_reply_created_at) {
                    return true;
                }

                return !conv.first_reply_created_at;
            };
            const firstResponseRawSamples = kpiConversations
                .map(getFirstResponseSeconds)
                .filter((value): value is number => typeof value === 'number');
            const firstResponseSamples = firstResponseRawSamples
                .map(value => Math.max(0, value - FIRST_RESPONSE_GRACE_SECONDS));
            const firstResponseAverageSeconds = firstResponseSamples.length > 0
                ? Math.round(firstResponseSamples.reduce((sum, value) => sum + value, 0) / firstResponseSamples.length)
                : 0;
            const firstResponseRawAverageSeconds = firstResponseRawSamples.length > 0
                ? Math.round(firstResponseRawSamples.reduce((sum, value) => sum + value, 0) / firstResponseRawSamples.length)
                : 0;
            const sortedFirstResponseSamples = [...firstResponseSamples].sort((a, b) => a - b);
            const firstResponseMedianSeconds = sortedFirstResponseSamples.length > 0
                ? sortedFirstResponseSamples.length % 2 === 0
                    ? Math.round((sortedFirstResponseSamples[(sortedFirstResponseSamples.length / 2) - 1] + sortedFirstResponseSamples[sortedFirstResponseSamples.length / 2]) / 2)
                    : sortedFirstResponseSamples[Math.floor(sortedFirstResponseSamples.length / 2)]
                : 0;
            const responseTime = firstResponseAverageSeconds > 0 ? Math.round(firstResponseAverageSeconds / 60) : 0;

            const getEffectiveOwner = (conv: any) => {
                const attrs = getLeadAttrs(conv);
                const manualResponsible = attrs.responsable?.toString().trim();
                const assignedAgent = conv.meta?.assignee?.name?.toString().trim();

                if (manualResponsible) return { name: manualResponsible, source: 'responsable' };
                if (assignedAgent) return { name: assignedAgent, source: 'agente' };
                return { name: UNASSIGNED_OWNER_NAME, source: UNASSIGNED_OWNER_SOURCE };
            };

            const mapQueueLead = (conv: any) => {
                const allAttrs = getLeadAttrs(conv);

                return {
                    id: conv.id,
                    name: conv.meta?.sender?.name || "Desconocido",
                    owner: allAttrs.responsable?.toString() || conv.meta?.assignee?.name || "Sin Asignar",
                    status: conv.status,
                    channel: getChannelDisplayName(conv),
                    channel_type: inboxMap.get(conv.inbox_id!)?.channel_type || "",
                    inbox_id: conv.inbox_id,
                    labels: conv.labels || [],
                    meta: conv.meta,
                    custom_attributes: conv.custom_attributes,
                    messages: conv.messages || [],
                    last_message: conv.messages && conv.messages.length > 0 ? conv.messages[conv.messages.length - 1] : conv.last_non_activity_message || null,
                    last_non_activity_message: conv.last_non_activity_message,
                    timestamp: conv.timestamp,
                    created_at: conv.created_at,
                    first_reply_created_at: conv.first_reply_created_at,
                    source: conv.source
                };
            };

            // Owner Performance with 'responsable' override. All assigned agents and manual responsable values are listed.
            const ownerStats = new Map<string, { name: string, leads: number, appointments: number, unanswered: number, source: string }>();
            const ensureOwner = (name: string, source: string) => {
                const cleanName = name?.toString().trim();
                if (!cleanName) return;
                if (!ownerStats.has(cleanName)) {
                    ownerStats.set(cleanName, { name: cleanName, leads: 0, appointments: 0, unanswered: 0, source });
                }
            };

            kpiConversations.forEach(conv => {
                const attrs = getLeadAttrs(conv);
                ensureOwner(conv.meta?.assignee?.name, 'agente');
                ensureOwner(attrs.responsable, 'responsable');
            });

            kpiConversations.forEach(conv => {
                const effectiveOwner = getEffectiveOwner(conv);
                ensureOwner(effectiveOwner.name, effectiveOwner.source);
                const s = effectiveOwner.name ? ownerStats.get(effectiveOwner.name) : null;
                if (!s) return;

                s.source = effectiveOwner.source === 'responsable' || effectiveOwner.source === UNASSIGNED_OWNER_SOURCE
                    ? effectiveOwner.source
                    : s.source;
                s.leads++;
                if (hasUnansweredCustomerMessage(conv)) s.unanswered++;

                const hasAppointment = conv.resolvedStage === 'appointment';
                if (hasAppointment) s.appointments++;
            });

            const ownerPerformance = Array.from(ownerStats.values())
                .map(s => ({
                    ...s,
                    winRate: s.leads > 0 ? Math.round((s.appointments / s.leads) * 100) : 0,
                    score: Math.min(100, 70 + (s.appointments * 2))
                }))
                .sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name));

            // Operational Metrics
            let leadsWithOwnerCount = 0;
            let unassignedLeadsCount = 0;

            // Traffic Peak Hours Calculation (0-23)
            const hourCounts = new Array(24).fill(0);

            const agingBuckets = [
                { range: "0-1 días", count: 0, color: "#10b981", maxDays: 1 },
                { range: "2-3 días", count: 0, color: "#3b82f6", maxDays: 3 },
                { range: "4-7 días", count: 0, color: "#f59e0b", maxDays: 7 },
                { range: "15+ días", count: 0, color: "#7f1d1d", maxDays: 9999 }
            ];

            kpiConversations.forEach(conv => {
                const effectiveOwner = getEffectiveOwner(conv);
                if (effectiveOwner.source === UNASSIGNED_OWNER_SOURCE) {
                    unassignedLeadsCount++;
                } else {
                    leadsWithOwnerCount++;
                }

                const d = getCreatedDate(conv);
                hourCounts[d.getHours()]++;
            });

            const trafficData = hourCounts.map((count, hour) => ({
                hour: `${hour.toString().padStart(2, '0')}:00`,
                count,
                label: `${hour.toString().padStart(2, '0')}:00`
            }));

            const operationalMetrics = {
                averageFirstResponseSeconds: firstResponseAverageSeconds,
                firstResponseAverageSeconds,
                firstResponseRawAverageSeconds,
                firstResponseGraceSeconds: FIRST_RESPONSE_GRACE_SECONDS,
                firstResponseMedianSeconds,
                firstResponseCount: firstResponseSamples.length,
                leadsWithOwnerCount,
                unassignedLeadsCount,
                totalLeads,
                leadsWithOwnerPercentage: totalLeads > 0 ? Math.round((leadsWithOwnerCount / totalLeads) * 100) : 0,
                leadsSinRespuesta: kpiConversations.filter(hasUnansweredCustomerMessage).length,
                slaPercentage: 0,
                agingData: [],
                trafficData: trafficData,
                followUpQueue: kpiConversations
                    .filter(c => c.resolvedLabels.some(l => humanFollowupQueueTags.includes(l)))
                    .map(mapQueueLead)
                    .sort((a, b) => b.timestamp - a.timestamp),
                scheduledAppointmentsQueue: kpiConversations
                    .filter(c => c.resolvedLabels.some(l => humanSalesQueueTags.includes(l)))
                    .map(mapQueueLead)
                    .sort((a, b) => b.timestamp - a.timestamp),
                activeLeads: kpiConversations.filter(c => c.status !== 'resolved').slice(0, 10).map(c => ({
                    id: c.id,
                    name: c.meta?.sender?.name || "Sin Nombre",
                    owner: (getLeadAttrs(c).responsable || c.meta?.assignee?.name || "Sin Asignar"),
                    status: c.status,
                    channel: getChannelDisplayName(c),
                    timestamp: c.timestamp
                }))
            };

            // Campaigns / Origins
            const campaignStats = new Map<string, { name: string, leads: number, interacted: number }>();
            kpiConversations.forEach(conv => {
                const attrs = getLeadAttrs(conv);
                const campName = String(attrs.utm_campaign || attrs.campana || attrs.origen || "").trim() || "Sin campaña";
                if (!campaignStats.has(campName)) campaignStats.set(campName, { name: campName, leads: 0, interacted: 0 });
                const s = campaignStats.get(campName)!;
                s.leads++;
                if (conv.status !== 'new') s.interacted++;
            });
            const campaignData = Array.from(campaignStats.values()).map(c => ({
                name: c.name,
                leads: c.leads,
                rate: c.leads > 0 ? Math.round((c.interacted / c.leads) * 100) : 0
            })).sort((a, b) => b.leads - a.leads);

            // Trends grouping (monthly)
            interface MonthlyTrendItem {
                date: string;
                leads: number;
                sqls: number;
                appointments: number;
                closedSales: number;
                timestamp: number;
            }
            const monthlyTrendMap = new Map<string, MonthlyTrendItem>();
            kpiConversations.forEach(conv => {
                const d = getCreatedDate(conv);
                const monthKey = d.toLocaleString('es-ES', { month: 'short', year: '2-digit' });
                // We use timestamp to sort them chronologically later
                const monthTs = new Date(d.getFullYear(), d.getMonth(), 1).getTime();

                if (!monthlyTrendMap.has(monthKey)) {
                    monthlyTrendMap.set(monthKey, { date: monthKey, leads: 0, sqls: 0, appointments: 0, closedSales: 0, timestamp: monthTs });
                }
                const stat = monthlyTrendMap.get(monthKey)!;
                stat.leads++;
                const stage = conv.resolvedStage;
                if (stage === 'sql') stat.sqls++;
                if (stage === 'appointment') stat.appointments++;
                if (isCurrentSaleLead(conv)) {
                    stat.closedSales = (stat.closedSales || 0) + 1;
                }
            });
            const monthlyTrend = Array.from(monthlyTrendMap.values()).sort((a, b) => a.timestamp - b.timestamp);

            // 7. Human Performance Metrics
            const conversationById = new Map(allConversations.map(conv => [Number(conv.id), conv]));
            const labelsInclude = (conv: any, label: string) => Array.isArray(conv.labels) && conv.labels.includes(label);
            const humanFollowup = kpiConversations.filter(c => c.resolvedLabels.some(l => humanFollowupQueueTags.includes(l))).length;

            const sortedLabelEvents = [...(labelEvents || [])].sort((a: any, b: any) =>
                parseTs(a.occurred_at).getTime() - parseTs(b.occurred_at).getTime()
            );
            const trackingStartedAt = sortedLabelEvents[0]?.occurred_at || null;
            const trackingStartDate = trackingStartedAt ? parseTs(trackingStartedAt) : null;
            const humanAppointmentMode: 'exact' | 'mixed' | 'estimated_legacy' = !trackingStartDate
                ? 'estimated_legacy'
                : globalStart < trackingStartDate && globalEnd >= trackingStartDate
                    ? 'mixed'
                    : globalEnd < trackingStartDate
                        ? 'estimated_legacy'
                        : 'exact';

            const filteredLabelEvents = sortedLabelEvents.filter((event: any) => {
                const eventDate = parseTs(event.occurred_at);
                if (Number.isNaN(eventDate.getTime()) || eventDate < globalStart || eventDate > globalEnd) return false;

                if (selectedInboxes.length > 0) {
                    const eventConversation = conversationById.get(Number(event.chatwoot_conversation_id));
                    if (!eventConversation || !selectedInboxes.includes(Number(eventConversation.inbox_id))) return false;
                }

                return true;
            });

            const exactHumanAppointmentIds = new Set<number>();
            filteredLabelEvents.forEach((event: any) => {
                const added = Array.isArray(event.added_labels) ? event.added_labels : [];
                const removed = Array.isArray(event.removed_labels) ? event.removed_labels : [];
                if (added.includes(humanAppointmentTargetLabel) && humanFollowupQueueTags.some(label => removed.includes(label))) {
                    exactHumanAppointmentIds.add(Number(event.chatwoot_conversation_id));
                }
            });

            const legacyHumanAppointments = kpiConversations.filter(conv => {
                if (!labelsInclude(conv, humanAppointmentTargetLabel)) return false;
                if (exactHumanAppointmentIds.has(Number(conv.id))) return false;
                if (humanAppointmentMode === 'exact') return false;
                if (!trackingStartDate) return true;
                return getCreatedDate(conv) < trackingStartDate;
            }).length;

            const humanAppointmentConversions = humanAppointmentMode === 'estimated_legacy'
                ? legacyHumanAppointments
                : exactHumanAppointmentIds.size + legacyHumanAppointments;
            const humanAppointmentConversionRate = (humanFollowup + humanAppointmentConversions) > 0
                ? Math.round((humanAppointmentConversions / (humanFollowup + humanAppointmentConversions)) * 100)
                : 0;

            const humanSales = allConversations
                .filter(conv => {
                    if (selectedInboxes.length > 0 && !selectedInboxes.includes(Number(conv.inbox_id))) return false;
                    if (!isCurrentSaleLead(conv)) return false;

                    const saleDate = getCommercialSaleDate(conv, parseTs);
                    return !Number.isNaN(saleDate.getTime()) && saleDate >= globalStart && saleDate <= globalEnd;
                });
            const salesByDateMap = new Map<string, { date: string, sales: number, salesVolume: number }>();
            const totalHumanSalesVolume = humanSales.reduce((acc, conv) => {
                const attrs = getLeadAttrs(conv);
                const saleDate = getCommercialSaleDate(conv, parseTs);
                const dateKey = getGuayaquilDateString(saleDate);
                const amount = parseAmount(attrs.monto_operacion);
                const row = salesByDateMap.get(dateKey) || { date: dateKey, sales: 0, salesVolume: 0 };
                row.sales += 1;
                row.salesVolume += amount;
                salesByDateMap.set(dateKey, row);
                return acc + amount;
            }, 0);
            const salesByDate = Array.from(salesByDateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
            const commercialAuditSummary = getCommercialAuditSummary(
                kpiConversations,
                commercialAuditEvents,
                commercialTagSettings
            );

            const humanMetrics = {
                followup: humanFollowup,
                appointments: humanAppointmentConversions,
                followupCurrent: humanFollowup,
                humanAppointmentConversions,
                humanAppointmentConversionRate,
                humanAppointmentMode,
                salesCount: humanSales.length,
                salesVolume: totalHumanSalesVolume,
                averageTicket: humanSales.length > 0 ? totalHumanSalesVolume / humanSales.length : 0,
                conversionRate: humanAppointmentConversionRate,
                salesByDate,
                trackingStartedAt,
                nonAccountableAmountCount: commercialAuditSummary.nonAccountableAmountCount,
                nonAccountableAmountTotal: commercialAuditSummary.nonAccountableAmountTotal,
                historicalSalesNotCurrentCount: commercialAuditSummary.historicalSalesNotCurrentCount,
                removedAmountCount: commercialAuditSummary.removedAmountCount,
                commercialAuditRows: commercialAuditSummary.auditRows
            };

            // 8. Trend Metrics
            const trendChannelCounts = new Map<string, number>();

            const disqualificationMap = new Map<string, number>();
            const campaignMap = new Map<string, number>();
            const revenueByDayMap = new Map<string, { date: string, value: number, sales: number }>();

            kpiConversations.forEach(conv => {
                const channelName = getChannelDisplayName(conv);
                trendChannelCounts.set(channelName, (trendChannelCounts.get(channelName) || 0) + 1);

                const matchedDisqualified = conv.labels?.find(l => unqualifiedTags.includes(l));
                if (matchedDisqualified) {
                    disqualificationMap.set(matchedDisqualified, (disqualificationMap.get(matchedDisqualified) || 0) + 1);
                }

                const attrs = getLeadAttrs(conv);
                const camp = attrs.campana?.toString();
                const cleanCamp = camp && camp.trim() ? camp.trim() : "Sin campaña";
                campaignMap.set(cleanCamp, (campaignMap.get(cleanCamp) || 0) + 1);
            });

            allConversations.forEach(conv => {
                if (selectedInboxes.length > 0 && !selectedInboxes.includes(Number(conv.inbox_id))) return;
                if (!isCurrentSaleLead(conv)) return;

                const revenueDate = getCommercialSaleDate(conv, parseTs);
                if (Number.isNaN(revenueDate.getTime()) || revenueDate < globalStart || revenueDate > globalEnd) return;

                const dateStr = getGuayaquilDateString(revenueDate);
                const val = parseAmount(conv.resolvedAttrs.monto_operacion);
                const row = revenueByDayMap.get(dateStr) || { date: dateStr, value: 0, sales: 0 };
                row.value += val;
                row.sales += 1;
                revenueByDayMap.set(dateStr, row);
            });

            const revenuePeaks = Array.from(revenueByDayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
            const revenuePeakDays = [...revenuePeaks].sort((a, b) => b.value - a.value).slice(0, 5);

            const trendMetrics = {
                channelLeads: Array.from(trendChannelCounts.entries()).map(([name, value]) => ({ name, value })).filter(c => c.value > 0).sort((a, b) => b.value - a.value),
                disqualificationStats: Array.from(disqualificationMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
                campaignList: Array.from(campaignMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
                revenuePeaks,
                revenuePeakDays
            };

            return {
                kpis: {
                    totalLeads: kpiConversations.length,
                    interestedLeads: interestedLeadsCount,
                    scheduledAppointments: citaAgendadaCount,
                    closedSales: ventaExitosaCount,
                    unqualified: desinteresadoCount,
                    schedulingRate: schedulingRateVar,
                    discardRate: discardRateVar,
                    responseRate: responseRateVar,
                    monthlyProfit,
                    totalProfit
                },
                funnelData: displayFunnel,
                historicalFunnelData,
                labelDistribution,
                recentAppointments,
                channelData,
                campaignData,
                weeklyTrend: [],
                monthlyTrend,
                disqualificationReasons: trendMetrics.disqualificationStats,
                allLabels: Array.from(new Set([...(configuredLabels || []), ...Array.from(allLabelSet)])),
                dataCapture: emptyData.dataCapture,
                responseTime,
                ownerPerformance,
                operationalMetrics,
                humanMetrics,
                trendMetrics
            };
        } catch (e) {
            console.error("Error calculating dashboard data:", e);
            return {
                ...emptyData,
                ownerPerformance: emptyData.ownerPerformance,
                operationalMetrics: emptyData.operationalMetrics,
                humanMetrics: emptyData.humanMetrics
            };
        }
    }, [allConversations, inboxes, configuredLabels, globalTagSettings, filters, commercialAuditEvents]);

    return { loading, error, data, refetch: contextRefetch };
};
