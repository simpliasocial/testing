import { format } from "date-fns";
import type { ReportFileFormat } from "@/features/reporting/domain/reportCatalog";
import { safeFilePart } from "@/features/reporting/model/reportExportModel";
import {
    exportCsvSections,
    exportExcelSections,
    exportPdfSections,
} from "@/infrastructure/report/reportFileWriters";
import type { DashboardReportInput } from "@/features/reporting/domain/reportTypes";
export type { DashboardReportInput };
import { buildDashboardReportSections } from "@/features/reporting/model/reportRowBuilders";
import { exportChatsWorkbook, exportFollowupWorkbook } from "@/features/reporting/model/reportWorkbookBuilders";

/**
 * Main entry point for downloading dashboard reports.
 * Decomposes the request into specialized builders based on the report type and format.
 */
export const downloadDashboardReport = (formatId: ReportFileFormat, input: DashboardReportInput) => {
    const stamp = format(new Date(), "yyyyMMdd_HHmmss");
    const baseName = `${safeFilePart(input.title)}_${stamp}`;

    // Specialized Excel workbooks for "Chats" and "Followup"
    if (formatId === "excel" && input.tabIds.length === 1 && input.tabIds[0] === "chats") {
        exportChatsWorkbook(input, `${baseName}.xlsx`);
        return;
    }

    if (formatId === "excel" && input.tabIds.length === 1 && input.tabIds[0] === "followup") {
        exportFollowupWorkbook(input, `${baseName}.xlsx`);
        return;
    }

    // Generic section-based export
    const sections = buildDashboardReportSections(input);
    if (sections.length === 0) {
        throw new Error("No hay datos para exportar con los filtros actuales.");
    }

    if (formatId === "excel") exportExcelSections(sections, `${baseName}.xlsx`);
    if (formatId === "csv") exportCsvSections(sections, `${baseName}.csv`);
    if (formatId === "pdf") exportPdfSections(input.title, sections, `${baseName}.pdf`);
};
