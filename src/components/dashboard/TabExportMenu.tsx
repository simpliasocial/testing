import { useMemo, useState } from "react";
import { Download, FileDown, Mail, Settings, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { DEFAULT_TAG_CONFIG, useDashboardContext } from "@/context/DashboardDataContext";
import { useDashboardData } from "@/hooks/useDashboardData";
import { downloadDashboardReport } from "@/lib/reportExport";
import { formatFieldLabel, friendlyErrorMessage } from "@/lib/displayCopy";
import {
    CRITICAL_REPORT_PROFILES,
    DEFAULT_REPORT_COLUMN_FIELDS,
    REPORT_COLUMN_OPTIONS,
    REPORT_FORMATS,
    REPORT_TAB_LABELS,
    WEEKDAY_OPTIONS,
    resolveCriticalProfile,
    type CriticalProfileKey,
    type ReportFileFormat,
    type ReportTabId,
} from "@/lib/reportCatalog";

interface TabExportMenuProps {
    tabId?: ReportTabId;
    profileKey?: CriticalProfileKey;
    tabIds?: ReportTabId[];
    title?: string;
    defaultFormats?: ReportFileFormat[];
    compact?: boolean;
    onScheduled?: () => void;
}

type Frequency = "weekly" | "monthly";

const DEFAULT_FORMATS: ReportFileFormat[] = ["excel"];

const normalizeEmailList = (value: string) => value
    .split(/[;,\n]/)
    .map((email) => email.trim())
    .filter(Boolean)
    .join(", ");

export function TabExportMenu({
    tabId,
    profileKey,
    tabIds,
    title,
    defaultFormats,
    compact = false,
    onScheduled,
}: TabExportMenuProps) {
    const {
        conversations,
        inboxes,
        tagSettings,
        updateTagSettings,
        globalFilters,
        commercialAuditEvents,
    } = useDashboardContext();
    const { data: dashboardData } = useDashboardData({ ...globalFilters, ...tagSettings });
    const { user, role } = useAuth();

    const profile = profileKey ? resolveCriticalProfile(profileKey, tagSettings.criticalReportProfiles) : null;
    const resolvedTabIds = useMemo<ReportTabId[]>(() => {
        if (tabIds?.length) return tabIds;
        if (profile) return profile.tabIds;
        if (tabId) return [tabId];
        return [];
    }, [profile, tabId, tabIds]);

    const reportTitle = title || profile?.label || (tabId ? REPORT_TAB_LABELS[tabId] : "Reporte");
    const initialFormats = defaultFormats?.length ? defaultFormats : profile?.fileFormats?.length ? profile.fileFormats : DEFAULT_FORMATS;

    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [columnsOpen, setColumnsOpen] = useState(false);
    const [savingSchedule, setSavingSchedule] = useState(false);
    const [scheduleName, setScheduleName] = useState(reportTitle);
    const [frequency, setFrequency] = useState<Frequency>("weekly");
    const [weekday, setWeekday] = useState("1");
    const [monthDay, setMonthDay] = useState("1");
    const [scheduleTime, setScheduleTime] = useState("08:00");
    const [recipients, setRecipients] = useState(user?.email || "");
    const [selectedFormats, setSelectedFormats] = useState<ReportFileFormat[]>(initialFormats);

    const canConfigureColumns = role === "admin" && Boolean(tabId);

    const handleDownload = (formatId: ReportFileFormat) => {
        try {
            downloadDashboardReport(formatId, {
                title: reportTitle,
                tabIds: resolvedTabIds,
                conversations,
                inboxes,
                tagSettings,
                globalFilters,
                dashboardData,
                commercialAuditEvents,
            });
            toast.success("Reporte descargado correctamente");
        } catch (error) {
            console.error("Report download failed:", error);
            toast.error(error instanceof Error ? error.message : friendlyErrorMessage("export"));
        }
    };

    const toggleFormat = (formatId: ReportFileFormat, checked: boolean | string) => {
        setSelectedFormats((current) => {
            const isChecked = checked === true;
            const next = isChecked
                ? Array.from(new Set([...current, formatId]))
                : current.filter((item) => item !== formatId);
            return next.length > 0 ? next : current;
        });
    };

    const handleSaveSchedule = async () => {
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
                .insert({
                    name: cleanName,
                    frequency,
                    schedule_days: frequency === "weekly" ? [weekday] : [],
                    schedule_month_day: frequency === "monthly" ? dayNumber : null,
                    schedule_time: scheduleTime,
                    recipients: cleanRecipients,
                    is_active: true,
                    report_scope: profileKey ? "critical_profile" : "tab",
                    tab_ids: resolvedTabIds,
                    critical_profile_key: profileKey || null,
                    file_formats: selectedFormats,
                    date_range_mode: "closed_period",
                    filters: {
                        selectedInboxes: globalFilters.selectedInboxes || [],
                        saleTags: tagSettings.saleTags || [],
                        humanSaleTargetLabel: tagSettings.humanSaleTargetLabel || "venta_exitosa",
                        scoreThresholds: tagSettings.scoreThresholds,
                    },
                    created_by: user?.id || null,
                    created_by_email: user?.email || null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                });

            if (error) throw error;
            toast.success("Reporte automático programado correctamente");
            setScheduleOpen(false);
            onScheduled?.();
        } catch (error) {
            console.error("Scheduled report save failed:", error);
            toast.error("No se pudo programar el reporte");
        } finally {
            setSavingSchedule(false);
        }
    };

    const selectedColumnFields = tabId
        ? tagSettings.reportColumnFields?.[tabId] || DEFAULT_REPORT_COLUMN_FIELDS[tabId]
        : [];

    const handleToggleColumn = async (field: string, checked: boolean | string) => {
        if (!tabId) return;
        const isChecked = checked === true;
        const nextFields = isChecked
            ? Array.from(new Set([...selectedColumnFields, field]))
            : selectedColumnFields.filter((item) => item !== field);

        if (nextFields.length === 0) {
            toast.error("Deja al menos una columna activa");
            return;
        }

        await updateTagSettings({
            ...(tagSettings || DEFAULT_TAG_CONFIG),
            reportColumnFields: {
                ...(tagSettings.reportColumnFields || {}),
                [tabId]: nextFields,
            },
        });
    };

    const buttonLabel = compact ? "Exportar" : `Exportar ${profileKey ? "perfil" : "pestaña"}`;

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size={compact ? "sm" : "default"} className="gap-2">
                        <Download className="h-4 w-4" />
                        <span>{buttonLabel}</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                        <FileDown className="h-3.5 w-3.5" />
                        Descargar ahora
                    </DropdownMenuLabel>
                    {REPORT_FORMATS.map((formatOption) => (
                        <DropdownMenuItem key={formatOption.id} onClick={() => handleDownload(formatOption.id)}>
                            {formatOption.label}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={(event) => { event.preventDefault(); setScheduleOpen(true); }}>
                        <Mail className="mr-2 h-4 w-4" />
                        Reporte automático
                    </DropdownMenuItem>
                    {canConfigureColumns && (
                        <DropdownMenuItem onSelect={(event) => { event.preventDefault(); setColumnsOpen(true); }}>
                            <Settings className="mr-2 h-4 w-4" />
                            Configurar columnas
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
                <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle>Programar reporte automático</DialogTitle>
                        <DialogDescription>
                            Configura el envío por correo para {reportTitle}. Semanal usa la semana anterior completa y mensual usa el mes anterior completo.
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
                                <Select value={frequency} onValueChange={(value: Frequency) => setFrequency(value)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="weekly">Semanal</SelectItem>
                                        <SelectItem value="monthly">Mensual</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {frequency === "weekly" ? (
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
                            ) : (
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
                                                onCheckedChange={(checked) => toggleFormat(formatOption.id, checked)}
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
                        <Button variant="outline" onClick={() => setScheduleOpen(false)} disabled={savingSchedule}>Cancelar</Button>
                        <Button onClick={handleSaveSchedule} disabled={savingSchedule} className="gap-2">
                            {savingSchedule && <Loader2 className="h-4 w-4 animate-spin" />}
                            Programar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {tabId && (
                <Dialog open={columnsOpen} onOpenChange={setColumnsOpen}>
                    <DialogContent className="sm:max-w-[640px]">
                        <DialogHeader>
                            <DialogTitle>Columnas de {REPORT_TAB_LABELS[tabId]}</DialogTitle>
                            <DialogDescription>
                                Esta configuración solo la ve el administrador y aplica a las descargas de esta pestaña.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid max-h-[420px] gap-3 overflow-y-auto py-2 sm:grid-cols-2">
                            {REPORT_COLUMN_OPTIONS.map((field) => (
                                <label key={field} className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50">
                                    <Checkbox
                                        checked={selectedColumnFields.includes(field)}
                                        onCheckedChange={(checked) => handleToggleColumn(field, checked)}
                                    />
                                    {formatFieldLabel(field)}
                                </label>
                            ))}
                        </div>

                        <DialogFooter>
                            <Button onClick={() => setColumnsOpen(false)}>Cerrar</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}

export const criticalProfileDefaults = CRITICAL_REPORT_PROFILES;
