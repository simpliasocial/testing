import { createScheduledReport } from "@/infrastructure/report/ScheduledReportClient";
export type { ScheduledReportFrequency } from "@/infrastructure/report/ScheduledReportClient";

export const useScheduledReportActions = () => ({
    createScheduledReport,
});
