import { useEffect, useMemo, useState } from "react";
import {
    BarChart3,
    BriefcaseBusiness,
    CalendarClock,
    CheckCircle2,
    Loader2,
    Mail,
    PauseCircle,
    Pencil,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { DEFAULT_TAG_CONFIG, useDashboardContext } from "@/context/DashboardDataContext";
import { useAuth } from "@/context/AuthContext";
import { TabExportMenu } from "@/components/dashboard/TabExportMenu";
import { LeadImportWizard } from "@/components/dashboard/LeadImportWizard";
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
    frequency: "daily" | "weekly" | "monthly";
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

const normalizeEmailList = (value: string) => value
    .split(/[;,\n]/)
    .map((email) => email.trim())
    .filter(Boolean)
    .join(", ");

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

const ReportingLayer = () => {
    const { loading: contextLoading, tagSettings, updateTagSettings, refetch } = useDashboardContext();
    const { role } = useAuth();
    const [reports, setReports] = useState<ScheduledReport[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [editingProfileKey, setEditingProfileKey] = useState<CriticalProfileKey | null>(null);
    const [profileTabs, setProfileTabs] = useState<ReportTabId[]>([]);
    const [profileFormats, setProfileFormats] = useState<ReportFileFormat[]>([]);
    const [profileActive, setProfileActive] = useState(true);

    const [editingReport, setEditingReport] = useState<ScheduledReport | null>(null);
    const [scheduleName, setScheduleName] = useState("");
    const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
    const [weekday, setWeekday] = useState("1");
    const [monthDay, setMonthDay] = useState("1");
    const [scheduleTime, setScheduleTime] = useState("08:00");
    const [recipients, setRecipients] = useState("");
    const [selectedFormats, setSelectedFormats] = useState<ReportFileFormat[]>([]);
    const [savingSchedule, setSavingSchedule] = useState(false);

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

    const openEditReport = (report: ScheduledReport) => {
        setEditingReport(report);
        setScheduleName(report.name || "");
        setFrequency((report.frequency as any) || "weekly");
        setWeekday(report.schedule_days?.[0] || "1");
        setMonthDay(report.schedule_month_day?.toString() || "1");
        setScheduleTime(report.schedule_time?.slice(0, 5) || "08:00");
        setRecipients(report.recipients || "");
        setSelectedFormats(report.file_formats || ["excel"]);
    };

    const toggleEditFormat = (formatId: ReportFileFormat, checked: boolean | string) => {
        setSelectedFormats((current) => {
            const isChecked = checked === true;
            const next = isChecked
                ? Array.from(new Set([...current, formatId]))
                : current.filter((item) => item !== formatId);
            return next.length > 0 ? next : current;
        });
    };

    const handleUpdateSchedule = async () => {
        if (!editingReport) return;
        
        const cleanName = scheduleName.trim();
        const cleanRecipients = normalizeEmailList(recipients);
        const dayNumber = Math.min(31, Math.max(1, Number.parseInt(monthDay || "1", 10) || 1));

        if (!cleanName) {
            toast.error("Escribe un nombre para el reporte");
            return;
        }
        if (!cleanRecipients) {
            toast.error("Agrega al menos un correo destino");
            return;
        }
        if (selectedFormats.length === 0) {
            toast.error("Selecciona al menos un formato");
            return;
        }

        try {
            setSavingSchedule(true);
            const { error } = await supabase
                .schema("cw")
                .from("automated_reports")
                .update({
                    name: cleanName,
                    frequency,
                    schedule_days: frequency === "weekly" ? [weekday] : [],
                    schedule_month_day: frequency === "monthly" ? dayNumber : null,
                    schedule_time: scheduleTime,
                    recipients: cleanRecipients,
                    file_formats: selectedFormats,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", editingReport.id);

            if (error) throw error;
            toast.success("Reporte automático actualizado");
            setEditingReport(null);
            
            setReports((current) => current.map((item) => 
                item.id === editingReport.id ? {
                    ...item,
                    name: cleanName,
                    frequency,
                    schedule_days: frequency === "weekly" ? [weekday] : [],
                    schedule_month_day: frequency === "monthly" ? dayNumber : null,
                    schedule_time: scheduleTime,
                    recipients: cleanRecipients,
                    file_formats: selectedFormats,
                } : item
            ));
        } catch (error) {
            console.error("Scheduled report update failed:", error);
            toast.error("No se pudo actualizar el reporte");
        } finally {
            setSavingSchedule(false);
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
            <LeadImportWizard onImported={refetch} />

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
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditReport(report)}>
                                                    <Pencil className="h-4 w-4" />
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

            <Dialog open={Boolean(editingReport)} onOpenChange={(open) => !open && setEditingReport(null)}>
                <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle>Editar reporte automático</DialogTitle>
                        <DialogDescription>
                            Modifica la configuración de envío por correo para este reporte.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-2">
                        <div className="space-y-2">
                            <Label>Nombre</Label>
                            <Input value={scheduleName} onChange={(event) => setScheduleName(event.target.value)} />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Frecuencia</Label>
                                <Select value={frequency} onValueChange={(value: "daily" | "weekly" | "monthly") => setFrequency(value)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="daily">Diario</SelectItem>
                                        <SelectItem value="weekly">Semanal</SelectItem>
                                        <SelectItem value="monthly">Mensual</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {frequency === "weekly" && (
                                <div className="space-y-2">
                                    <Label>Día de la semana</Label>
                                    <Select value={weekday} onValueChange={setWeekday}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {WEEKDAY_OPTIONS.map((day) => (
                                                <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                            
                            {frequency === "monthly" && (
                                <div className="space-y-2">
                                    <Label>Día del mes</Label>
                                    <Input type="number" min={1} max={31} value={monthDay} onChange={(event) => setMonthDay(event.target.value)} />
                                    <p className="text-[11px] text-muted-foreground">Si el mes no tiene ese día, se enviará el último día del mes.</p>
                                </div>
                            )}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Hora de envío</Label>
                                <Input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Formatos</Label>
                                <div className="flex flex-wrap gap-3 rounded-lg border p-3">
                                    {REPORT_FORMATS.map((formatOption) => (
                                        <label key={formatOption.id} className="flex items-center gap-2 text-sm">
                                            <Checkbox
                                                checked={selectedFormats.includes(formatOption.id)}
                                                onCheckedChange={(checked) => toggleEditFormat(formatOption.id, checked)}
                                            />
                                            {formatOption.label}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Correos destino</Label>
                            <Input
                                placeholder="gerencia@simplia.com, operaciones@simplia.com"
                                value={recipients}
                                onChange={(event) => setRecipients(event.target.value)}
                            />
                            <p className="text-[11px] text-muted-foreground">Puedes separar varios correos con coma, punto y coma o salto de línea.</p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingReport(null)} disabled={savingSchedule}>Cancelar</Button>
                        <Button onClick={handleUpdateSchedule} disabled={savingSchedule} className="gap-2">
                            {savingSchedule && <Loader2 className="h-4 w-4 animate-spin" />}
                            Guardar cambios
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
