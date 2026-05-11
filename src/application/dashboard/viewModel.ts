import { cleanText } from "../../domain/common/types";
import type { DashboardFilters as DomainDashboardFilters } from "../../domain/dashboard";

export interface DashboardDataFilters extends DomainDashboardFilters {
    sqlTags?: string[];
    appointmentTags?: string[];
    saleTags?: string[];
    unqualifiedTags?: string[];
    humanFollowupQueueTags?: string[];
    humanAppointmentTargetLabel?: string;
    humanSalesQueueTags?: string[];
    humanSaleTargetLabel?: string;
    humanAppointmentFieldKeys?: string[];
    humanSaleFieldKeys?: string[];
}

export interface DashboardKpis {
    totalLeads: number;
    interestedLeads: number;
    scheduledAppointments: number;
    closedSales: number;
    unqualified: number;
    schedulingRate: number;
    discardRate: number;
    responseRate: number;
    monthlyProfit: number;
    totalProfit: number;
}

export interface DashboardValuePoint {
    name?: string;
    label?: string;
    key?: string;
    hour?: string;
    value?: number;
    count?: number;
    percentage?: number;
    color?: string;
    icon?: string;
    leads?: number;
    rate?: number;
    sales?: number;
    salesVolume?: number;
}

export interface DashboardOwnerPerformance {
    name: string;
    leads: number;
    appointments: number;
    unanswered: number;
    source: string;
    winRate: number;
    score: number;
}

export interface RecentAppointmentViewModel {
    id: number;
    name: string;
    cellphone: string;
    agency: string;
    date: string;
    time: string;
    status: string;
    createdAt?: number | string;
    lastInteractionAt?: number | string;
}

export interface DashboardDataCapture {
    completionRate: number;
    fieldRates: DashboardFieldRate[];
    incomplete: number;
    funnelDropoff: number;
}

export interface DashboardFieldRate {
    field: string;
    rate: number;
}

export interface DashboardWeeklyTrendItem {
    week: string;
    leads: number;
    appointments: number;
}

export interface DashboardMonthlyTrendItem {
    date: string;
    leads: number;
    sqls: number;
    appointments: number;
    closedSales?: number;
    timestamp?: number;
}

export interface DashboardQueueLead {
    id?: number;
    name?: string;
    owner?: string;
    status?: string;
    channel?: string;
    channel_type?: string;
    inbox_id?: number;
    labels?: string[];
    timestamp?: number;
    created_at?: number;
    first_reply_created_at?: number;
    source?: string;
    [key: string]: unknown;
}

export interface DashboardOperationalMetrics {
    averageFirstResponseSeconds: number;
    firstResponseAverageSeconds: number;
    firstResponseRawAverageSeconds: number;
    firstResponseGraceSeconds: number;
    firstResponseMedianSeconds: number;
    firstResponseCount: number;
    incomingMessageTrafficByHour?: DashboardValuePoint[];
    incomingMessageTrafficByDateHour?: DashboardValuePoint[];
    trafficMeta?: unknown;
    leadsWithOwnerCount: number;
    unassignedLeadsCount?: number;
    totalLeads: number;
    leadsWithOwnerPercentage: number;
    leadsSinRespuesta: number;
    slaPercentage: number;
    agingData: DashboardValuePoint[];
    activeLeads: DashboardQueueLead[];
    trafficData: DashboardValuePoint[];
    followUpQueue: DashboardQueueLead[];
    scheduledAppointmentsQueue: DashboardQueueLead[];
}

export type HumanAppointmentMode = "exact" | "mixed" | "estimated_legacy";

export interface DashboardHumanMetrics {
    followup: number;
    appointments: number;
    followupCurrent: number;
    humanAppointmentConversions: number;
    humanAppointmentConversionRate: number;
    humanAppointmentMode: HumanAppointmentMode;
    salesCount: number;
    salesVolume: number;
    averageTicket: number;
    conversionRate: number;
    salesByDate: Array<{ date: string; sales: number; salesVolume: number }>;
    trackingStartedAt: string | null;
    nonAccountableAmountCount: number;
    nonAccountableAmountTotal: number;
    historicalSalesNotCurrentCount: number;
    removedAmountCount: number;
    commercialAuditRows: number;
}

export interface DashboardTrendMetrics {
    channelLeads: DashboardValuePoint[];
    disqualificationStats: DashboardValuePoint[];
    campaignList: DashboardValuePoint[];
    revenuePeaks: Array<{ date: string; value: number; sales: number }>;
    revenuePeakDays?: Array<{ date: string; value: number; sales: number }>;
}

export interface DashboardDataViewModel {
    kpis: DashboardKpis;
    funnelData: DashboardValuePoint[];
    historicalFunnelData: DashboardValuePoint[];
    labelDistribution: DashboardValuePoint[];
    recentAppointments: RecentAppointmentViewModel[];
    channelData: DashboardValuePoint[];
    campaignData: DashboardValuePoint[];
    weeklyTrend: DashboardWeeklyTrendItem[];
    monthlyTrend: DashboardMonthlyTrendItem[];
    disqualificationReasons: DashboardValuePoint[];
    allLabels: string[];
    dataCapture: DashboardDataCapture;
    responseTime: number;
    ownerPerformance: DashboardOwnerPerformance[];
    operationalMetrics: DashboardOperationalMetrics;
    humanMetrics: DashboardHumanMetrics;
    trendMetrics: DashboardTrendMetrics;
}

export const FIRST_RESPONSE_GRACE_SECONDS = 60;

export const toDisplayText = (value: unknown, fallback: string) => cleanText(value) || fallback;

export const createEmptyDashboardData = (): DashboardDataViewModel => ({
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
        totalProfit: 0,
    },
    funnelData: [],
    historicalFunnelData: [],
    labelDistribution: [],
    recentAppointments: [],
    channelData: [],
    campaignData: [],
    weeklyTrend: [],
    monthlyTrend: [],
    disqualificationReasons: [],
    allLabels: [],
    dataCapture: {
        completionRate: 0,
        fieldRates: [],
        incomplete: 0,
        funnelDropoff: 0,
    },
    responseTime: 0,
    ownerPerformance: [],
    operationalMetrics: {
        averageFirstResponseSeconds: 0,
        firstResponseAverageSeconds: 0,
        firstResponseRawAverageSeconds: 0,
        firstResponseGraceSeconds: FIRST_RESPONSE_GRACE_SECONDS,
        firstResponseMedianSeconds: 0,
        firstResponseCount: 0,
        incomingMessageTrafficByHour: [],
        incomingMessageTrafficByDateHour: [],
        trafficMeta: null,
        leadsWithOwnerCount: 0,
        totalLeads: 0,
        leadsWithOwnerPercentage: 0,
        leadsSinRespuesta: 0,
        slaPercentage: 0,
        agingData: [],
        activeLeads: [],
        trafficData: [],
        followUpQueue: [],
        scheduledAppointmentsQueue: [],
    },
    humanMetrics: {
        followup: 0,
        appointments: 0,
        followupCurrent: 0,
        humanAppointmentConversions: 0,
        humanAppointmentConversionRate: 0,
        humanAppointmentMode: "estimated_legacy",
        salesCount: 0,
        salesVolume: 0,
        averageTicket: 0,
        conversionRate: 0,
        salesByDate: [],
        trackingStartedAt: null,
        nonAccountableAmountCount: 0,
        nonAccountableAmountTotal: 0,
        historicalSalesNotCurrentCount: 0,
        removedAmountCount: 0,
        commercialAuditRows: 0,
    },
    trendMetrics: {
        channelLeads: [],
        disqualificationStats: [],
        campaignList: [],
        revenuePeaks: [],
    },
});
