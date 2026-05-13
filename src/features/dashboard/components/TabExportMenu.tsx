import { useMemo, useState } from "react";
import {
    BrainCircuit,
    CheckCircle2,
    Circle,
    Database,
    Download,
    FileCheck2,
    FileDown,
    Loader2,
    Mail,
    RefreshCw,
    Settings,
    XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { config } from "@/config";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/useAuth";
import { isAdmin } from "@/domain/auth/permissions";
import { DEFAULT_TAG_CONFIG } from "@/domain/dashboard";
import { useDashboardContext } from "@/context/useDashboardContext";
import { useDashboardData } from "@/features/dashboard/hooks/useDashboardData";
import { downloadDashboardReport } from "@/infrastructure/report/DashboardReportExporter";
import { formatFieldLabel, friendlyErrorMessage } from "@/lib/displayCopy";
import {
    DEFAULT_REPORT_COLUMN_FIELDS,
    REPORT_COLUMN_OPTIONS,
    REPORT_FORMATS,
    REPORT_TAB_LABELS,
    WEEKDAY_OPTIONS,
    resolveCriticalProfile,
    type CriticalProfileKey,
    type ReportFileFormat,
    type ReportTabId,
} from "@/features/reporting/domain/reportCatalog";

interface TabExportMenuProps {
    tabId?: ReportTabId;
    profileKey?: CriticalProfileKey;
    tabIds?: ReportTabId[];
    title?: string;
    defaultFormats?: ReportFileFormat[];
    compact?: boolean;
    onScheduled?: () => void;
}

type Frequency = "daily" | "weekly" | "monthly";

const DEFAULT_FORMATS: ReportFileFormat[] = ["excel"];

const normalizeEmailList = (value: string) => value
    .split(/[;,\n]/)
    .map((email) => email.trim())
    .filter(Boolean)
    .join(", ");

type AiReportDownloadResponse = {
    ok?: boolean;
    error?: string;
    details?: unknown;
    jobId?: string;
    status?: "queued" | "in_progress" | "completed" | "failed" | "cancelled" | "incomplete";
    responseId?: string;
    rangeLabel?: string;
    pollAfterMs?: number;
    filename?: string;
    mimeType?: string;
    contentBase64?: string;
};

const AI_REPORT_DOWNLOAD_TIMEOUT_MS = 60_000;
const AI_REPORT_MAX_WAIT_MS = 9 * 60_000;

type AiReportAction = "start" | "status" | "download";

type AiReportFunctionPayload = {
    action: AiReportAction;
    profileKey: CriticalProfileKey;
    formatId: ReportFileFormat;
    responseId?: string;
    rangeLabel?: string;
    companyContext?: string;
    filters?: {
        startDate?: string;
        endDate?: string;
        selectedInboxes?: number[];
    };
};

type AiGenerationStep = "prepare" | "submit" | "analyze" | "build" | "done";
type AiGenerationStatus = "idle" | "running" | "completed" | "failed";

type AiGenerationState = {
    open: boolean;
    status: AiGenerationStatus;
    step: AiGenerationStep;
    reportTitle: string;
    formatId?: ReportFileFormat;
    formatLabel?: string;
    message: string;
    error?: string;
    responseId?: string;
};

const AI_GENERATION_STEPS: Array<{ id: AiGenerationStep; label: string; icon: typeof Circle }> = [
    { id: "prepare", label: "Preparando datos", icon: Database },
    { id: "submit", label: "Enviando al agente IA", icon: BrainCircuit },
    { id: "analyze", label: "Analizando con el prompt del reporte", icon: Loader2 },
    { id: "build", label: "Construyendo archivo", icon: FileCheck2 },
    { id: "done", label: "Listo para descargar", icon: CheckCircle2 },
];

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeout]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const stringifyAiDetail = (value: unknown): string => {
    if (!value) return "";
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

const readableAiReportError = (body: AiReportDownloadResponse | null, fallback: string) => {
    const detail = stringifyAiDetail(body?.details);
    if (body?.error && body.error !== "[object Object]") return body.error;
    if (detail.includes("max_output_tokens")) {
        return "OpenAI cortó la respuesta por límite de salida; el reporte se reducirá o se debe reintentar con menor rango.";
    }
    return detail || fallback;
};

const invokeAiReportFunction = async (payload: AiReportFunctionPayload): Promise<AiReportDownloadResponse> => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || config.supabase.anonKey;
    const response = await fetch(`${config.supabase.url}/functions/v1/generate-ai-report`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: config.supabase.anonKey,
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
    });
    const text = await response.text();
    let body: AiReportDownloadResponse | null = null;
    try {
        body = text ? JSON.parse(text) as AiReportDownloadResponse : null;
    } catch {
        body = null;
    }

    if (!response.ok) {
        throw new Error(readableAiReportError(body, `Edge Function ${response.status}: ${text || "sin detalle"}`));
    }
    if (body?.ok === false || body?.error) {
        throw new Error(readableAiReportError(body, "No se pudo generar el reporte IA."));
    }
    if (!body) throw new Error("La función de reportes IA no devolvió una respuesta válida.");
    return body;
};

const downloadBase64File = (params: { filename: string; mimeType: string; contentBase64: string }) => {
    const binary = atob(params.contentBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    const blob = new Blob([bytes], { type: params.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = params.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};

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
    const [downloadingFormat, setDownloadingFormat] = useState<ReportFileFormat | null>(null);
    const [generation, setGeneration] = useState<AiGenerationState>({
        open: false,
        status: "idle",
        step: "prepare",
        reportTitle,
        message: "",
    });

    const canConfigureColumns = isAdmin(role) && Boolean(tabId);
    const availableFormats = useMemo(
        () => profile
            ? REPORT_FORMATS.filter((formatOption) => profile.fileFormats.includes(formatOption.id))
            : REPORT_FORMATS,
        [profile],
    );

    const updateGeneration = (next: Partial<AiGenerationState>) => {
        setGeneration((current) => ({ ...current, ...next, open: true }));
    };

    const handleDownload = async (formatId: ReportFileFormat) => {
        try {
            setDownloadingFormat(formatId);
            if (profileKey) {
                const startedAt = Date.now();
                const formatLabel = REPORT_FORMATS.find((formatOption) => formatOption.id === formatId)?.label || formatId.toUpperCase();
                let responseId: string | undefined;
                let rangeLabel: string | undefined;
                let data: AiReportDownloadResponse | null | undefined;
                const aiFilters = {
                    startDate: globalFilters.startDate?.toISOString(),
                    endDate: globalFilters.endDate?.toISOString(),
                    selectedInboxes: globalFilters.selectedInboxes || [],
                };

                updateGeneration({
                    status: "running",
                    step: "prepare",
                    reportTitle,
                    formatId,
                    formatLabel,
                    message: "Estamos preparando la data filtrada y el contexto empresarial.",
                    error: undefined,
                    responseId: undefined,
                });

                updateGeneration({
                    step: "submit",
                    message: "Enviando el reporte al agente IA con la plantilla exacta del perfil.",
                });

                const startData = await withTimeout(
                    invokeAiReportFunction({
                        action: "start",
                        profileKey,
                        formatId,
                        companyContext: tagSettings.companyContext || "",
                        filters: aiFilters,
                    }),
                    AI_REPORT_DOWNLOAD_TIMEOUT_MS,
                    "No se pudo iniciar el reporte IA a tiempo. Intenta nuevamente.",
                );

                responseId = startData.responseId || startData.jobId;
                rangeLabel = startData.rangeLabel;
                if (!responseId) throw new Error("El agente IA no devolvió un ID de seguimiento para el reporte.");

                updateGeneration({
                    step: "analyze",
                    responseId,
                    message: "El agente IA está analizando la información. Esto puede tardar varios minutos.",
                });

                while (Date.now() - startedAt < AI_REPORT_MAX_WAIT_MS) {
                    const statusData = await withTimeout(
                        invokeAiReportFunction({ action: "status", profileKey, formatId, responseId, rangeLabel, filters: aiFilters }),
                        AI_REPORT_DOWNLOAD_TIMEOUT_MS,
                        "No se pudo consultar el avance del reporte IA. Intenta nuevamente.",
                    );

                    responseId = statusData.responseId || statusData.jobId || responseId;
                    rangeLabel = statusData.rangeLabel || rangeLabel;

                    if (statusData.status === "completed") {
                        updateGeneration({
                            step: "build",
                            responseId,
                            message: `El análisis terminó. Estamos construyendo el archivo ${formatLabel}.`,
                        });
                        data = await withTimeout(
                            invokeAiReportFunction({ action: "download", profileKey, formatId, responseId, rangeLabel, companyContext: tagSettings.companyContext || "", filters: aiFilters }),
                            AI_REPORT_DOWNLOAD_TIMEOUT_MS,
                            "No se pudo construir el archivo del reporte IA. Intenta nuevamente.",
                        );
                        break;
                    }

                    if (statusData.status === "queued" || statusData.status === "in_progress") {
                        updateGeneration({
                            step: "analyze",
                            responseId,
                            message: "El agente IA sigue trabajando. Mantén esta ventana abierta hasta que termine.",
                        });
                        await sleep(Math.min(Math.max(statusData.pollAfterMs || 3500, 2500), 9000));
                        continue;
                    }

                    throw new Error(statusData.error || `El reporte IA terminó con estado ${statusData.status || "desconocido"}.`);
                }

                if (!data?.contentBase64 || !data.filename || !data.mimeType) {
                    throw new Error("El reporte IA sigue tardando demasiado. Intenta nuevamente en unos minutos.");
                }

                downloadBase64File({
                    filename: data.filename,
                    mimeType: data.mimeType,
                    contentBase64: data.contentBase64,
                });
                updateGeneration({
                    status: "completed",
                    step: "done",
                    message: "Reporte generado y descargado correctamente.",
                });
                toast.success("Reporte IA descargado correctamente");
                return;
            }

            await downloadDashboardReport(formatId, {
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
            if (profileKey) {
                updateGeneration({
                    status: "failed",
                    error: error instanceof Error ? error.message : friendlyErrorMessage("export"),
                    message: "No se pudo completar la generación del reporte.",
                });
            }
            toast.error(error instanceof Error ? error.message : friendlyErrorMessage("export"));
        } finally {
            setDownloadingFormat(null);
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
        const allowedSelectedFormats = profile
            ? selectedFormats.filter((formatId) => profile.fileFormats.includes(formatId))
            : selectedFormats;

        if (allowedSelectedFormats.length === 0) {
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
                    file_formats: allowedSelectedFormats,
                    date_range_mode: "closed_period",
                    filters: {
                        selectedInboxes: globalFilters.selectedInboxes || [],
                        saleTags: tagSettings.saleTags || [],
                        humanSaleTargetLabel: tagSettings.humanSaleTargetLabel || "venta_exitosa",
                        scoreThresholds: tagSettings.scoreThresholds,
                        aiPromptFileName: profile?.promptFileName || null,
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
    const generationStepIndex = Math.max(0, AI_GENERATION_STEPS.findIndex((step) => step.id === generation.step));
    const generationProgress = generation.status === "completed"
        ? 100
        : generation.status === "failed"
            ? Math.max(10, (generationStepIndex / (AI_GENERATION_STEPS.length - 1)) * 100)
            : ((generationStepIndex + 1) / AI_GENERATION_STEPS.length) * 100;
    const retryGeneration = () => {
        if (generation.formatId) void handleDownload(generation.formatId);
    };

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
                    {availableFormats.map((formatOption) => (
                        <DropdownMenuItem key={formatOption.id} onClick={() => handleDownload(formatOption.id)}>
                            {downloadingFormat === formatOption.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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

            <Dialog
                open={generation.open}
                onOpenChange={(open) => {
                    setGeneration((current) => current.status === "running" ? { ...current, open: true } : { ...current, open });
                }}
            >
                <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle>Generando reporte IA</DialogTitle>
                        <DialogDescription>
                            {generation.reportTitle}{generation.formatLabel ? ` · ${generation.formatLabel}` : ""}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5 py-2">
                        <div className="rounded-lg border bg-muted/30 p-4">
                            <div className="flex items-start gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                    {generation.status === "failed" ? (
                                        <XCircle className="h-5 w-5" />
                                    ) : generation.status === "completed" ? (
                                        <CheckCircle2 className="h-5 w-5" />
                                    ) : (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    )}
                                </div>
                                <div className="min-w-0 space-y-1">
                                    <p className="text-sm font-semibold text-foreground">
                                        {generation.status === "failed"
                                            ? "La generación necesita atención"
                                            : generation.status === "completed"
                                                ? "Reporte listo"
                                                : "Trabajando con el agente IA"}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {generation.message || "Este reporte puede tardar varios minutos. Puedes dejar esta ventana abierta mientras se completa."}
                                    </p>
                                    {generation.status === "running" && (
                                        <p className="text-xs text-muted-foreground">
                                            Este reporte puede tardar varios minutos. Puedes dejar esta ventana abierta mientras se completa.
                                        </p>
                                    )}
                                </div>
                            </div>
                            <Progress value={generationProgress} className="mt-4 h-2" />
                        </div>

                        <div className="space-y-3">
                            {AI_GENERATION_STEPS.map((step, index) => {
                                const StepIcon = step.icon;
                                const isActive = generation.step === step.id && generation.status === "running";
                                const isDone = generation.status === "completed" || index < generationStepIndex;
                                return (
                                    <div key={step.id} className="flex items-center gap-3 text-sm">
                                        <span className={`flex h-7 w-7 items-center justify-center rounded-full border ${isDone ? "border-emerald-200 bg-emerald-50 text-emerald-700" : isActive ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}>
                                            {isDone ? (
                                                <CheckCircle2 className="h-4 w-4" />
                                            ) : (
                                                <StepIcon className={`h-4 w-4 ${isActive && step.id === "analyze" ? "animate-spin" : ""}`} />
                                            )}
                                        </span>
                                        <span className={isActive ? "font-medium text-foreground" : "text-muted-foreground"}>{step.label}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {generation.status === "failed" && (
                            <Alert variant="destructive">
                                <XCircle className="h-4 w-4" />
                                <AlertDescription>{generation.error || "No se pudo completar el reporte IA."}</AlertDescription>
                            </Alert>
                        )}
                    </div>

                    <DialogFooter>
                        {generation.status === "failed" && (
                            <Button variant="outline" onClick={retryGeneration} className="gap-2">
                                <RefreshCw className="h-4 w-4" />
                                Reintentar
                            </Button>
                        )}
                        <Button
                            onClick={() => setGeneration((current) => ({ ...current, open: false }))}
                            disabled={generation.status === "running"}
                        >
                            {generation.status === "running" ? "Generando..." : "Cerrar"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
                                    {availableFormats.map((formatOption) => (
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
