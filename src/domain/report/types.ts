import type { DashboardFilters } from "../dashboard/types";

export type ReportFileFormat = "excel" | "pdf" | "csv";
export type ReportScope = "tab" | "critical_profile";

export interface ReportSection {
    title: string;
    rows: Array<Record<string, unknown>>;
    kind?: "summary" | "kpi" | "analysis" | "detail";
    sheetName?: string;
    description?: string;
}

export interface ReportDefinition {
    id: string;
    name: string;
    scope: ReportScope;
    format: ReportFileFormat;
    filters: DashboardFilters;
}

export interface ReportRun {
    id?: string | number;
    reportId: string | number;
    status: "queued" | "running" | "success" | "failed";
    startedAt?: string;
    finishedAt?: string;
    errorMessage?: string;
}
