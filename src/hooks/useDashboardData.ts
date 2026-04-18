import { useMemo } from 'react';
import { useDashboardContext } from '../context/DashboardDataContext';

export interface DashboardFilters {
    startDate?: Date;
    endDate?: Date;
    selectedInboxes?: number[];
    sqlTags?: string[];
    appointmentTags?: string[];
    saleTags?: string[];
    unqualifiedTags?: string[];
}

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
    const { conversations: allConversationsRaw, inboxes, labels: configuredLabels, tagSettings: globalTagSettings, loading, error } = useDashboardContext();

    const sqlTags = overrideTags.sqlTags || globalTagSettings.sqlTags;
    const appointmentTags = overrideTags.appointmentTags || globalTagSettings.appointmentTags;
    const saleTags = overrideTags.saleTags || globalTagSettings.saleTags;
    const unqualifiedTags = overrideTags.unqualifiedTags || globalTagSettings.unqualifiedTags;

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
            leadsWithOwnerPercentage: 0,
            leadsSinRespuesta: 0,
            slaPercentage: 0,
            agingData: [] as any[],
            activeLeads: [] as any[]
        }
    };

    const data = useMemo(() => {
        if (!allConversationsRaw || allConversationsRaw.length === 0) {
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

        // Helper to parse "monto_operacion"
        const parseMonto = (val: any): number => {
            if (!val) return 0;
            const clean = val.toString().replace(/[^0-9.]/g, '');
            const num = parseFloat(clean);
            return isNaN(num) ? 0 : num;
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
            console.log(`[Dashboard] Total conversations in memory: ${allConversationsRaw.length}`);
            allConversationsRaw.forEach((c, idx) => {
                if (idx < 5) console.debug(`[Dashboard] Example Conv ${c.id} date: ${parseTs(c.timestamp).toLocaleString()}`);
            });

            // 2. Determine Monthly Trend Range
            let trendStart = globalStart;
            let trendEnd = globalEnd;

            // Calculate Total Profit - All Time
            const totalProfitAll = allConversationsRaw.reduce((sum, conv) => {
                const contactAttrs = conv.meta?.sender?.custom_attributes || {};
                const convAttrs = conv.custom_attributes || {};
                const montoVal = contactAttrs.monto_operacion || convAttrs.monto_operacion;
                return sum + parseMonto(montoVal);
            }, 0);

            // Filter Data for KPIs
            const kpiConversations = allConversationsRaw.filter(conv => {
                // 1. Channel Filter
                if (selectedInboxes.length > 0 && !selectedInboxes.includes(conv.inbox_id)) {
                    return false;
                }

                // 2. Date Filter
                const convDate = parseTs(conv.timestamp);
                const isInRange = convDate >= globalStart && convDate <= globalEnd;

                return isInRange;
            });

            console.log(`[Dashboard] kpiConversations filtered: ${kpiConversations.length}`);

            // Calculate Gain (Period vs Total)
            let monthlyProfit = 0;
            let totalProfit = 0;

            allConversationsRaw.forEach(conv => {
                // 1. Channel Filter for Profit too? Usually yes to be consistent
                if (selectedInboxes.length > 0 && !selectedInboxes.includes(conv.inbox_id)) {
                    return;
                }

                const contactAttrs = conv.meta?.sender?.custom_attributes || {};
                const convAttrs = conv.custom_attributes || {};
                const montoVal = contactAttrs.monto_operacion || convAttrs.monto_operacion;
                const monto = parseMonto(montoVal);

                if (monto > 0) {
                    totalProfit += monto;

                    const fechaMontoStr = contactAttrs.fecha_monto_operacion || convAttrs.fecha_monto_operacion;
                    let fechaMonto: Date;
                    if (fechaMontoStr) {
                        fechaMonto = new Date(fechaMontoStr);
                    } else {
                        fechaMonto = parseTs(conv.timestamp);
                    }
                    if (fechaMonto >= globalStart && fechaMonto <= globalEnd) {
                        monthlyProfit += monto;
                    }
                }
            });

            const totalLeads = kpiConversations.length;
            const countByLabels = (labels: string[]) =>
                kpiConversations.filter(c => c.labels && labels.some(l => c.labels.includes(l))).length;

            const interestedLeadsCount = countByLabels(sqlTags);
            // == DYNAMIC DISCOVERY ==
            const allLabelSet = new Set<string>();
            const allAttributeKeys = new Set<string>();

            allConversationsRaw.forEach(conv => {
                (conv.labels || []).forEach(l => allLabelSet.add(l));
                const attrs = { ...(conv.custom_attributes || {}), ...(conv.meta?.sender?.custom_attributes || {}) };
                Object.keys(attrs).forEach(k => allAttributeKeys.add(k));
            });

            // Count every label found for distribution
            const labelDistribution = Array.from(allLabelSet).map(label => ({
                label: label.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                key: label,
                value: countByLabels([label])
            })).sort((a, b) => b.value - a.value);

            // Core KPI Mappings (Standard with Fallbacks)
            const citaAgendadaCount = countByLabels(appointmentTags);
            const desinteresadoCount = countByLabels(unqualifiedTags);
            const ventaExitosaCount = countByLabels(saleTags);
            const interesadoCount = countByLabels(sqlTags);

            const schedulingRateVar = totalLeads > 0 ? Math.round((citaAgendadaCount / totalLeads) * 100) : 0;
            const discardRateVar = totalLeads > 0 ? Math.round((desinteresadoCount / totalLeads) * 100) : 0;
            const interactedConversations = kpiConversations.filter(c => c.status !== 'new').length;
            const responseRateVar = totalLeads > 0 ? Math.round((interactedConversations / totalLeads) * 100) : 0;

            const recentAppointments = kpiConversations
                .filter(c => c.labels && (c.labels.includes('cita_agendada') || c.labels.includes('venta_exitosa') || c.labels.includes('cita')))
                .slice(0, 5)
                .map(conv => {
                    const attrs = { ...(conv.custom_attributes || {}), ...(conv.meta?.sender?.custom_attributes || {}) };
                    return {
                        id: conv.id,
                        name: conv.meta?.sender?.name || attrs.nombre_completo || 'Sin Nombre',
                        cellphone: conv.meta?.sender?.phone_number || attrs.celular || 'Sin Teléfono',
                        agency: attrs.agencia || 'Sin Agencia',
                        date: attrs.fecha_visita || 'Pendiente',
                        time: attrs.hora_visita || '',
                        status: (conv.labels.includes('venta_exitosa') || conv.labels.includes('venta')) ? 'Finalizado' : 'Confirmado'
                    };
                });

            const funnelData = [
                { label: "Interesado", value: interesadoCount, color: "hsl(200, 70%, 50%)" },
                { label: "Cita Agendada", value: citaAgendadaCount, color: "hsl(45, 93%, 58%)" },
                { label: "Venta Exitosa", value: ventaExitosaCount, color: "hsl(262, 83%, 58%)" },
            ];

            // If the standard funnel is empty, we show the top labels instead
            const displayFunnel = (interesadoCount === 0 && citaAgendadaCount === 0 && ventaExitosaCount === 0)
                ? labelDistribution.slice(0, 5).map(l => ({ label: l.label, value: l.value, color: `hsl(${Math.random() * 360}, 60%, 50%)` }))
                : funnelData;

            const inboxMap = new Map((inboxes || []).map((inbox: any) => [inbox.id, inbox]));
            const channelCounts = new Map<string, number>();
            kpiConversations.forEach(conv => {
                const inbox = conv.inbox_id ? inboxMap.get(conv.inbox_id) : null;
                const channelName = inbox ? (inbox.channel_type === 'Channel::Whatsapp' ? 'WhatsApp' : inbox.name) : 'Otro';
                channelCounts.set(channelName, (channelCounts.get(channelName) || 0) + 1);
            });

            const channelData = Array.from(channelCounts.entries()).map(([name, count]) => ({
                name, count, percentage: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0
            }));

            // Response Time Calculation
            let totalResponseTime = 0;
            let conversationsWithResponse = 0;
            kpiConversations.forEach(conv => {
                if (conv.first_reply_created_at && conv.created_at) {
                    const diff = conv.first_reply_created_at - conv.created_at;
                    if (diff >= 0 && diff <= 3600) {
                        totalResponseTime += diff;
                        conversationsWithResponse++;
                    }
                }
            });
            const responseTime = conversationsWithResponse > 0 ? Math.round(totalResponseTime / (conversationsWithResponse * 60)) : 0;

            // Owner Performance
            const ownerStats = new Map<string, { name: string, leads: number, appointments: number }>();
            kpiConversations.forEach(conv => {
                const ownerName = conv.meta?.assignee?.name;
                if (!ownerName) return; // Skip Sin Asignar

                if (!ownerStats.has(ownerName)) ownerStats.set(ownerName, { name: ownerName, leads: 0, appointments: 0 });
                const s = ownerStats.get(ownerName)!;
                s.leads++;
                if (conv.labels?.includes('cita_agendada')) s.appointments++;
            });

            const ownerPerformance = Array.from(ownerStats.values()).map(s => ({
                ...s,
                winRate: s.leads > 0 ? Math.round((s.appointments / s.leads) * 100) : 0,
                score: Math.min(100, 70 + (s.appointments * 2))
            })).sort((a, b) => b.leads - a.leads);

            // Operational Metrics
            const nowTs = Math.floor(Date.now() / 1000);
            let leadsWithOwnerCount = 0;
            let withinSlaCount = 0;
            const agingBuckets = [
                { range: "0-1 días", count: 0, color: "#10b981", maxDays: 1 },
                { range: "2-3 días", count: 0, color: "#3b82f6", maxDays: 3 },
                { range: "4-7 días", count: 0, color: "#f59e0b", maxDays: 7 },
                { range: "15+ días", count: 0, color: "#7f1d1d", maxDays: 9999 }
            ];

            kpiConversations.forEach(conv => {
                if (conv.meta?.assignee?.name) leadsWithOwnerCount++;
                if (conv.first_reply_created_at && conv.created_at && (conv.first_reply_created_at - conv.created_at) < 600) withinSlaCount++;
                const daysOld = (nowTs - conv.timestamp) / 86400;
                const bucket = agingBuckets.find(b => daysOld <= b.maxDays);
                if (bucket) bucket.count++;
            });

            const operationalMetrics = {
                leadsWithOwnerPercentage: totalLeads > 0 ? Math.round((leadsWithOwnerCount / totalLeads) * 100) : 0,
                leadsSinRespuesta: kpiConversations.filter(c => !c.first_reply_created_at).length,
                slaPercentage: interactedConversations > 0 ? Math.round((withinSlaCount / interactedConversations) * 100) : 0,
                agingData: agingBuckets,
                activeLeads: kpiConversations.filter(c => c.status !== 'resolved').slice(0, 10).map(c => ({
                    id: c.id,
                    name: c.meta?.sender?.name || "Sin Nombre",
                    owner: c.meta?.assignee?.name || "Sin Asignar",
                    status: c.status,
                    time: new Date(c.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    channel: inboxMap.get(c.inbox_id!)?.name || "Chatwoot"
                }))
            };

            // Campaigns / Origins
            const campaignStats = new Map<string, { name: string, leads: number, interacted: number }>();
            kpiConversations.forEach(conv => {
                const attrs = { ...(conv.custom_attributes || {}), ...(conv.meta?.sender?.custom_attributes || {}) };
                const campName = attrs.utm_campaign || attrs.campana || attrs.origen || "Orgánico / Directo";
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
                const d = parseTs(conv.timestamp);
                const monthKey = d.toLocaleString('es-ES', { month: 'short', year: '2-digit' });
                // We use timestamp to sort them chronologically later
                const monthTs = new Date(d.getFullYear(), d.getMonth(), 1).getTime();

                if (!monthlyTrendMap.has(monthKey)) {
                    monthlyTrendMap.set(monthKey, { date: monthKey, leads: 0, sqls: 0, appointments: 0, closedSales: 0, timestamp: monthTs });
                }
                const stat = monthlyTrendMap.get(monthKey)!;
                stat.leads++;
                if (conv.labels && sqlTags.some(l => conv.labels.includes(l))) {
                    stat.sqls++;
                }
                if (conv.labels && appointmentTags.some(l => conv.labels.includes(l))) {
                    stat.appointments++;
                }
                if (conv.labels && saleTags.some(l => conv.labels.includes(l))) {
                    stat.closedSales = (stat.closedSales || 0) + 1;
                }
            });
            const monthlyTrend = Array.from(monthlyTrendMap.values()).sort((a, b) => a.timestamp - b.timestamp);

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
                labelDistribution,
                recentAppointments,
                channelData,
                campaignData,
                weeklyTrend: [],
                monthlyTrend,
                disqualificationReasons: [],
                allLabels: Array.from(new Set([...(configuredLabels || []), ...Array.from(allLabelSet)])),
                dataCapture: emptyData.dataCapture,
                responseTime,
                ownerPerformance,
                operationalMetrics
            };
        } catch (e) {
            console.error("Error calculating dashboard data:", e);
            return emptyData;
        }
    }, [allConversationsRaw, inboxes, configuredLabels, globalTagSettings, filters]);

    return { loading, error, data, refetch: () => { } };
};
