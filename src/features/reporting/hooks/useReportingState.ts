import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useDashboardContext } from "@/context/useDashboardContext";
import {
    type ScheduledReport,
    type CriticalProfileKey,
    type ReportTabId,
    type ReportFileFormat,
    resolveCriticalProfile,
} from "../domain/reportCatalog";

export function useReportingState() {
    const { tagSettings, updateTagSettings, refetch } = useDashboardContext();
    const [reports, setReports] = useState<ScheduledReport[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchReports = useCallback(async () => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase
                .schema("cw")
                .from("automated_reports")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            setReports((data || []) as ScheduledReport[]);
        } catch (error) {
            console.error("Error fetching scheduled reports:", error);
            toast.error("No se pudieron cargar los reportes programados");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    const saveProfileConfig = async (
        key: CriticalProfileKey,
        config: { tabIds: ReportTabId[]; fileFormats: ReportFileFormat[]; isActive: boolean }
    ) => {
        try {
            await updateTagSettings({
                ...tagSettings,
                criticalReportProfiles: {
                    ...(tagSettings.criticalReportProfiles || {}),
                    [key]: config,
                },
            });
            toast.success("Perfil crítico actualizado");
        } catch (error) {
            console.error("Profile config save failed:", error);
            toast.error("No se pudo guardar la configuración del perfil");
            throw error;
        }
    };

    const toggleScheduledStatus = async (report: ScheduledReport) => {
        try {
            const nextStatus = !report.is_active;
            const { error } = await supabase
                .schema("cw")
                .from("automated_reports")
                .update({ is_active: nextStatus, updated_at: new Date().toISOString() })
                .eq("id", report.id);

            if (error) throw error;
            setReports((current) =>
                current.map((item) => (item.id === report.id ? { ...item, is_active: nextStatus } : item))
            );
            toast.success(nextStatus ? "Reporte activado" : "Reporte pausado");
        } catch (error) {
            console.error("Scheduled report status failed:", error);
            toast.error("No se pudo actualizar el reporte");
        }
    };

    const deleteScheduledReport = async (report: ScheduledReport) => {
        if (!confirm(`¿Eliminar la programación "${report.name}"?`)) return;
        try {
            const { error } = await supabase
                .schema("cw")
                .from("automated_reports")
                .delete()
                .eq("id", report.id);

            if (error) throw error;
            setReports((current) => current.filter((item) => item.id !== report.id));
            toast.success("Reporte programado eliminado");
        } catch (error) {
            console.error("Scheduled report delete failed:", error);
            toast.error("No se pudo eliminar el reporte");
        }
    };

    const updateScheduledReport = async (reportId: string, updates: Partial<ScheduledReport>) => {
        try {
            const { error } = await supabase
                .schema("cw")
                .from("automated_reports")
                .update({
                    ...updates,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", reportId);

            if (error) throw error;
            
            setReports((current) =>
                current.map((item) => (item.id === reportId ? { ...item, ...updates } : item))
            );
            return true;
        } catch (error) {
            console.error("Scheduled report update failed:", error);
            toast.error("No se pudo actualizar el reporte");
            return false;
        }
    };

    return {
        reports,
        isLoading,
        fetchReports,
        saveProfileConfig,
        toggleScheduledStatus,
        deleteScheduledReport,
        updateScheduledReport,
        refetch,
    };
}
