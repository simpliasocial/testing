import type { UnknownRecord } from "../common/types";
import type { LeadStage } from "../lead/types";

export interface DashboardFilters {
    startDate?: Date;
    endDate?: Date;
    selectedInboxes?: number[];
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

export interface DashboardStageMetric {
    stage: LeadStage;
    label: string;
    value: number;
    percentage: number;
}

export interface ContactAttributeDefinition {
    chatwoot_attribute_id?: number;
    attribute_key: string;
    attribute_display_name: string;
    attribute_display_type: string;
    attribute_description?: string;
    attribute_scope?: string;
    regex_pattern?: string | null;
    regex_cue?: string | null;
    raw_payload?: UnknownRecord;
}
