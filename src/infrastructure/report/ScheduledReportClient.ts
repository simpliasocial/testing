import { supabase } from "@/lib/supabase";
import type { CriticalProfileKey, ReportFileFormat, ReportTabId } from "@/domain/report";
import type { TagConfig } from "@/domain/dashboard";

export type ScheduledReportFrequency = "daily" | "weekly" | "monthly";

export type CreateScheduledReportPayload = {
    name: string;
    frequency: ScheduledReportFrequency;
    weekday: string;
    monthDay: number;
    scheduleTime: string;
    recipients: string;
    reportScope: "tab" | "critical_profile";
    tabIds: ReportTabId[];
    profileKey?: CriticalProfileKey;
    fileFormats: ReportFileFormat[];
    selectedInboxes: number[];
    tagSettings: Pick<TagConfig, "saleTags" | "humanSaleTargetLabel" | "scoreThresholds">;
    promptFileName?: string | null;
    createdBy?: {
        id?: string | null;
        email?: string | null;
    };
};

export const createScheduledReport = async (payload: CreateScheduledReportPayload) => {
    const { error } = await supabase
        .schema("cw")
        .from("automated_reports")
        .insert({
            name: payload.name,
            frequency: payload.frequency,
            schedule_days: payload.frequency === "weekly" ? [payload.weekday] : [],
            schedule_month_day: payload.frequency === "monthly" ? payload.monthDay : null,
            schedule_time: payload.scheduleTime,
            recipients: payload.recipients,
            is_active: true,
            report_scope: payload.reportScope,
            tab_ids: payload.tabIds,
            critical_profile_key: payload.profileKey || null,
            file_formats: payload.fileFormats,
            date_range_mode: "closed_period",
            filters: {
                selectedInboxes: payload.selectedInboxes,
                saleTags: payload.tagSettings.saleTags || [],
                humanSaleTargetLabel: payload.tagSettings.humanSaleTargetLabel || "venta_exitosa",
                scoreThresholds: payload.tagSettings.scoreThresholds,
                aiPromptFileName: payload.promptFileName || null,
            },
            created_by: payload.createdBy?.id || null,
            created_by_email: payload.createdBy?.email || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

    if (error) throw error;
};
