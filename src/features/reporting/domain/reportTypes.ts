import type { Inbox } from "@/domain/lead";
import type { DashboardFilters, TagConfig } from "@/domain/dashboard";
import type { ResolvedConversation } from "@/context/dashboardDataTypes";
import type { UnknownRecord } from "@/domain/common/types";
import type { ReportTabId } from "./reportCatalog";
import type { CommercialAuditEvent } from "@/lib/commercialFacts";

export type ReportInbox = Inbox & {
    channel?: unknown;
};

export type ReportCell = unknown;
export type ReportAoa = ReportCell[][];
export type InboxMap = Map<number, ReportInbox>;

export interface OwnerPerformanceRow extends UnknownRecord {
    name?: unknown;
    appointments?: unknown;
    leads?: unknown;
    unanswered?: unknown;
    winRate?: unknown;
    source?: unknown;
}

export interface DashboardReportData {
    campaignData?: unknown;
    channelData?: unknown;
    disqualificationReasons?: unknown;
    funnelData?: unknown;
    historicalFunnelData?: unknown;
    humanMetrics?: unknown;
    kpis?: unknown;
    operationalMetrics?: unknown;
    ownerPerformance?: unknown;
    trendMetrics?: unknown;
}

export interface DashboardReportInput {
    title: string;
    tabIds: ReportTabId[];
    conversations: ResolvedConversation[];
    inboxes: ReportInbox[];
    tagSettings: TagConfig;
    globalFilters: DashboardFilters;
    dashboardData?: DashboardReportData;
    commercialAuditEvents?: CommercialAuditEvent[];
}
