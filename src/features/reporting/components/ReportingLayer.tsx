import { useState } from "react";
import { Loader2 } from "lucide-react";
import { LeadImportWizard } from "@/features/import";
import { useReportingState } from "../hooks/useReportingState";
import { CompanyContextPanel } from "./CompanyContextPanel";
import { CriticalReportProfiles } from "./CriticalReportProfiles";
import { ScheduledReportsTable } from "./ScheduledReportsTable";
import { EditScheduledReportDialog } from "./EditScheduledReportDialog";
import { type ScheduledReport } from "../domain/reportCatalog";

const ReportingLayer = () => {
    const {
        reports,
        isLoading,
        fetchReports,
        toggleScheduledStatus,
        deleteScheduledReport,
        updateScheduledReport,
        refetch,
    } = useReportingState();

    const [editingReport, setEditingReport] = useState<ScheduledReport | null>(null);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <LeadImportWizard onImported={refetch} />

            <CompanyContextPanel />

            <CriticalReportProfiles
                onScheduled={fetchReports}
            />

            <ScheduledReportsTable
                reports={reports}
                onToggleStatus={toggleScheduledStatus}
                onEdit={setEditingReport}
                onDelete={deleteScheduledReport}
            />

            <EditScheduledReportDialog
                report={editingReport}
                onClose={() => setEditingReport(null)}
                onSave={updateScheduledReport}
            />

        </div>
    );
};

export default ReportingLayer;
