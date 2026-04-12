import { useMemo } from 'react';
import { useDashboardContext } from '../context/DashboardDataContext';

export const useDashboardData = (selectedMonth: Date | null = null, selectedWeek: string = "1") => {
    const { conversations: allConversationsRaw, inboxes, loading, error } = useDashboardContext();

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
        weeklyTrend: [] as any[],
        monthlyTrend: [] as any[],
        disqualificationReasons: [] as any[],
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

            if (selectedMonth) {
                globalStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
                globalEnd = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0, 23, 59, 59);
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
            let trendStart: Date;
            let trendEnd: Date;

            if (selectedMonth) {
                trendStart = globalStart;
                trendEnd = globalEnd;
            } else {
                const now = new Date();
                trendStart = new Date(now.getFullYear(), now.getMonth(), 1);
                trendEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            }

            // Calculate Total Profit - All Time
            const totalProfitAll = allConversationsRaw.reduce((sum, conv) => {
                const contactAttrs = conv.meta?.sender?.custom_attributes || {};
                const convAttrs = conv.custom_attributes || {};
                const montoVal = contactAttrs.monto_operacion || convAttrs.monto_operacion;
                return sum + parseMonto(montoVal);
            }, 0);

            // Filter Data for KPIs
            const kpiConversations = allConversationsRaw.filter(conv => {
                const convDate = parseTs(conv.timestamp);
                const isInRange = convDate >= globalStart && convDate <= globalEnd;

                console.debug(`[Dashboard] Filtering Conv ${conv.id}:`, {
                    date: convDate.toISOString(),
                    start: globalStart.toISOString(),
                    end: globalEnd.toISOString(),
                    isInRange
                });

                return isInRange;
            });

            console.log(`[Dashboard] kpiConversations filtered: ${kpiConversations.length}`);

            // Calculate Monthly/Period Profit
            let monthlyProfit = 0;
            allConversationsRaw.forEach(conv => {
                const contactAttrs = conv.meta?.sender?.custom_attributes || {};
                const convAttrs = conv.custom_attributes || {};
                const montoVal = contactAttrs.monto_operacion || convAttrs.monto_operacion;
                const monto = parseMonto(montoVal);

                if (monto > 0) {
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
            const countByLabel = (label: string) =>
                kpiConversations.filter(c => c.labels && c.labels.includes(label)).length;

            const interestedLeadsCount = countByLabel('interesado') + countByLabel('crear_confianza') + countByLabel('crear_urgencia');
            // == DYNAMIC DISCOVERY ==
            const allLabelSet = new Set<string>();
            const allAttributeKeys = new Set<string>();

            allConversationsRaw.forEach(conv => {
                (conv.labels || []).forEach(l => allLabelSet.add(l));
                const attrs = { ...(conv.custom_attributes || {}), ...(conv.meta?.sender?.custom_attributes || {}) };
                Object.keys(attrs).forEach(k => allAttributeKeys.add(k));
            });

            // Count every label found
            const labelDistribution = Array.from(allLabelSet).map(label => ({
                label: label.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                key: label,
                value: countByLabel(label)
            })).sort((a, b) => b.value - a.value);

            // Core KPI Mappings (Standard with Fallbacks)
            // If they change names, we try to find partial matches
            const citaAgendadaCount = countByLabel('cita_agendada') + countByLabel('cita');
            const desinteresadoCount = countByLabel('desinteresado') + countByLabel('descartado');
            const ventaExitosaCount = countByLabel('venta_exitosa') + countByLabel('venta');
            const interesadoCount = countByLabel('interesado');

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
            allConversationsRaw.forEach(conv => {
                const ownerName = conv.meta?.assignee?.name || "Sin Asignar";
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

            return {
                kpis: {
                    totalLeads,
                    interestedLeads: interestedLeadsCount,
                    scheduledAppointments: citaAgendadaCount,
                    closedSales: ventaExitosaCount,
                    unqualified: desinteresadoCount,
                    schedulingRate: schedulingRateVar,
                    discardRate: discardRateVar,
                    responseRate: responseRateVar,
                    monthlyProfit,
                    totalProfit: totalProfitAll
                },
                funnelData: displayFunnel,
                labelDistribution,
                recentAppointments,
                channelData,
                weeklyTrend: [],
                monthlyTrend: [],
                disqualificationReasons: [],
                dataCapture: emptyData.dataCapture,
                responseTime,
                ownerPerformance,
                operationalMetrics
            };
        } catch (e) {
            console.error("Error calculating dashboard data:", e);
            return emptyData;
        }
    }, [allConversationsRaw, inboxes, selectedMonth, selectedWeek]);

    return { loading, error, data, refetch: () => { } };
};
