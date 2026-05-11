import { Mail, PauseCircle, Pencil, PlayCircle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    WEEKDAY_OPTIONS,
    REPORT_TAB_LABELS,
    CRITICAL_REPORT_PROFILES,
    formatFormatsLabel,
    type ScheduledReport,
} from "../domain/reportCatalog";

interface ScheduledReportsTableProps {
    reports: ScheduledReport[];
    onToggleStatus: (report: ScheduledReport) => void;
    onEdit: (report: ScheduledReport) => void;
    onDelete: (report: ScheduledReport) => void;
}

const formatSchedule = (report: ScheduledReport) => {
    const time = report.schedule_time?.slice(0, 5) || "08:00";
    if (report.frequency === "daily") {
        return `Diario, ${time}`;
    }
    if (report.frequency === "monthly") {
        return `Mensual, día ${report.schedule_month_day || 1}, ${time}`;
    }

    const selectedDays = WEEKDAY_OPTIONS
        .filter((day) => (report.schedule_days || []).includes(day.value))
        .map((day) => day.shortLabel)
        .join(", ");

    return `Semanal, ${selectedDays || "LU"}, ${time}`;
};

const getReportTabsLabel = (report: ScheduledReport) => {
    const tabs = report.tab_ids || [];
    if (tabs.length === 0 && report.critical_profile_key) {
        return CRITICAL_REPORT_PROFILES[report.critical_profile_key]?.label || "Perfil crítico";
    }
    return tabs.map((tabId) => REPORT_TAB_LABELS[tabId] || tabId).join(", ") || "Sin pestanas";
};

export function ScheduledReportsTable({
    reports,
    onToggleStatus,
    onEdit,
    onDelete,
}: ScheduledReportsTableProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-primary" />
                    Reportes programados
                </CardTitle>
                <CardDescription>
                    Resumen de envíos automáticos activos o pausados. Puedes eliminar los que ya no se necesiten.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="overflow-hidden rounded-xl border">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3">Reporte</th>
                                <th className="px-4 py-3">Pestañas / Perfil</th>
                                <th className="px-4 py-3">Formato</th>
                                <th className="px-4 py-3">Horario</th>
                                <th className="px-4 py-3">Correos</th>
                                <th className="px-4 py-3">Estado</th>
                                <th className="px-4 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reports.map((report) => (
                                <tr key={report.id} className="border-b last:border-0 hover:bg-muted/30">
                                    <td className="px-4 py-4">
                                        <div className="font-semibold">{report.name}</div>
                                        <div className="text-[11px] text-muted-foreground">
                                            {report.report_scope === "critical_profile" ? "Perfil crítico" : "Pestaña"}
                                            {report.created_by_email ? ` · ${report.created_by_email}` : ""}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-xs text-muted-foreground max-w-[280px]">{getReportTabsLabel(report)}</td>
                                    <td className="px-4 py-4 text-xs font-semibold">{formatFormatsLabel(report.file_formats || ["excel"])}</td>
                                    <td className="px-4 py-4 text-xs font-mono">{formatSchedule(report)}</td>
                                    <td className="px-4 py-4 text-xs text-muted-foreground max-w-[260px] truncate">{report.recipients}</td>
                                    <td className="px-4 py-4">
                                        <Badge variant={report.is_active ? "default" : "outline"} className={report.is_active ? "bg-green-50 text-green-700 border-green-200" : ""}>
                                            {report.is_active ? "Activo" : "Pausado"}
                                        </Badge>
                                        {report.last_status === "error" && (
                                        <p className="mt-1 text-[10px] text-destructive">Último envío con error</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-4 text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onToggleStatus(report)}>
                                                {report.is_active ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(report)}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(report)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {reports.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-16 text-center text-sm text-muted-foreground">
                                        Todavía no hay reportes automáticos programados.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}
