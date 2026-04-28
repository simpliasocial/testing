import { useEffect, useMemo, useState } from "react";
import {
    BarChart3,
    BriefcaseBusiness,
    CalendarClock,
    CheckCircle2,
    Loader2,
    Mail,
    PauseCircle,
    PlayCircle,
    Settings,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { DEFAULT_TAG_CONFIG, useDashboardContext } from "@/context/DashboardDataContext";
import { useAuth } from "@/context/AuthContext";
import { TabExportMenu } from "@/components/dashboard/TabExportMenu";
import {
    CRITICAL_REPORT_PROFILES,
    REPORT_FORMATS,
    REPORT_TAB_LABELS,
    REPORT_TABS,
    WEEKDAY_OPTIONS,
    formatFormatsLabel,
    resolveCriticalProfile,
    type CriticalProfileKey,
    type ReportFileFormat,
    type ReportTabId,
} from "@/lib/reportCatalog";

interface ScheduledReport {
    id: string;
    name: string;
    frequency: "weekly" | "monthly";
    schedule_days: string[] | null;
    schedule_month_day: number | null;
    schedule_time: string;
    recipients: string;
    is_active: boolean;
    last_run_at?: string | null;
    created_at?: string | null;
    report_scope?: "tab" | "critical_profile" | string;
    tab_ids?: ReportTabId[] | null;
    critical_profile_key?: CriticalProfileKey | null;
    file_formats?: ReportFileFormat[] | null;
    last_status?: string | null;
    last_error?: string | null;
    created_by_email?: string | null;
}

const PROFILE_ICONS: Record<CriticalProfileKey, typeof BarChart3> = {
    management: BriefcaseBusiness,
    daily_operations: CalendarClock,
    team_performance: CheckCircle2,
    marketing_quality: BarChart3,
};

const PROFILE_AREAS: Record<CriticalProfileKey, string> = {
    management: "Gerencia",
    daily_operations: "Operación",
    team_performance: "Equipo",
    marketing_quality: "Marketing",
};

const profileKeys = Object.keys(CRITICAL_REPORT_PROFILES) as CriticalProfileKey[];

const formatSchedule = (report: ScheduledReport) => {
    const time = report.schedule_time?.slice(0, 5) || "08:00";
    if (report.frequency === "monthly") {
        return `Mensual, dia ${report.schedule_month_day || 1}, ${time}`;
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

const ReportingLayer = () => {
    const { loading: contextLoading, tagSettings, updateTagSettings } = useDashboardContext();
    const { role } = useAuth();
    const [reports, setReports] = useState<ScheduledReport[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [editingProfileKey, setEditingProfileKey] = useState<CriticalProfileKey | null>(null);
    const [profileTabs, setProfileTabs] = useState<ReportTabId[]>([]);
    const [profileFormats, setProfileFormats] = useState<ReportFileFormat[]>([]);
    const [profileActive, setProfileActive] = useState(true);

    const resolvedProfiles = useMemo(() => profileKeys.map((key) => (
        resolveCriticalProfile(key, tagSettings.criticalReportProfiles)
    )), [tagSettings.criticalReportProfiles]);

    const visibleProfiles = useMemo(
        () => resolvedProfiles.filter((profile) => profile.isActive || role === "admin"),
        [resolvedProfiles, role],
    );

    const fetchReports = async () => {
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
    };

    useEffect(() => {
        fetchReports();
    }, []);

    const openProfileEditor = (key: CriticalProfileKey) => {
        const profile = resolveCriticalProfile(key, tagSettings.criticalReportProfiles);
        setEditingProfileKey(key);
        setProfileTabs(profile.tabIds);
        setProfileFormats(profile.fileFormats);
        setProfileActive(profile.isActive);
    };

    const toggleProfileTab = (tabId: ReportTabId, checked: boolean | string) => {
        setProfileTabs((current) => {
            const next = checked === true
                ? Array.from(new Set([...current, tabId]))
                : current.filter((item) => item !== tabId);
            return next.length > 0 ? next : current;
        });
    };

    const toggleProfileFormat = (formatId: ReportFileFormat, checked: boolean | string) => {
        setProfileFormats((current) => {
            const next = checked === true
                ? Array.from(new Set([...current, formatId]))
                : current.filter((item) => item !== formatId);
            return next.length > 0 ? next : current;
        });
    };

    const saveProfileConfig = async () => {
        if (!editingProfileKey) return;
        try {
            await updateTagSettings({
                ...(tagSettings || DEFAULT_TAG_CONFIG),
                criticalReportProfiles: {
                    ...(tagSettings.criticalReportProfiles || {}),
                    [editingProfileKey]: {
                        tabIds: profileTabs,
                        fileFormats: profileFormats,
                        isActive: profileActive,
                    },
                },
            });
            toast.success("Perfil crítico actualizado");
            setEditingProfileKey(null);
        } catch (error) {
            console.error("Profile config save failed:", error);
            toast.error("No se pudo guardar la configuracion del perfil");
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
            setReports((current) => current.map((item) => item.id === report.id ? { ...item, is_active: nextStatus } : item));
            toast.success(nextStatus ? "Reporte activado" : "Reporte pausado");
        } catch (error) {
            console.error("Scheduled report status failed:", error);
            toast.error("No se pudo actualizar el reporte");
        }
    };

    const deleteScheduledReport = async (report: ScheduledReport) => {
        if (!confirm(`Eliminar la programacion "${report.name}"?`)) return;
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

    if (contextLoading || isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const editingProfile = editingProfileKey ? resolveCriticalProfile(editingProfileKey, tagSettings.criticalReportProfiles) : null;

    return (
        <div className="space-y-8">
            <Card className="border-primary/15 bg-gradient-to-br from-primary/5 via-background to-background">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                        <BriefcaseBusiness className="h-6 w-6 text-primary" />
                        Reportes críticos
                    </CardTitle>
                    <CardDescription>
                        Cuatro perfiles listos para gerencia, operación, equipo y marketing. Cada uno puede descargarse ahora o programarse por correo.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-2">
                    {visibleProfiles.map((profile) => {
                        const Icon = PROFILE_ICONS[profile.key];
                        return (
                            <Card key={profile.key} className="overflow-hidden border shadow-sm">
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-3">
                                            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                                                <Icon className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <CardTitle className="text-lg">{profile.label}</CardTitle>
                                                    <Badge variant={profile.isActive ? "default" : "outline"} className={profile.isActive ? "bg-green-50 text-green-700 border-green-200" : ""}>
                                                        {profile.isActive ? "Activo" : "Inactivo"}
                                                    </Badge>
                                                </div>
                                                <CardDescription className="mt-1">{profile.description}</CardDescription>
                                            </div>
                                        </div>
                                        <Badge variant="secondary">{PROFILE_AREAS[profile.key]}</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="rounded-xl border bg-muted/30 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pestañas que debe incluir</p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {profile.tabIds.map((includedTabId) => (
                                                <Badge key={includedTabId} variant="outline" className="bg-background">
                                                    {REPORT_TAB_LABELS[includedTabId]}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Formato principal</p>
                                            <p className="text-sm font-bold">{formatFormatsLabel(profile.fileFormats)}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <TabExportMenu
                                                profileKey={profile.key}
                                                tabIds={profile.tabIds}
                                                title={profile.label}
                                                defaultFormats={profile.fileFormats}
                                                compact
                                                onScheduled={fetchReports}
                                            />
                                            {role === "admin" && (
                                                <Button variant="outline" size="sm" className="gap-2" onClick={() => openProfileEditor(profile.key)}>
                                                    <Settings className="h-4 w-4" />
                                                    Editar
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </CardContent>
            </Card>

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
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleScheduledStatus(report)}>
                                                    {report.is_active ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteScheduledReport(report)}>
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

            <Dialog open={Boolean(editingProfileKey)} onOpenChange={(open) => !open && setEditingProfileKey(null)}>
                <DialogContent className="sm:max-w-[680px]">
                    <DialogHeader>
                        <DialogTitle>Configurar perfil crítico</DialogTitle>
                        <DialogDescription>
                            {editingProfile?.label}. Solo administradores pueden cambiar la base de pestañas y formatos recomendados.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-6 py-2 md:grid-cols-2">
                        <div className="space-y-3">
                            <Label>Pestañas incluidas</Label>
                            <div className="space-y-2 rounded-xl border p-3">
                                {REPORT_TABS.map((tab) => (
                                    <label key={tab.id} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-muted/50">
                                        <Checkbox
                                            checked={profileTabs.includes(tab.id)}
                                            onCheckedChange={(checked) => toggleProfileTab(tab.id, checked)}
                                        />
                                        <span>{tab.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label>Formatos sugeridos</Label>
                            <div className="space-y-2 rounded-xl border p-3">
                                {REPORT_FORMATS.map((formatOption) => (
                                    <label key={formatOption.id} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-muted/50">
                                        <Checkbox
                                            checked={profileFormats.includes(formatOption.id)}
                                            onCheckedChange={(checked) => toggleProfileFormat(formatOption.id, checked)}
                                        />
                                        <span>{formatOption.label}</span>
                                    </label>
                                ))}
                            </div>

                            <label className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                                <Checkbox checked={profileActive} onCheckedChange={(checked) => setProfileActive(checked === true)} />
                                Perfil activo para usuarios
                            </label>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingProfileKey(null)}>Cancelar</Button>
                        <Button onClick={saveProfileConfig}>Guardar configuración</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ReportingLayer;
