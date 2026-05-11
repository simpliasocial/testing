import { useMemo } from 'react';
import { useDashboardContext } from '@/context/useDashboardContext';
import type { ResolvedConversation } from '@/context/dashboardDataTypes';
import { getGuayaquilDateString } from '@/lib/guayaquilTime';
import { getLeadAttrs } from '@/lib/conversationState';
import { getLeadChannelName } from '@/lib/leadDisplay';
import { getCommercialAuditSummary, getCommercialSaleDate, isCurrentSale, parseAmount } from '@/lib/commercialFacts';
import {
    FIRST_RESPONSE_GRACE_SECONDS,
    buildRecentAppointments,
    buildCurrentFunnelData,
    buildChannelData,
    buildHistoricalFunnelMetrics,
    buildLabelDistribution,
    collectConversationLabelSet,
    calculateFirstResponseMetrics,
    createEmptyDashboardData,
    buildOperationalMetrics,
    hasUnansweredCustomerMessage,
    resolveDashboardDateRange,
    resolveDashboardFiltersInput,
    resolveDisplayFunnel,
    type DashboardDataFilters,
    type DashboardDataViewModel,
    type HumanAppointmentMode,
} from '@/application/dashboard';
import { cleanText } from '@/domain/common/types';
import type { Inbox } from '@/domain/lead';
import { parseTimestampToDate } from '@/shared/time/timestamps';

export type DashboardFilters = DashboardDataFilters;

export const useDashboardData = (filtersOrMonth: DashboardFilters | Date | null = {}) => {
    const filters: DashboardFilters = useMemo(
        () => resolveDashboardFiltersInput(filtersOrMonth),
        [filtersOrMonth],
    );

    const { conversations: allConversations = [], labelEvents = [], commercialAuditEvents = [], inboxes, labels: configuredLabels, tagSettings: globalTagSettings, loading, error, refetch: contextRefetch } = useDashboardContext();

    const emptyData = useMemo(() => createEmptyDashboardData(), []);

    const data = useMemo<DashboardDataViewModel>(() => {
        if (!allConversations || allConversations.length === 0) {
            return emptyData;
        }

        // Helper to parsing Chatwoot timestamps (seconds vs ms)
        const parseTs = (ts: unknown): Date => parseTimestampToDate(ts);

        const getCreatedDate = (conv: ResolvedConversation): Date => parseTs(conv.created_at || conv.timestamp);
        const getActivityDate = (conv: ResolvedConversation): Date => parseTs(conv.timestamp || conv.created_at);
        const getCreatedUnix = (conv: ResolvedConversation): number => {
            const created = conv.created_at || conv.timestamp || 0;
            const n = Number(created);
            if (!Number.isNaN(n)) return n < 10000000000 ? n : Math.floor(n / 1000);
            return Math.floor(parseTs(created).getTime() / 1000);
        };

        try {
            // 1. Determine Global Filter Range
            const { start: globalStart, end: globalEnd } = resolveDashboardDateRange(filters);
            const { selectedInboxes = [], ...overrideTags } = filters;
            const saleTags = overrideTags.saleTags || globalTagSettings.saleTags;
            const unqualifiedTags = overrideTags.unqualifiedTags || globalTagSettings.unqualifiedTags;
            const humanFollowupQueueTags = overrideTags.humanFollowupQueueTags || globalTagSettings.humanFollowupQueueTags || ['seguimiento_humano'];
            const humanAppointmentTargetLabel = overrideTags.humanAppointmentTargetLabel || globalTagSettings.humanAppointmentTargetLabel || 'cita_agendada_humano';
            const humanSalesQueueTags = overrideTags.humanSalesQueueTags || globalTagSettings.humanSalesQueueTags || ['cita_agendada', 'cita_agendada_humano'];
            const humanSaleTargetLabel = overrideTags.humanSaleTargetLabel || globalTagSettings.humanSaleTargetLabel || 'venta_exitosa';

            console.log(`[Dashboard] Range: ${globalStart.toLocaleDateString()} -> ${globalEnd.toLocaleDateString()}`);
            console.log(`[Dashboard] Total conversations in memory: ${allConversations.length}`);
            allConversations.forEach((c, idx) => {
                if (idx < 5) console.debug(`[Dashboard] Example Conv ${c.id} created: ${getCreatedDate(c).toLocaleString()} activity: ${getActivityDate(c).toLocaleString()}`);
            });

            const commercialTagSettings = {
                ...globalTagSettings,
                ...overrideTags,
                saleTags,
                humanSaleTargetLabel,
            };
            const isCurrentSaleLead = (conv: ResolvedConversation) => isCurrentSale(conv, commercialTagSettings);

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

            const allLabelSet = collectConversationLabelSet(allConversations);
            const labelDistribution = buildLabelDistribution(allLabelSet, kpiConversations);
            const historicalFunnelMetrics = buildHistoricalFunnelMetrics(
                kpiConversations,
                filters,
                isCurrentSaleLead,
            );

            // Core KPI Mappings (Strict to Current Tags)
            const interesadoCount = countByPrimaryStage('sql');
            const citaAgendadaCount = countByPrimaryStage('appointment');
            const ventaExitosaCount = kpiConversations.filter(isCurrentSaleLead).length;
            const desinteresadoCount = countByPrimaryStage('unqualified');

            const schedulingRateVar = totalLeads > 0 ? Math.round((citaAgendadaCount / totalLeads) * 100) : 0;
            const discardRateVar = totalLeads > 0 ? Math.round((desinteresadoCount / totalLeads) * 100) : 0;
            const interactedConversations = kpiConversations.filter(c => c.status !== 'new').length;
            const responseRateVar = totalLeads > 0 ? Math.round((interactedConversations / totalLeads) * 100) : 0;

            const recentAppointments = buildRecentAppointments(kpiConversations);

            const funnelData = buildCurrentFunnelData(interesadoCount, citaAgendadaCount, ventaExitosaCount);
            const historicalFunnelData = historicalFunnelMetrics.data;
            const displayFunnel = resolveDisplayFunnel(funnelData, labelDistribution);

            const inboxMap = new Map((inboxes || []).map((inbox: Inbox) => [inbox.id, inbox]));
            const getChannelDisplayName = (conv: ResolvedConversation) =>
                getLeadChannelName(conv, inboxMap.get(conv.inbox_id!));

            const channelData = buildChannelData(kpiConversations, getChannelDisplayName);

            const firstResponseMetrics = calculateFirstResponseMetrics(
                kpiConversations,
                FIRST_RESPONSE_GRACE_SECONDS,
            );
            const { responseTimeMinutes: responseTime } = firstResponseMetrics;

            const { ownerPerformance, operationalMetrics } = buildOperationalMetrics({
                conversations: kpiConversations,
                firstResponseMetrics,
                firstResponseGraceSeconds: FIRST_RESPONSE_GRACE_SECONDS,
                followupQueueTags: humanFollowupQueueTags,
                salesQueueTags: humanSalesQueueTags,
                resolveChannelName: getChannelDisplayName,
                resolveChannelType: (conversation) => inboxMap.get(conversation.inbox_id!)?.channel_type || "",
                getCreatedDate,
                hasUnansweredMessage: hasUnansweredCustomerMessage,
            });

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
            const labelsInclude = (conv: ResolvedConversation, label: string) => Array.isArray(conv.labels) && conv.labels.includes(label);
            const humanFollowup = kpiConversations.filter(c => c.resolvedLabels.some(l => humanFollowupQueueTags.includes(l))).length;

            const sortedLabelEvents = [...(labelEvents || [])].sort((a, b) =>
                parseTs(a.occurred_at).getTime() - parseTs(b.occurred_at).getTime()
            );
            const trackingStartedAt = sortedLabelEvents[0]?.occurred_at || null;
            const trackingStartDate = trackingStartedAt ? parseTs(trackingStartedAt) : null;
            const humanAppointmentMode: HumanAppointmentMode = !trackingStartDate
                ? 'estimated_legacy'
                : globalStart < trackingStartDate && globalEnd >= trackingStartDate
                    ? 'mixed'
                    : globalEnd < trackingStartDate
                        ? 'estimated_legacy'
                        : 'exact';

            const filteredLabelEvents = sortedLabelEvents.filter((event) => {
                const eventDate = parseTs(event.occurred_at);
                if (Number.isNaN(eventDate.getTime()) || eventDate < globalStart || eventDate > globalEnd) return false;

                if (selectedInboxes.length > 0) {
                    const eventConversation = conversationById.get(Number(event.chatwoot_conversation_id));
                    if (!eventConversation || !selectedInboxes.includes(Number(eventConversation.inbox_id))) return false;
                }

                return true;
            });

            const exactHumanAppointmentIds = new Set<number>();
            filteredLabelEvents.forEach((event) => {
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
    }, [allConversations, inboxes, configuredLabels, globalTagSettings, filters, commercialAuditEvents, labelEvents, emptyData]);

    return { loading, error, data, refetch: contextRefetch };
};
