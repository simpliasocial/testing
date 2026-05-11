import type { DashboardReportInput } from "@/lib/reportExport";
import type { ReportFileFormat } from "@/features/reporting/domain/reportCatalog";

export const downloadDashboardReport = async (
    formatId: ReportFileFormat,
    input: DashboardReportInput,
) => {
    const exporter = await import("@/lib/reportExport");
    exporter.downloadDashboardReport(formatId, input);
};
