import { useState } from "react";
import { Loader2 } from "lucide-react";
import { LeadImportWizard } from "@/features/import";
import { useReportingState } from "../hooks/useReportingState";
import { CriticalReportProfiles } from "./CriticalReportProfiles";
import { ScheduledReportsTable } from "./ScheduledReportsTable";
import { EditScheduledReportDialog } from "./EditScheduledReportDialog";
import { EditProfileDialog } from "./EditProfileDialog";
import { type CriticalProfileKey, type ScheduledReport } from "../domain/reportCatalog";

const ReportingLayer = () => {
    const {
        reports,
        isLoading,
        fetchReports,
        saveProfileConfig,
        toggleScheduledStatus,
        deleteScheduledReport,
        updateScheduledReport,
        refetch,
    } = useReportingState();

    const [editingProfileKey, setEditingProfileKey] = useState<CriticalProfileKey | null>(null);
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

            <CriticalReportProfiles
                onEditProfile={setEditingProfileKey}
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

            <EditProfileDialog
                profileKey={editingProfileKey}
                onClose={() => setEditingProfileKey(null)}
                onSave={saveProfileConfig}
            />
        </div>
    );
};

export default ReportingLayer;
