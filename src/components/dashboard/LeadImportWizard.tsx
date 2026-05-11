import { useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    ClipboardCheck,
    Database,
    FileSpreadsheet,
    Loader2,
    Plus,
    RotateCcw,
    Upload,
    X,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/useAuth";
import {
    buildLeadImportPreview,
    createDefaultLeadImportMapping,
    formatImportDate,
    LEAD_IMPORT_TARGETS,
    normalizeChannelValue,
    normalizePhoneValue,
    parseAmountValue,
    parseLeadDate,
    prepareLeadImportCommit,
    readLeadImportFile,
    saveLeadImport,
    splitLabels,
    type LeadImportColumn,
    type LeadImportCommitPlan,
    type LeadImportMapping,
    type LeadImportPreview,
    type LeadImportPreviewRow,
    type LeadImportSaveResult,
    type LeadImportTargetDefinition,
    type LeadImportTargetField,
    type ParsedLeadImportFile,
} from "@/lib/leadImport";

interface LeadImportWizardProps {
    onImported?: () => void | Promise<void>;
}

const currencyFormatter = new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("es-EC");

const formatNumber = (value: number) => numberFormatter.format(value || 0);

const formatMoney = (value: number) => currencyFormatter.format(value || 0);

const stepLabels = ["Archivo", "Requisitos", "Columnas", "Vista previa", "Confirmación"];

const visibleTargets = LEAD_IMPORT_TARGETS.filter((target) => !["stage", "score"].includes(target.id));
const requiredTargets = visibleTargets.filter((target) => target.required);
const optionalTargets = visibleTargets.filter((target) => !target.required);

const rawText = (value: unknown) => String(value ?? "").trim();

const normalizedExampleFor = (field: LeadImportTargetField, sample: unknown) => {
    const raw = rawText(sample);
    if (!raw) return "";

    switch (field) {
        case "phone":
            return normalizePhoneValue(raw);
        case "channel":
            return normalizeChannelValue(raw);
        case "labels":
            return splitLabels([raw]).join(", ");
        case "amount": {
            const parsed = parseAmountValue(raw);
            return parsed.number ? formatMoney(parsed.number) : "";
        }
        case "createdAt":
        case "updatedAt":
        case "paymentDate":
            return formatImportDate(parseLeadDate(raw));
        default:
            return raw;
    }
};

const normalizationHelpFor = (field: LeadImportTargetField) => {
    switch (field) {
        case "phone":
            return "Ejemplo: +593980267533, 0980267533 o 980267533 se guardan como +593980267533.";
        case "createdAt":
            return "Acepta fechas con o sin hora. Si no viene hora, el sistema usa 00:00:00 para mantener el estándar.";
        case "updatedAt":
            return "Representa la última modificación o actividad del lead. Si no viene hora, el sistema usa 00:00:00.";
        case "paymentDate":
            return "Se usa para ventas exitosas y se guarda como fecha de pago o venta. Si no viene hora, el sistema usa 00:00:00.";
        case "labels":
            return "Convierte etiquetas o etapas al vocabulario operativo en snake_case, por ejemplo venta exitosa pasa a venta_exitosa.";
        case "amount":
            return "Limpia símbolos como $, comas y puntos para guardar el monto de venta en el formato estándar.";
        case "channel":
            return "Normaliza canales conocidos como WhatsApp, Facebook, Instagram, TikTok o Sitio web.";
        default:
            return "Confirma que esta columna corresponde al dato solicitado para que se guarde con el estándar del sistema.";
    }
};

const formatIssueForUser = (reason: string) => {
    const cleanReason = reason.replace(/\.$/, "").toLowerCase();
    if (cleanReason.startsWith("falta ")) {
        return `No tiene ${cleanReason.replace("falta ", "")}. Si continúas así, esta fila no se subirá.`;
    }
    return `${reason.replace(/\.$/, "")}. Si continúas así, esta fila puede no subirse.`;
};

const issueReasonForGroup = (reason: string) => {
    const cleanReason = reason.replace(/\.$/, "").toLowerCase();
    if (cleanReason.startsWith("falta ")) {
        return `no tienen ${cleanReason.replace("falta ", "").replace(" del lead", "")}`;
    }
    if (cleanReason.includes("no reconocida")) {
        return `tienen ${cleanReason}`;
    }
    return cleanReason;
};

const fieldLabelFor = (field?: string) =>
    visibleTargets.find((target) => target.id === field)?.label || "Fila";

const rowValueFor = (row: LeadImportPreviewRow, field: LeadImportTargetField) => {
    switch (field) {
        case "externalId":
            return row.externalLeadId;
        case "name":
            return row.name;
        case "phone":
            return row.phone;
        case "channel":
            return row.channel;
        case "labels":
            return row.labels?.join(", ");
        case "amount":
            return row.amountRaw;
        case "paymentDate":
            return formatImportDate(row.paymentDateIso);
        case "createdAt":
            return formatImportDate(row.createdAtIso);
        case "updatedAt":
            return formatImportDate(row.updatedAtIso);
        case "email":
            return row.email;
        case "campaign":
            return row.campaign;
        case "city":
            return row.city;
        default:
            return "";
    }
};

export function LeadImportWizard({ onImported }: LeadImportWizardProps) {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [wizardStep, setWizardStep] = useState(0);
    const [activeFieldIndex, setActiveFieldIndex] = useState(0);
    const [parsed, setParsed] = useState<ParsedLeadImportFile | null>(null);
    const [mapping, setMapping] = useState<LeadImportMapping | null>(null);
    const [preview, setPreview] = useState<LeadImportPreview | null>(null);
    const [commit, setCommit] = useState<LeadImportCommitPlan | null>(null);
    const [sourceSystem, setSourceSystem] = useState("excel");
    const [loadingFile, setLoadingFile] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [mappingChecked, setMappingChecked] = useState(false);
    const [previewChecked, setPreviewChecked] = useState(false);
    const [saveChecked, setSaveChecked] = useState(false);
    const [result, setResult] = useState<LeadImportSaveResult | null>(null);
    const [reviewedFieldIds, setReviewedFieldIds] = useState<Set<LeadImportTargetField>>(new Set());

    const currentProgress = ((wizardStep + 1) / stepLabels.length) * 100;
    const activeField = visibleTargets[Math.min(activeFieldIndex, visibleTargets.length - 1)];
    const allFieldsReviewed = visibleTargets.every((target) => reviewedFieldIds.has(target.id));
    const reviewedFieldsCount = visibleTargets.filter((target) => reviewedFieldIds.has(target.id)).length;
    const missingRequiredMapping = requiredTargets.filter((target) => !(mapping?.[target.id] || []).length);
    const groupedIssues = useMemo(() => {
        const groups = new Map<string, {
            field?: string;
            label: string;
            reason: string;
            severity: "error" | "warning";
            rows: Set<number>;
        }>();

        (preview?.issues || []).forEach((issue) => {
            const key = `${issue.severity}:${issue.field || "row"}:${issue.reason}`;
            const existing = groups.get(key);
            if (existing) {
                existing.rows.add(issue.rowNumber);
                return;
            }
            groups.set(key, {
                field: issue.field,
                label: fieldLabelFor(issue.field),
                reason: issue.reason,
                severity: issue.severity,
                rows: new Set([issue.rowNumber]),
            });
        });

        return Array.from(groups.values())
            .map((group) => ({
                ...group,
                count: group.rows.size,
                examples: Array.from(group.rows).sort((left, right) => left - right).slice(0, 5),
            }))
            .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
    }, [preview?.issues]);
    const blockingIssueGroups = groupedIssues.filter((group) => group.severity === "error");
    const warningIssueGroups = groupedIssues.filter((group) => group.severity === "warning");
    const optionalFieldSummaries = useMemo(() => {
        if (!preview || !mapping) return [];
        return optionalTargets
            .map((target) => {
                const hasMapping = (mapping[target.id] || []).length > 0;
                if (!hasMapping) return null;
                const values = target.id === "labels"
                    ? preview.rows.flatMap((row) => row.labels || [])
                    : preview.rows
                        .map((row) => rowValueFor(row, target.id))
                        .map((value) => String(value || "").trim())
                        .filter(Boolean);
                if (values.length === 0) return null;
                const samples = Array.from(new Set(values)).slice(0, 3);
                const counts = values.reduce<Record<string, number>>((acc, value) => {
                    acc[value] = (acc[value] || 0) + 1;
                    return acc;
                }, {});
                const topValues = Object.entries(counts)
                    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
                    .slice(0, 6)
                    .map(([value, count]) => ({ value, count }));
                return {
                    id: target.id,
                    label: target.label,
                    count: values.length,
                    samples,
                    topValues,
                };
            })
            .filter(Boolean) as Array<{ id: LeadImportTargetField; label: string; count: number; samples: string[]; topValues: Array<{ value: string; count: number }> }>;
    }, [mapping, preview]);

    const selectedColumnsFor = (field: LeadImportTargetField) =>
        (mapping?.[field] || [])
            .map((columnId) => parsed?.columns.find((column) => column.id === columnId))
            .filter(Boolean) as LeadImportColumn[];

    useEffect(() => {
        if (wizardStep !== 2 || !activeField) return;
        setReviewedFieldIds((current) => {
            if (current.has(activeField.id)) return current;
            const next = new Set(current);
            next.add(activeField.id);
            return next;
        });
    }, [activeField, wizardStep]);

    const resetChecks = () => {
        setCommit(null);
        setResult(null);
        setMappingChecked(false);
        setPreviewChecked(false);
        setSaveChecked(false);
    };

    const resetImportState = () => {
        setWizardStep(0);
        setActiveFieldIndex(0);
        setParsed(null);
        setMapping(null);
        setPreview(null);
        setCommit(null);
        setSourceSystem("excel");
        setMappingChecked(false);
        setPreviewChecked(false);
        setSaveChecked(false);
        setReviewedFieldIds(new Set());
        setResult(null);
    };

    const rebuildPreview = (
        nextParsed: ParsedLeadImportFile,
        nextMapping: LeadImportMapping,
        nextSourceSystem: string,
    ) => {
        setPreview(buildLeadImportPreview(nextParsed, nextMapping, nextSourceSystem.trim() || "excel"));
        resetChecks();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setLoadingFile(true);
            resetChecks();
            const parsedFile = await readLeadImportFile(file);
            const defaultMapping = createDefaultLeadImportMapping(parsedFile.columns);
            setParsed(parsedFile);
            setMapping(defaultMapping);
            setSourceSystem(parsedFile.sourceSystem);
            setPreview(buildLeadImportPreview(parsedFile, defaultMapping, parsedFile.sourceSystem));
            setActiveFieldIndex(0);
            setReviewedFieldIds(new Set());
            setWizardStep(1);
            toast.success("Archivo leído correctamente");
        } catch (error) {
            console.error("Lead import file parse failed:", error);
            toast.error(error instanceof Error ? error.message : "No se pudo leer el archivo");
        } finally {
            setLoadingFile(false);
            event.target.value = "";
        }
    };

    const updateMapping = (field: LeadImportTargetField, updater: (current: string[]) => string[]) => {
        if (!parsed || !mapping) return;
        const nextFieldMapping = updater(mapping[field] || []).filter(Boolean).slice(0, 1);
        const nextMapping = {
            ...mapping,
            [field]: nextFieldMapping,
        };
        setMapping(nextMapping);
        rebuildPreview(parsed, nextMapping, sourceSystem);
    };

    const addColumn = (field: LeadImportTargetField, columnId: string) => {
        if (columnId.startsWith("__")) return;
        updateMapping(field, () => [columnId]);
    };

    const removeColumn = (field: LeadImportTargetField, columnId: string) => {
        updateMapping(field, (current) => current.filter((id) => id !== columnId));
    };

    const clearMapping = (field: LeadImportTargetField) => {
        updateMapping(field, () => []);
    };

    const resetMapping = () => {
        if (!parsed) return;
        const defaultMapping = createDefaultLeadImportMapping(parsed.columns);
        setMapping(defaultMapping);
        rebuildPreview(parsed, defaultMapping, sourceSystem);
    };

    const handleSourceChange = (value: string) => {
        const nextSource = value.trim() || "excel";
        setSourceSystem(nextSource);
        if (parsed && mapping) rebuildPreview(parsed, mapping, nextSource);
    };

    const handlePrepare = async () => {
        if (!preview) return;
        if (preview.rows.length === 0) {
            toast.error("No hay filas listas para importar");
            return;
        }

        try {
            setPreparing(true);
            const nextCommit = await prepareLeadImportCommit(preview);
            setCommit(nextCommit);
            setWizardStep(4);
            setMappingChecked(false);
            setPreviewChecked(false);
            setSaveChecked(false);
            toast.success("Importación preparada");
        } catch (error) {
            console.error("Lead import prepare failed:", error);
            toast.error("No se pudo validar contra los datos actuales");
        } finally {
            setPreparing(false);
        }
    };

    const handleImport = async () => {
        if (!parsed || !mapping || !preview || !commit) return;

        try {
            setImporting(true);
            const saveResult = await saveLeadImport({
                parsed,
                mapping,
                preview,
                commit,
                sourceSystem,
                user: { id: user?.id, email: user?.email },
            });
            setResult(saveResult);
            toast.success("Datos importados correctamente");
            await onImported?.();
        } catch (error) {
            console.error("Lead import save failed:", error);
            toast.error(error instanceof Error ? error.message : "No se pudo guardar la importación");
        } finally {
            setImporting(false);
        }
    };

    const goNext = () => {
        if (wizardStep === 0 && !parsed) {
            toast.error("Carga un Excel o CSV para continuar");
            return;
        }
        if (wizardStep === 2 && !allFieldsReviewed) {
            const nextPendingIndex = visibleTargets.findIndex((target) => !reviewedFieldIds.has(target.id));
            setActiveFieldIndex(Math.max(nextPendingIndex, 0));
            toast.error("Revisa todos los campos antes de continuar a vista previa");
            return;
        }
        setWizardStep((step) => Math.min(step + 1, 4));
    };

    const goBack = () => setWizardStep((step) => Math.max(step - 1, 0));

    const fieldIssues = (field: LeadImportTargetField) =>
        (preview?.issues || []).filter((issue) => issue.field === field).slice(0, 4);

    const renderSummaryCards = () => {
        if (!parsed || !preview) return null;

        if (wizardStep < 3) {
            return (
                <div className="grid gap-3 md:grid-cols-3">
                    <div className="min-w-0 rounded-xl border bg-muted/20 p-4">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Archivo analizado</p>
                        <p className="mt-2 truncate text-base font-semibold" title={parsed.fileName}>{parsed.fileName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">El archivo ya fue leído.</p>
                    </div>
                    <div className="min-w-0 rounded-xl border bg-muted/20 p-4">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Filas encontradas</p>
                        <p className="mt-2 text-3xl font-semibold">{formatNumber(preview.stats.totalRows)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Total de filas dentro del archivo.</p>
                    </div>
                    <div className="min-w-0 rounded-xl border bg-blue-50 p-4">
                        <p className="text-xs font-semibold uppercase text-blue-900">Siguiente revisión</p>
                        <p className="mt-2 text-base font-semibold text-blue-900">Confirmar columnas</p>
                        <p className="mt-1 text-xs text-blue-900/70">Todavía no se guarda ni se importa nada.</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="min-w-0 rounded-xl border bg-muted/20 p-4">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Archivo analizado</p>
                    <p className="mt-2 truncate text-base font-semibold" title={parsed.fileName}>{parsed.fileName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Hoja revisada: {parsed.sheetName}</p>
                </div>
                <div className="min-w-0 rounded-xl border bg-muted/20 p-4">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Filas en el archivo</p>
                    <p className="mt-2 text-3xl font-semibold">{formatNumber(preview.stats.totalRows)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Total de filas leídas.</p>
                </div>
                <div className="min-w-0 rounded-xl border bg-green-50 p-4">
                    <p className="text-xs font-semibold uppercase text-green-900">Se subirán</p>
                    <p className="mt-2 text-3xl font-semibold text-green-700">{formatNumber(preview.stats.validRows)}</p>
                    <p className="mt-1 text-xs text-green-900/70">Filas con los datos obligatorios.</p>
                </div>
                <div className="min-w-0 rounded-xl border bg-amber-50 p-4">
                    <p className="text-xs font-semibold uppercase text-amber-900">No se subirán</p>
                    <p className="mt-2 text-3xl font-semibold text-amber-800">{formatNumber(preview.stats.skippedRows)}</p>
                    <p className="mt-1 text-xs text-amber-900/70">Filas sin un dato obligatorio.</p>
                </div>
            </div>
        );
    };

    const renderFieldReview = (field: LeadImportTargetDefinition) => {
        const selectedColumns = selectedColumnsFor(field.id);
        const firstSample = selectedColumns[0]?.sampleValues[0] || "";
        const normalizedSample = normalizedExampleFor(field.id, firstSample);
        const issues = fieldIssues(field.id);
        const isRequiredMissing = field.required && selectedColumns.length === 0;

        return (
            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                <div className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Campos a revisar</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                Revisados {reviewedFieldsCount}/{visibleTargets.length}
                            </p>
                        </div>
                        <Badge variant={allFieldsReviewed ? "default" : "outline"}>
                            {allFieldsReviewed ? "Completo" : "Pendiente"}
                        </Badge>
                    </div>
                    <div className="mt-3 space-y-1">
                        {visibleTargets.map((target, index) => {
                            const hasMapping = (mapping?.[target.id] || []).length > 0;
                            const hasBlockingNotices = fieldIssues(target.id).some((issue) => issue.severity === "error");
                            const isReviewed = reviewedFieldIds.has(target.id);
                            const state = !isReviewed
                                ? "pending"
                                : target.required && !hasMapping
                                    ? "missing"
                                    : hasBlockingNotices
                                        ? "notice"
                                        : hasMapping
                                            ? "ok"
                                            : "optional";
                            const stateText = {
                                pending: "Pend.",
                                missing: "Falta",
                                notice: "Aviso",
                                ok: "OK",
                                optional: "Opc.",
                            }[state];
                            const stateClass = {
                                pending: "border-slate-200 bg-slate-50 text-slate-700",
                                missing: "border-red-200 bg-red-50 text-red-700",
                                notice: "border-amber-200 bg-amber-50 text-amber-800",
                                ok: "border-green-200 bg-green-50 text-green-700",
                                optional: "border-blue-200 bg-blue-50 text-blue-700",
                            }[state];
                            const buttonClass = index === activeFieldIndex
                                ? "bg-primary text-primary-foreground"
                                : isReviewed
                                    ? "hover:bg-muted"
                                    : "border border-dashed border-slate-200 text-muted-foreground hover:bg-muted";
                            return (
                                <button
                                    key={target.id}
                                    type="button"
                                    onClick={() => setActiveFieldIndex(index)}
                                    className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${buttonClass}`}
                                >
                                    <span className="flex items-center justify-between gap-2">
                                        <span className="truncate">{target.label}</span>
                                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${index === activeFieldIndex ? "border-white/30 bg-white/15 text-primary-foreground" : stateClass}`}>
                                            {stateText}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-lg border p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-lg font-semibold">{field.label}</h3>
                                <Badge variant={field.required ? "default" : "outline"}>
                                    {field.required ? "Obligatorio" : "Opcional"}
                                </Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{field.description}</p>
                        </div>
                        <Button variant="outline" className="gap-2" onClick={resetMapping}>
                            <RotateCcw className="h-4 w-4" />
                            Redetectar
                        </Button>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        <div className="rounded-lg bg-muted/30 p-3">
                            <p className="text-sm font-semibold">Columna detectada por el sistema</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                El sistema puede encontrar varias columnas parecidas, pero para este campo solo se puede dejar una. Si eliges otra, reemplaza la anterior.
                            </p>
                            <div className="mt-3 space-y-2">
                                {selectedColumns.map((column) => (
                                    <div key={column.id} className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">Seleccionada: {column.displayName}</p>
                                            <p className="truncate text-[11px] text-muted-foreground">
                                                {column.filledCount} filas con dato · {column.sampleValues.slice(0, 2).join(" | ") || "sin muestra"}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeColumn(field.id, column.id)}>
                                                <X className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                {selectedColumns.length === 0 && (
                                    <div className={`rounded-md px-3 py-2 text-sm ${field.required ? "bg-red-50 text-red-800" : "bg-muted/60 text-muted-foreground"}`}>
                                        {field.required ? "Este campo debe tener una columna para poder importar filas." : "No se importará este dato."}
                                    </div>
                                )}
                            </div>

                            <div className="mt-3 flex gap-2">
                                <Select value={selectedColumns[0]?.id || `__select_${field.id}`} onValueChange={(value) => addColumn(field.id, value)}>
                                    <SelectTrigger className="min-w-0 flex-1">
                                        <SelectValue placeholder="Seleccionar columna" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={`__select_${field.id}`} disabled>Seleccionar una columna</SelectItem>
                                        {(parsed?.columns || []).map((column) => (
                                            <SelectItem key={column.id} value={column.id}>
                                                {column.displayName}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button variant="outline" onClick={() => clearMapping(field.id)}>Limpiar</Button>
                            </div>
                        </div>

                        <div className="rounded-lg bg-muted/30 p-3">
                            <p className="text-sm font-semibold">Formato final del sistema</p>
                            <div className="mt-3 space-y-3 text-sm">
                                <p className="rounded-md bg-background px-3 py-2 text-xs text-muted-foreground">
                                    {normalizationHelpFor(field.id)}
                                </p>
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">Ejemplo original del archivo</p>
                                    <p className="mt-1 rounded-md border bg-background px-3 py-2">{firstSample || "Sin muestra"}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">Formato final que se guardará</p>
                                    <p className="mt-1 rounded-md border bg-background px-3 py-2">{normalizedSample || "Sin dato normalizado"}</p>
                                </div>
                                {isRequiredMissing && (
                                    <p className="rounded-md bg-red-50 px-3 py-2 text-red-800">
                                        Este campo es obligatorio. Las filas sin este dato quedarán bloqueadas.
                                    </p>
                                )}
                                {issues.length > 0 && (
                                    <div className="space-y-1">
                                        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                            Aviso: estas filas no tienen este dato. Puedes continuar, pero esas filas no se subirán si el dato es obligatorio.
                                        </p>
                                        {issues.map((issue) => (
                                            <p key={`${issue.rowNumber}-${issue.reason}`} className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                                Fila {issue.rowNumber}: {formatIssueForUser(issue.reason)}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                        <Button variant="outline" onClick={() => setActiveFieldIndex((index) => Math.max(index - 1, 0))} disabled={activeFieldIndex === 0}>
                            Campo anterior
                        </Button>
                        <Button onClick={() => setActiveFieldIndex((index) => Math.min(index + 1, visibleTargets.length - 1))} disabled={activeFieldIndex === visibleTargets.length - 1}>
                            Siguiente campo
                        </Button>
                    </div>
                </div>
            </div>
        );
    };

    const renderStep = () => {
        if (wizardStep === 0) {
            return (
                <div className="space-y-5">
                    <Alert>
                        <Upload className="h-4 w-4" />
                        <AlertTitle>Primero carga el archivo del cliente</AlertTitle>
                        <AlertDescription>
                            El sistema leerá el Excel o CSV, detectará la hoja principal, reconocerá columnas y filas, y propondrá un mapeo inicial. Nada se guarda todavía.
                        </AlertDescription>
                    </Alert>
                    <div className="rounded-lg border border-dashed p-6">
                        <Label htmlFor="lead-import-file" className="text-sm font-semibold">Archivo Excel o CSV</Label>
                        <Input
                            id="lead-import-file"
                            className="mt-3"
                            type="file"
                            accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            onChange={handleFileChange}
                            disabled={loadingFile || importing}
                        />
                        {loadingFile && (
                            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Leyendo archivo y detectando columnas...
                            </div>
                        )}
                    </div>
                    {renderSummaryCards()}
                </div>
            );
        }

        if (wizardStep === 1) {
            return (
                <div className="space-y-5">
                    {renderSummaryCards()}
                    <Alert>
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertTitle>Archivo leído correctamente</AlertTitle>
                        <AlertDescription>
                            Antes de cargarlo al dashboard, necesitamos confirmar qué columna corresponde a cada dato. El sistema luego adaptará teléfonos, fechas, etiquetas, canales y montos al formato estándar.
                        </AlertDescription>
                    </Alert>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-lg border p-4">
                            <p className="font-semibold">Obligatorios</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Son los datos mínimos para identificar el lead y actualizar correctamente el dashboard. Si una fila no tiene alguno, esa fila no se guarda.
                            </p>
                            <div className="mt-3 space-y-2">
                                {requiredTargets.map((target) => (
                                    <div key={target.id} className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                                        <span>{target.label}</span>
                                        <Badge variant={(mapping?.[target.id] || []).length ? "default" : "destructive"}>
                                            {(mapping?.[target.id] || []).length ? "detectado" : "falta"}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-lg border p-4">
                            <p className="font-semibold">Recomendados</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                No bloquean la importación, pero enriquecen métricas, filtros, campañas, seguimiento y ventas.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {visibleTargets.filter((target) => !target.required).map((target) => (
                                    <Badge key={target.id} variant="outline">{target.label}</Badge>
                                ))}
                            </div>
                        </div>
                    </div>
                    {missingRequiredMapping.length > 0 && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Faltan columnas obligatorias por confirmar</AlertTitle>
                            <AlertDescription>
                                Revisa: {missingRequiredMapping.map((field) => field.label).join(", ")}.
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
            );
        }

        if (wizardStep === 2) {
            return (
                <div className="space-y-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <h3 className="text-lg font-semibold">Elegir qué columna corresponde a cada dato</h3>
                            <p className="text-sm text-muted-foreground">
                                Confirma si la columna detectada por el sistema corresponde a este dato. Aquí ves el ejemplo original y el formato final antes de guardarlo.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                            <div className="space-y-1">
                                <Label>Archivo viene de</Label>
                                <Input value={sourceSystem} onChange={(event) => handleSourceChange(event.target.value)} className="w-full sm:w-40" />
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/20 p-3 text-xs">
                        <Badge className="bg-green-50 text-green-700 border-green-200" variant="outline">OK</Badge>
                        <span className="text-muted-foreground">dato revisado y listo</span>
                        <Badge className="bg-amber-50 text-amber-800 border-amber-200" variant="outline">Aviso</Badge>
                        <span className="text-muted-foreground">hay filas vacías o con formato por revisar</span>
                        <Badge className="bg-red-50 text-red-700 border-red-200" variant="outline">Falta</Badge>
                        <span className="text-muted-foreground">obligatorio sin columna</span>
                        <Badge className="bg-blue-50 text-blue-700 border-blue-200" variant="outline">Opc.</Badge>
                        <span className="text-muted-foreground">opcional sin bloquear</span>
                        <Badge className="bg-slate-50 text-slate-700 border-slate-200" variant="outline">Pend.</Badge>
                        <span className="text-muted-foreground">todavía no revisado</span>
                    </div>
                    {activeField && renderFieldReview(activeField)}
                </div>
            );
        }

        if (wizardStep === 3) {
            return (
                <div className="space-y-5">
                    {renderSummaryCards()}

                    <div className="rounded-xl border p-4">
                        <div>
                            <p className="text-sm font-semibold">Datos obligatorios revisados</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Estos cuatro datos son los mínimos para que el dashboard identifique y actualice cada lead.
                            </p>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            {requiredTargets.map((target) => {
                                const selectedColumns = selectedColumnsFor(target.id);
                                const hasMapping = selectedColumns.length > 0;
                                const fieldGroups = groupedIssues.filter((group) => group.field === target.id);
                                const blockedRows = fieldGroups
                                    .filter((group) => group.severity === "error")
                                    .reduce((sum, group) => sum + group.count, 0);
                                const firstBlockingGroup = fieldGroups.find((group) => group.severity === "error");
                                const warningRows = fieldGroups
                                    .filter((group) => group.severity === "warning")
                                    .reduce((sum, group) => sum + group.count, 0);
                                const status = !hasMapping ? "missing" : blockedRows > 0 || warningRows > 0 ? "notice" : "ready";
                                const cardClass =
                                    status === "ready"
                                        ? "border-green-200 bg-green-50 text-green-950"
                                        : status === "notice"
                                            ? "border-amber-200 bg-amber-50 text-amber-950"
                                            : "border-red-200 bg-red-50 text-red-950";
                                const badgeText = status === "ready" ? "Listo" : status === "notice" ? "Revisar" : "Falta";

                                return (
                                    <div key={target.id} className={`rounded-lg border p-3 ${cardClass}`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="font-semibold">{target.label}</p>
                                            <Badge variant={status === "missing" ? "destructive" : "outline"}>{badgeText}</Badge>
                                        </div>
                                        <p className="mt-2 text-xs opacity-80">
                                            {hasMapping ? `Columna: ${selectedColumns[0].displayName}` : "Selecciona una columna para este dato."}
                                        </p>
                                        {blockedRows > 0 && (
                                            <p className="mt-2 text-xs font-medium">
                                                {formatNumber(blockedRows)} {blockedRows === 1 ? "fila" : "filas"} {firstBlockingGroup ? issueReasonForGroup(firstBlockingGroup.reason) : "tienen este dato vacío o inválido"}; por eso no se subirán.
                                            </p>
                                        )}
                                        {blockedRows === 0 && warningRows > 0 && (
                                            <p className="mt-2 text-xs font-medium">
                                                {formatNumber(warningRows)} {warningRows === 1 ? "fila requiere" : "filas requieren"} revisión.
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {blockingIssueGroups.length > 0 ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                            <AlertTriangle className="h-4 w-4" />
                            <div className="mt-3">
                                <p className="font-semibold text-amber-950">Filas que no se subirán y motivo</p>
                                <p className="mt-1 text-sm text-amber-950/80">
                                    Puedes continuar, pero estas filas quedan fuera porque les falta un dato obligatorio o el formato no se reconoce.
                                </p>
                                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                                    {blockingIssueGroups.map((group) => (
                                        <div key={`${group.field}-${group.reason}`} className="rounded-lg border bg-background p-3 text-sm">
                                            <p>
                                                <span className="font-semibold">{group.label}:</span>{" "}
                                                {formatNumber(group.count)} {group.count === 1 ? "fila no se subirá" : "filas no se subirán"} porque {issueReasonForGroup(group.reason)}.
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Ejemplos: filas {group.examples.join(", ")}.
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <Alert>
                            <CheckCircle2 className="h-4 w-4" />
                            <AlertTitle>No hay filas bloqueadas por datos obligatorios</AlertTitle>
                            <AlertDescription>
                                Todas las filas revisadas tienen los datos mínimos para importarse.
                            </AlertDescription>
                        </Alert>
                    )}

                    {warningIssueGroups.length > 0 && (
                        <div className="rounded-xl border p-4">
                            <p className="text-sm font-semibold">Datos que se cargarán con aviso</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Estos avisos no bloquean la importación, pero conviene revisarlos.
                            </p>
                            <div className="mt-3 grid gap-2 lg:grid-cols-2">
                                {warningIssueGroups.map((group) => (
                                    <div key={`${group.field}-${group.reason}`} className="rounded-lg bg-muted/40 p-3 text-sm">
                                        <span className="font-semibold">{group.label}:</span>{" "}
                                        {formatNumber(group.count)} {group.count === 1 ? "fila" : "filas"} {issueReasonForGroup(group.reason)}.
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {optionalFieldSummaries.length > 0 && (
                        <div className="rounded-xl border p-4">
                            <p className="text-sm font-semibold">Datos opcionales que sí se cargarán</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Estos datos no son obligatorios, pero ayudan a completar reportes, filtros, campañas y ventas.
                            </p>
                            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {optionalFieldSummaries.map((field) => (
                                    <div key={field.id} className="min-w-0 rounded-lg border bg-muted/20 p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="font-semibold">{field.label}</p>
                                            <Badge className="bg-blue-50 text-blue-700 border-blue-200" variant="outline">{formatNumber(field.count)} datos</Badge>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {field.topValues.map((item) => (
                                                <Badge key={`${field.id}-${item.value}`} variant="secondary" className="max-w-full truncate">
                                                    {item.value}: {formatNumber(item.count)}
                                                </Badge>
                                            ))}
                                        </div>
                                        <p className="mt-2 truncate text-xs text-muted-foreground" title={field.samples.join(" · ")}>
                                            Ejemplos: {field.samples.join(" · ")}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="space-y-5">
                {!result && commit && preview && (
                    <>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-xl border bg-green-50 p-4">
                                <p className="text-xs font-semibold uppercase text-green-900">Se subirán</p>
                                <p className="mt-2 text-3xl font-semibold text-green-700">{formatNumber(commit.rows.length)}</p>
                                <p className="mt-1 text-xs text-green-900/70">Filas finales para guardar.</p>
                            </div>
                            <div className="rounded-xl border p-4">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Nuevos</p>
                                <p className="mt-2 text-3xl font-semibold">{formatNumber(commit.createCount)}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Leads que se crearán.</p>
                            </div>
                            <div className="rounded-xl border p-4">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Actualizados</p>
                                <p className="mt-2 text-3xl font-semibold">{formatNumber(commit.updateCount)}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Leads que ya existían.</p>
                            </div>
                            <div className="rounded-xl border bg-amber-50 p-4">
                                <p className="text-xs font-semibold uppercase text-amber-900">No se subirán</p>
                                <p className="mt-2 text-3xl font-semibold text-amber-800">{formatNumber(preview.stats.skippedRows)}</p>
                                <p className="mt-1 text-xs text-amber-900/70">Filas sin datos obligatorios.</p>
                            </div>
                        </div>

                        <Alert>
                            <ClipboardCheck className="h-4 w-4" />
                            <AlertTitle>Doble verificación antes de guardar</AlertTitle>
                            <AlertDescription>
                                Marca las confirmaciones. Después de esto se crearán o actualizarán registros en el sistema.
                            </AlertDescription>
                        </Alert>

                        <div className="space-y-3">
                            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                                <Checkbox checked={mappingChecked} onCheckedChange={(checked) => setMappingChecked(checked === true)} />
                                <span>Confirmo que revisé las columnas asignadas y que los campos obligatorios apuntan al dato correcto.</span>
                            </label>
                            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                                <Checkbox checked={previewChecked} onCheckedChange={(checked) => setPreviewChecked(checked === true)} />
                                <span>Confirmo que revisé la vista previa, los avisos, advertencias, duplicados y totales.</span>
                            </label>
                            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                                <Checkbox checked={saveChecked} onCheckedChange={(checked) => setSaveChecked(checked === true)} />
                                <span>Entiendo que esta acción guardará los leads en el sistema y actualizará las métricas del dashboard.</span>
                            </label>
                        </div>
                    </>
                )}

                {result && (
                    <div className="space-y-3">
                        <Alert>
                            <CheckCircle2 className="h-4 w-4" />
                            <AlertTitle>Importación completada</AlertTitle>
                            <AlertDescription>
                                Se guardaron {formatNumber(result.created + result.updated)} filas en el sistema. Nuevos: {formatNumber(result.created)} · Actualizados: {formatNumber(result.updated)} · No subidos: {formatNumber(result.skipped)} · Avisos registrados: {formatNumber(result.warnings)}.
                            </AlertDescription>
                        </Alert>
                        <Button variant="outline" onClick={resetImportState}>
                            Importar otro archivo
                        </Button>
                    </div>
                )}
            </div>
        );
    };

    const canImport = Boolean(commit && mappingChecked && previewChecked && saveChecked && !importing && !result);

    return (
        <>
            <div className="rounded-lg border bg-background p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <FileSpreadsheet className="h-5 w-5 text-primary" />
                            <h3 className="text-lg font-semibold">Importar datos</h3>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Carga leads desde Excel o CSV con revisión guiada, normalización y confirmación antes de guardar.
                        </p>
                    </div>
                    <Button
                        className="gap-2"
                        onClick={() => {
                            if (result) resetImportState();
                            setOpen(true);
                        }}
                    >
                        <Upload className="h-4 w-4" />
                        Abrir importador
                    </Button>
                </div>
            </div>

            <Dialog open={open} onOpenChange={(nextOpen) => !importing && setOpen(nextOpen)}>
                <DialogContent className="max-h-[94vh] w-[96vw] max-w-[1500px] overflow-y-auto overflow-x-hidden">
                    <DialogHeader>
                        <DialogTitle>Importador guiado de leads</DialogTitle>
                        <DialogDescription>
                            Revisa archivo, columnas, normalización y vista previa antes de guardar en el sistema.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex flex-wrap gap-2">
                                {stepLabels.map((label, index) => {
                                    const isDone = index < wizardStep;
                                    const isCurrent = index === wizardStep;
                                    return (
                                        <Badge
                                            key={label}
                                            variant="outline"
                                            className={
                                                isDone
                                                    ? "border-green-200 bg-green-50 text-green-700"
                                                    : isCurrent
                                                        ? "border-primary/30 bg-primary/10 text-primary"
                                                        : "border-slate-200 bg-slate-50 text-slate-600"
                                            }
                                        >
                                            {index + 1}. {label}
                                        </Badge>
                                    );
                                })}
                            </div>
                            <Progress value={currentProgress} className="h-2" />
                        </div>

                        {renderStep()}
                    </div>

                    <DialogFooter className="gap-2 sm:justify-between">
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setOpen(false)} disabled={importing}>
                                Cerrar
                            </Button>
                            <Button variant="outline" onClick={goBack} disabled={wizardStep === 0 || importing}>
                                Atrás
                            </Button>
                        </div>
                        <div className="flex gap-2">
                            {wizardStep < 3 && (
                                <Button onClick={goNext} disabled={(wizardStep === 0 && !parsed) || importing}>
                                    Siguiente
                                </Button>
                            )}
                            {wizardStep === 3 && (
                                <Button onClick={handlePrepare} disabled={preparing || importing || !preview || preview.rows.length === 0} className="gap-2">
                                    {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                                    Preparar confirmación
                                </Button>
                            )}
                            {wizardStep === 4 && !result && (
                                <Button disabled={!canImport} onClick={handleImport} className="gap-2">
                                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                    Importar definitivamente
                                </Button>
                            )}
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
