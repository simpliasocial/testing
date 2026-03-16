import { useState, useEffect } from 'react';
import { chatwootService } from '../services/ChatwootService';

export const useDashboardData = (selectedMonth: Date | null = null, selectedWeek: string = "1") => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState({
        kpis: {
            totalLeads: 0,
            interestedLeads: 0,
            scheduledAppointments: 0,
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
        responseTime: 0
    });

    const fetchData = async (isBackground = false) => {
        if (!isBackground) {
            setLoading(true);
        }
        try {
            // 1. Determine Global Filter Range (for KPIs, Funnel, etc.)
            let globalStart: Date;
            let globalEnd: Date;

            if (selectedMonth) {
                globalStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
                globalEnd = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0, 23, 59, 59);
            } else {
                // All Time (Default: Jan 1 2026 to Now)
                globalStart = new Date(2026, 0, 1); // Jan 1, 2026
                globalEnd = new Date(); // Now
            }

            // 2. Determine Monthly Trend Range (Specific requirement: Show Current Month if "All Time" is selected)
            let trendStart: Date;
            let trendEnd: Date;

            if (selectedMonth) {
                trendStart = globalStart;
                trendEnd = globalEnd;
            } else {
                // If "All Time" selected, show Current Month for trend
                const now = new Date();
                trendStart = new Date(now.getFullYear(), now.getMonth(), 1);
                trendEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            }

            // 3. Fetch ALL conversations (Client-side filtering is safer for "February = 0" requirement)
            // We fetch 'all' status to get everything.
            // 3. Fetch ALL conversations (Iterate through pages)
            let allConversationsRaw: any[] = [];
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const response = await chatwootService.getConversations({ status: 'all', page });
                const conversations = response.payload;

                if (conversations.length === 0) {
                    hasMore = false;
                } else {
                    allConversationsRaw = [...allConversationsRaw, ...conversations];
                    // Check if we reached the last page
                    // If the number of items returned is less than typical page size (usually 25), we are done.
                    // Or check meta if available, but checking count is robust enough for now.
                    // Chatwoot default page size is 25.
                    if (conversations.length < 25) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                }
            }

            // Helper to parse "transaction_amount"
            const parseMonto = (val: any): number => {
                if (!val) return 0;
                // Remove non-numeric characters except dot and comma
                // Check format. If like "1,000.00" or "$1000", remove $ and ,
                // If "1.000,00" (European), might need heuristic, but assuming standard float-like or US currency for now based on user context.
                // Safest: Replace everything not 0-9 or .
                const clean = val.toString().replace(/[^0-9.]/g, '');
                const num = parseFloat(clean);
                return isNaN(num) ? 0 : num;
            };

            // Calculate Total Profit - All Time
            const totalProfitAll = allConversationsRaw.reduce((sum, conv) => {
                const contactAttrs = conv.meta?.sender?.custom_attributes || {};
                const convAttrs = conv.custom_attributes || {};
                const montoVal = contactAttrs.transaction_amount || convAttrs.transaction_amount;
                const monto = parseMonto(montoVal);
                return sum + monto;
            }, 0);

            // 4. Filter Data for KPIs
            const kpiConversations = allConversationsRaw.filter(conv => {
                const convDate = new Date(conv.timestamp * 1000);
                return convDate >= globalStart && convDate <= globalEnd;
            });

            console.log('Date Filter Debug:', {
                selectedMonth: selectedMonth ? selectedMonth.toISOString() : 'All Time',
                globalStart: globalStart.toISOString(),
                globalEnd: globalEnd.toISOString(),
                totalRawConversations: allConversationsRaw.length,
                filteredConversations: kpiConversations.length,
                sampleConversationDates: kpiConversations.slice(0, 3).map(c => ({
                    id: c.id,
                    timestamp: c.timestamp,
                    date: new Date(c.timestamp * 1000).toISOString()
                }))
            });

            // Calculate Monthly/Period Profit (Ganancia Mensual) - Filtered by date_amount_transaction
            let monthlyProfit = 0;
            let conversationsWithMontoInPeriod = 0;

            allConversationsRaw.forEach(conv => {
                const contactAttrs = conv.meta?.sender?.custom_attributes || {};
                const convAttrs = conv.custom_attributes || {};
                const montoVal = contactAttrs.transaction_amount || convAttrs.transaction_amount;
                const monto = parseMonto(montoVal);

                if (monto > 0) {
                    const fechaMontoStr = contactAttrs.date_amount_transaction || convAttrs.date_amount_transaction;

                    let fechaMonto: Date;
                    if (fechaMontoStr) {
                        fechaMonto = new Date(fechaMontoStr);
                    } else {
                        // Fallback: use the conversation date
                        fechaMonto = new Date(conv.timestamp * 1000);
                        console.warn(`Conversation ${conv.id} has transaction_amount but no date_amount_transaction. Using conversation date as fallback.`);
                    }

                    // Check whether the transaction date falls within the selected period
                    const isInPeriod = fechaMonto >= globalStart && fechaMonto <= globalEnd;

                    if (isInPeriod) {
                        monthlyProfit += monto;
                        conversationsWithMontoInPeriod++;

                            console.log('Amount included in period:', {
                            conversationId: conv.id,
                            monto,
                            fechaMonto: fechaMonto.toISOString(),
                            period: `${globalStart.toISOString()} to ${globalEnd.toISOString()}`
                        });
                    }
                }
            });

            console.log('Revenue Calculation Summary:', {
                period: selectedMonth ? selectedMonth.toISOString().split('T')[0] : 'All Time',
                globalStart: globalStart.toISOString(),
                globalEnd: globalEnd.toISOString(),
                conversationsWithMontoInPeriod,
                monthlyProfit,
                totalProfitAll
            });


            // Calculate KPIs from filtered data
            const totalLeads = kpiConversations.length;

            // Helper to count by label
            const countByLabel = (label: string) =>
                kpiConversations.filter(c => c.labels && c.labels.includes(label)).length;

            // Updated English Labels:
            const incomingLeadsCount = countByLabel('incoming_leads');
            const a_Count = countByLabel('a_');
            const b1Count = countByLabel('b1');
            const b2Count = countByLabel('b2');
            const c1Count = countByLabel('c1');
            const scheduledAppointmentsCount = countByLabel('scheduled_appointment');
            const successfulSaleCount = countByLabel('successful_sale');

            // KPI Logic
            const interestedLeadsCount = a_Count; // Only a_ = clients that ask/accept to schedule
            const schedulingRateVar = totalLeads > 0 ? Math.round((scheduledAppointmentsCount / totalLeads) * 100) : 0;
            const discardRateVar = totalLeads > 0 ? Math.round((c1Count / totalLeads) * 100) : 0;

            // Calculate Response Rate
            const interactedConversations = kpiConversations.filter(c => c.status !== 'new').length;
            const responseRateVar = totalLeads > 0 ? Math.round((interactedConversations / totalLeads) * 100) : 0;

            // Recent Appointments (from filtered data)
            const recentAppointments = kpiConversations
                .filter(c => c.labels && c.labels.includes('scheduled_appointment'))
                .slice(0, 5)
                .map(conv => {
                    // Search data first in contact attributes, then in conversation attributes
                    const contactAttrs = conv.meta?.sender?.custom_attributes || {};
                    const convAttrs = conv.custom_attributes || {};

                    return {
                        id: conv.id,
                        name: contactAttrs.full_name || convAttrs.full_name || conv.meta?.sender?.name || 'No Name',
                        cellphone: contactAttrs.cellphone || convAttrs.cellphone || conv.meta?.sender?.phone_number || 'No Cellphone',
                        agency: contactAttrs.agency || convAttrs.agency || 'No Agency',
                        date: contactAttrs.visit_date || convAttrs.visit_date || 'Pending',
                        time: contactAttrs.visit_time || convAttrs.visit_time || '',
                        status: 'Confirmed'
                    };
                });

            // Funnel Data
            const funnelData = [
                { label: "incoming_leads", value: incomingLeadsCount, percentage: totalLeads > 0 ? Math.round((incomingLeadsCount / totalLeads) * 100) : 0, color: "hsl(200, 70%, 50%)" },
                { label: "a_", value: a_Count, percentage: totalLeads > 0 ? Math.round((a_Count / totalLeads) * 100) : 0, color: "hsl(224, 62%, 32%)" },
                { label: "b1", value: b1Count, percentage: totalLeads > 0 ? Math.round((b1Count / totalLeads) * 100) : 0, color: "hsl(142, 60%, 45%)" },
                { label: "b2", value: b2Count, percentage: totalLeads > 0 ? Math.round((b2Count / totalLeads) * 100) : 0, color: "hsl(142, 60%, 55%)" },
                { label: "scheduled_appointment", value: scheduledAppointmentsCount, percentage: totalLeads > 0 ? Math.round((scheduledAppointmentsCount / totalLeads) * 100) : 0, color: "hsl(45, 93%, 58%)" },
                { label: "c1", value: c1Count, percentage: totalLeads > 0 ? Math.round((c1Count / totalLeads) * 100) : 0, color: "hsl(0, 70%, 60%)" },
                { label: "successful_sale", value: successfulSaleCount, percentage: totalLeads > 0 ? Math.round((successfulSaleCount / totalLeads) * 100) : 0, color: "hsl(120, 70%, 40%)" },
            ];

            // Debugging: Log all unique labels found to help verify KPIs
            const allLabels = new Set<string>();
            kpiConversations.forEach(c => c.labels?.forEach(l => allLabels.add(l)));
            console.log('Unique Labels Found in Dashboard Data:', Array.from(allLabels));
            console.log('Unique Labels Found in Dashboard Data:', Array.from(allLabels));
            console.log('Total Leads:', totalLeads);
            console.log('Interested Leads Count:', interestedLeadsCount);

            // Channel Breakdown
            // Fetch inboxes to map IDs to Names/Types
            const inboxes = await chatwootService.getInboxes();
            const inboxMap = new Map(inboxes.map((inbox: any) => [inbox.id, inbox]));

            const channelCounts = new Map<string, number>();
            kpiConversations.forEach(conv => {
                const inbox = inboxMap.get(conv.inbox_id);
                let channelName = 'Other';

                if (inbox) {
                    // Map channel type to display name
                    const type = inbox.channel_type;
                    if (type === 'Channel::Whatsapp') channelName = 'WhatsApp';
                    else if (type === 'Channel::FacebookPage') channelName = 'Facebook'; // Could be Messenger or Instagram depending on config, but usually FB
                    else if (type === 'Channel::Instagram') channelName = 'Instagram'; // If specific Instagram channel exists
                    else channelName = inbox.name; // Fallback to inbox name
                }

                channelCounts.set(channelName, (channelCounts.get(channelName) || 0) + 1);
            });

            const channelData = Array.from(channelCounts.entries()).map(([name, count]) => {
                let icon = "MessageCircle";
                let color = "bg-gray-500";

                if (name === 'WhatsApp') {
                    icon = "MessageCircle";
                    color = "bg-green-500";
                } else if (name === 'Facebook') {
                    icon = "Facebook";
                    color = "bg-blue-600";
                } else if (name === 'Instagram') {
                    icon = "Instagram";
                    color = "bg-pink-600";
                }

                return {
                    name,
                    count,
                    percentage: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0,
                    icon,
                    color
                };
            });

            // If no data, show empty state or default
            if (channelData.length === 0 && totalLeads > 0) {
                // Fallback if something went wrong with mapping but we have leads
                channelData.push({ name: "Unknown", count: totalLeads, percentage: 100, icon: "HelpCircle", color: "bg-gray-400" });
            }

            // 5. Weekly Trend Calculation (Specific Week of Selected Month)
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const weeklyTrendMap = new Map<string, { leads: number; appointments: number }>();
            days.forEach(day => weeklyTrendMap.set(day, { leads: 0, appointments: 0 }));

            // Determine the date range for the selected week
            // Logic: trendStart is the 1st of the month (or current month).
            // We need to find the start and end dates of "Week X" within that month.
            // Week 1 starts on trendStart.
            // But we need to align with the "Week 1" logic from getWeekNumber.

            const getWeekNumber = (d: Date) => {
                const firstDayOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
                const pastDaysOfMonth = (d.getTime() - firstDayOfMonth.getTime()) / 86400000;
                return Math.ceil((pastDaysOfMonth + firstDayOfMonth.getDay() + 1) / 7);
            };

            // Filter conversations for the selected week
            const targetWeek = parseInt(selectedWeek);
            const weeklyConversations = allConversationsRaw.filter(conv => {
                const d = new Date(conv.timestamp * 1000);
                // Must be within the trend month AND match the week number
                if (d >= trendStart && d <= trendEnd) {
                    return getWeekNumber(d) === targetWeek;
                }
                return false;
            });

            // Map days to specific dates for the selected week
            const dayToDateMap = new Map<string, number>();
            let tempDate = new Date(trendStart);
            while (tempDate <= trendEnd) {
                if (getWeekNumber(tempDate) === targetWeek) {
                    const dayName = days[tempDate.getDay()];
                    dayToDateMap.set(dayName, tempDate.getDate());
                }
                tempDate.setDate(tempDate.getDate() + 1);
            }

            weeklyConversations.forEach(conv => {
                const date = new Date(conv.timestamp * 1000);
                const dayName = days[date.getDay()];
                const current = weeklyTrendMap.get(dayName)!;

                current.leads++;
                if (conv.labels && conv.labels.includes('scheduled_appointment')) {
                    current.appointments++;
                }
                weeklyTrendMap.set(dayName, current);
            });

            const weeklyTrend = days.map(day => {
                const dateNum = dayToDateMap.get(day);
                // If a date exists for this day in the selected week, append it (e.g., "Mon 20")
                // Otherwise keep just the day name (e.g. for days outside the month boundary)
                const label = dateNum ? `${day} ${dateNum}` : day;
                return {
                    week: label,
                    leads: weeklyTrendMap.get(day)!.leads,
                    appointments: weeklyTrendMap.get(day)!.appointments
                };
            });

            // 6. Monthly Trend Calculation
            const monthlyTrendMap = new Map<string, { leads: number; sqls: number; appointments: number }>();
            // Initialize 5 weeks
            for (let i = 1; i <= 5; i++) {
                monthlyTrendMap.set(`Week ${i}`, { leads: 0, sqls: 0, appointments: 0 });
            }

            const trendConversations = allConversationsRaw.filter(conv => {
                const d = new Date(conv.timestamp * 1000);
                return d >= trendStart && d <= trendEnd;
            });

            trendConversations.forEach(conv => {
                const date = new Date(conv.timestamp * 1000);
                const week = `Week ${getWeekNumber(date)}`;
                if (monthlyTrendMap.has(week)) {
                    const current = monthlyTrendMap.get(week)!;
                    current.leads++;
                    if (conv.labels && (conv.labels.includes('a_') || conv.labels.includes('b1') || conv.labels.includes('b2'))) current.sqls++;
                    if (conv.labels && conv.labels.includes('scheduled_appointment')) current.appointments++;
                    monthlyTrendMap.set(week, current);
                }
            });

            const monthlyTrend = Array.from(monthlyTrendMap.entries())
                .map(([date, counts]) => ({ date, ...counts }));

            // Disqualification Reasons 
            const totalDisqualified = c1Count;
            const disqualificationReasons = [
                { reason: "Disqualified (C1)", count: c1Count, percentage: 100 },
            ];

            // Data Capture Stats
            const targetConversations = kpiConversations.filter(c =>
                c.labels && (c.labels.includes('a_') || c.labels.includes('b1') || c.labels.includes('b2') || c.labels.includes('scheduled_appointment'))
            );
            const totalTarget = targetConversations.length;

            const fields = ['full_name', 'cellphone', 'agency', 'visit_date', 'visit_time'];
            const fieldCounts = fields.reduce((acc, field) => {
                acc[field] = 0;
                return acc;
            }, {} as Record<string, number>);

            let completeConversations = 0;
            let incompleteConversations = 0;

            targetConversations.forEach(conv => {
                // Search data first in contact attributes, then in conversation attributes
                const contactAttrs = conv.meta?.sender?.custom_attributes || {};
                const convAttrs = conv.custom_attributes || {};
                const attrs = { ...convAttrs, ...contactAttrs }; // contactAttrs takes priority
                let fieldsPresent = 0;

                fields.forEach(field => {
                    if (attrs[field]) {
                        fieldCounts[field]++;
                        fieldsPresent++;
                    }
                });

                if (fieldsPresent === fields.length) {
                    completeConversations++;
                } else if (fieldsPresent > 0) {
                    incompleteConversations++;
                }
            });

            const completionRate = totalTarget > 0 ? Math.round((completeConversations / totalTarget) * 100) : 0;
            const fieldRates = fields.map(field => ({
                field,
                rate: totalTarget > 0 ? Math.round((fieldCounts[field] / totalTarget) * 100) : 0
            })).sort((a, b) => b.rate - a.rate);

            const dataCapture = {
                completionRate,
                fieldRates,
                incomplete: incompleteConversations,
                funnelDropoff: 0
            };

            // Calculate Response Time (Average time to first response in minutes)
            // Chatwoot may provide first_reply_created_at or we need to calculate from messages
            let totalResponseTime = 0;
            let conversationsWithResponse = 0;

            kpiConversations.forEach(conv => {
                let responseTimeMinutes = 0;
                let isValidResponse = false;

                // Method 1: Use first_reply_created_at if available
                if (conv.first_reply_created_at && conv.created_at) {
                    const responseTimeSeconds = conv.first_reply_created_at - conv.created_at;
                    responseTimeMinutes = responseTimeSeconds / 60;
                    isValidResponse = true;
                }
                // Method 2: Calculate from messages array if available
                else if (conv.messages && conv.messages.length > 0) {
                    const firstAgentMessage = conv.messages.find(msg =>
                        msg.message_type === 'outgoing' || msg.sender?.type === 'agent_bot'
                    );

                    if (firstAgentMessage && conv.created_at) {
                        const firstAgentTime = firstAgentMessage.created_at || firstAgentMessage.timestamp;
                        if (firstAgentTime) {
                            const responseTimeSeconds = firstAgentTime - conv.created_at;
                            responseTimeMinutes = responseTimeSeconds / 60;
                            isValidResponse = true;
                        }
                    }
                }

                // Only count valid times and discard large outliers (for example, > 60 mins)
                // that represent delayed manual replies rather than the bot's actual response time.
                if (isValidResponse && responseTimeMinutes >= 0 && responseTimeMinutes <= 60) {
                    totalResponseTime += responseTimeMinutes;
                    conversationsWithResponse++;
                }
            });

            const responseTime = conversationsWithResponse > 0
                ? totalResponseTime / conversationsWithResponse
                : 0;

            console.log('Response Time Calculation:', {
                totalConversations: kpiConversations.length,
                conversationsWithResponse,
                averageResponseTime: responseTime.toFixed(2) + ' min'
            });

            setData({
                kpis: {
                    totalLeads,
                    interestedLeads: interestedLeadsCount,
                    scheduledAppointments: scheduledAppointmentsCount,
                    unqualified: c1Count,
                    schedulingRate: schedulingRateVar,
                    discardRate: discardRateVar,
                    responseRate: responseRateVar,
                    monthlyProfit: monthlyProfit,
                    totalProfit: totalProfitAll
                },
                funnelData,
                recentAppointments,
                channelData,
                weeklyTrend,
                monthlyTrend,
                disqualificationReasons,
                dataCapture,
                responseTime
            });
            setLoading(false);
        } catch (err) {
            console.error(err);
            setError('Failed to fetch dashboard data');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData(false);
        const interval = setInterval(() => fetchData(true), 30000); // Poll every 30s in background
        return () => clearInterval(interval);
    }, [selectedMonth, selectedWeek]); // Re-fetch when month or week changes

    const refetch = () => fetchData(false);

    return { loading, error, data, refetch };
};
