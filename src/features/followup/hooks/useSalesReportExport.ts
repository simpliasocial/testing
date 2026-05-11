import { useCallback } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import type { TagConfig } from "@/domain/dashboard";
import { getGuayaquilDateString } from "@/lib/guayaquilTime";
import {
    formatDateTime,
    getAttrs,
    getChatwootUrl,
    getLeadEmail,
    getLeadExternalUrl,
    getLeadName,
    getLeadOperationDate,
    getLeadPhone,
} from "@/lib/leadDisplay";
import {
    buildSalesReportData,
    resolveSalesExportFields,
    type SalesReportLead,
} from "../model/salesReportExportModel";

type DisplayLead = Parameters<typeof getLeadName>[0];

type UseSalesReportExportParams<TLead extends SalesReportLead> = {
    salesRows: TLead[];
    tagSettings: Pick<TagConfig, "excelExportFields">;
    salesStartDate: string;
    salesEndDate: string;
    salesSearch: string;
    saleTargetLabel: string;
    salesTotal: number;
    getChannelName: (lead: DisplayLead) => string;
};

const toDisplayLead = <TLead extends SalesReportLead>(lead: TLead) => lead as unknown as DisplayLead;

export const useSalesReportExport = <TLead extends SalesReportLead>({
    salesRows,
    tagSettings,
    salesStartDate,
    salesEndDate,
    salesSearch,
    saleTargetLabel,
    salesTotal,
    getChannelName,
}: UseSalesReportExportParams<TLead>) =>
    useCallback(() => {
        if (salesRows.length === 0) {
            toast.error("No hay ventas exitosas para exportar con esos filtros");
            return;
        }

        const activeFields = resolveSalesExportFields(tagSettings.excelExportFields || []);
        const {
            summaryRows,
            byChannelRows,
            byMonthRows,
            detailRows,
        } = buildSalesReportData({
            leads: salesRows,
            activeFields,
            generatedAt: new Date().toLocaleString(),
            salesStartDate,
            salesEndDate,
            salesSearch,
            saleTargetLabel,
            salesTotal,
            getAttrs: (lead) => getAttrs(toDisplayLead(lead)),
            getChannelName: (lead) => getChannelName(toDisplayLead(lead)),
            getChatwootUrl,
            getLeadName: (lead) => getLeadName(toDisplayLead(lead)),
            getLeadPhone: (lead, channel) => getLeadPhone(toDisplayLead(lead), channel),
            getLeadEmail: (lead) => getLeadEmail(toDisplayLead(lead)),
            getLeadExternalUrl: (lead, channel) => getLeadExternalUrl(toDisplayLead(lead), channel),
            getLeadOperationDate: (lead) => getLeadOperationDate(toDisplayLead(lead)),
            formatDateTime,
        });

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), "Resumen");
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(byChannelRows), "Por Canal");
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(byMonthRows), "Por Mes");
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), "Detalle Ventas");
        XLSX.writeFile(workbook, `reporte_ventas_exitosas_${getGuayaquilDateString()}.xlsx`);
        toast.success("Reporte de ventas exitosas generado");
    }, [
        getChannelName,
        saleTargetLabel,
        salesEndDate,
        salesRows,
        salesSearch,
        salesStartDate,
        salesTotal,
        tagSettings.excelExportFields,
    ]);
