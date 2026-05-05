import { useMemo, useState } from "react";
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
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
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import {
    buildLeadImportPreview,
    createDefaultLeadImportMapping,
    formatImportDate,
    LEAD_IMPORT_TARGETS,
    prepareLeadImportCommit,
    readLeadImportFile,
    saveLeadImport,
    type LeadImportCommitPlan,
    type LeadImportMapping,
    type LeadImportPreview,
    type LeadImportSaveResult,
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

const stepLabels = ["Archivo", "Columnas", "Vista previa", "Confirmación", "Resultado"];

const previewFields = LEAD_IMPORT_TARGETS.filter((target) => target.preview);

export function LeadImportWizard({ onImported }: LeadImportWizardProps) {
    const { user } = useAuth();
    const [parsed, setParsed] = useState<ParsedLeadImportFile | null>(null);
    const [mapping, setMapping] = useState<LeadImportMapping | null>(null);
    const [preview, setPreview] = useState<LeadImportPreview | null>(null);
    const [commit, setCommit] = useState<LeadImportCommitPlan | null>(null);
    const [sourceSystem, setSourceSystem] = useState("excel");
    const [loadingFile, setLoadingFile] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmChecked, setConfirmChecked] = useState(false);
    const [result, setResult] = useState<LeadImportSaveResult | null>(null);

    const currentStep = result ? 4 : commit ? 3 : preview ? 2 : parsed ? 1 : 0;
    const mappedColumnIds = useMemo(() => new Set(Object.values(mapping || {}).flat()), [mapping]);
    const noImportColumns = useMemo(
        () => (parsed?.columns || []).filter((column) => !mappedColumnIds.has(column.id)),
        [mappedColumnIds, parsed?.columns],
    );

    const rebuildPreview = (
        nextParsed: ParsedLeadImportFile,
        nextMapping: LeadImportMapping,
        nextSourceSystem: string,
    ) => {
        setPreview(buildLeadImportPreview(nextParsed, nextMapping, nextSourceSystem.trim() || "excel"));
        setCommit(null);
        setResult(null);
        setConfirmChecked(false);
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setLoadingFile(true);
            setCommit(null);
            setResult(null);
            const parsedFile = await readLeadImportFile(file);
            const defaultMapping = createDefaultLeadImportMapping(parsedFile.columns);
            setParsed(parsedFile);
            setMapping(defaultMapping);
            setSourceSystem(parsedFile.sourceSystem);
            setPreview(buildLeadImportPreview(parsedFile, defaultMapping, parsedFile.sourceSystem));
            toast.success("Archivo leído correctamente");
        } catch (error) {
            console.error("Lead import file parse failed:", error);
            toast.error(error instanceof Error ? error.message : "No se pudo leer el archivo");
        } finally {
            setLoadingFile(false);
        }
    };

    const updateMapping = (field: LeadImportTargetField, updater: (current: string[]) => string[]) => {
        if (!parsed || !mapping) return;
        const nextMapping = {
            ...mapping,
            [field]: updater(mapping[field] || []),
        };
        setMapping(nextMapping);
        rebuildPreview(parsed, nextMapping, sourceSystem);
    };

    const addColumn = (field: LeadImportTargetField, columnId: string) => {
        if (columnId.startsWith("__")) return;
        updateMapping(field, (current) => Array.from(new Set([...current, columnId])));
    };

    const removeColumn = (field: LeadImportTargetField, columnId: string) => {
        updateMapping(field, (current) => current.filter((id) => id !== columnId));
    };

    const moveColumn = (field: LeadImportTargetField, columnId: string, direction: -1 | 1) => {
        updateMapping(field, (current) => {
            const index = current.indexOf(columnId);
            const nextIndex = index + direction;
            if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
            const next = [...current];
            [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
            return next;
        });
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
            toast.error("No hay filas válidas para importar");
            return;
        }

        try {
            setPreparing(true);
            const nextCommit = await prepareLeadImportCommit(preview);
            setCommit(nextCommit);
            setConfirmOpen(true);
            setConfirmChecked(false);
            toast.success("Importación preparada");
        } catch (error) {
            console.error("Lead import prepare failed:", error);
            toast.error("No se pudo validar contra Supabase");
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
            setConfirmOpen(false);
            toast.success("Datos importados correctamente");
            await onImported?.();
        } catch (error) {
            console.error("Lead import save failed:", error);
            toast.error(error instanceof Error ? error.message : "No se pudo guardar la importación");
        } finally {
            setImporting(false);
        }
    };

    const selectedColumnsFor = (field: LeadImportTargetField) =>
        (mapping?.[field] || [])
            .map((columnId) => parsed?.columns.find((column) => column.id === columnId))
            .filter(Boolean);

    const topChannels = Object.entries(preview?.stats.channelCounts || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

    const topLabels = Object.entries(preview?.stats.labelCounts || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    return (
        <div className="space-y-6">
            <div className="rounded-lg border bg-background p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <Upload className="h-5 w-5 text-primary" />
                            <h3 className="text-lg font-semibold">Importar datos</h3>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Carga un Excel o CSV, revisa columnas y confirma antes de guardar en Supabase.
                        </p>
                    </div>
                    <div className="w-full lg:max-w-sm">
                        <Input
                            type="file"
                            accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            onChange={handleFileChange}
                            disabled={loadingFile || importing}
                        />
                    </div>
                </div>

                <div className="mt-5 space-y-2">
                    <div className="flex flex-wrap gap-2">
                        {stepLabels.map((label, index) => (
                            <Badge
                                key={label}
                                variant={index <= currentStep ? "default" : "outline"}
                                className={index <= currentStep ? "bg-primary/10 text-primary border-primary/20" : ""}
                            >
                                {index + 1}. {label}
                            </Badge>
                        ))}
                    </div>
                    <Progress value={((currentStep + 1) / stepLabels.length) * 100} className="h-2" />
                </div>

                {loadingFile && (
                    <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Leyendo archivo...
                    </div>
                )}
            </div>

            {parsed && mapping && preview && (
                <>
                    <div className="grid gap-4 lg:grid-cols-4">
                        <div className="rounded-lg border bg-background p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Archivo</p>
                            <p className="mt-2 truncate font-semibold">{parsed.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                                {parsed.fileType.toUpperCase()} · {parsed.sheetName}
                                {parsed.encoding ? ` · ${parsed.encoding}` : ""}
                            </p>
                        </div>
                        <div className="rounded-lg border bg-background p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Leídas</p>
                            <p className="mt-2 text-2xl font-bold">{formatNumber(preview.stats.totalRows)}</p>
                            <p className="text-xs text-muted-foreground">{formatNumber(parsed.columns.length)} columnas detectadas</p>
                        </div>
                        <div className="rounded-lg border bg-background p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Válidas</p>
                            <p className="mt-2 text-2xl font-bold text-green-700">{formatNumber(preview.stats.validRows)}</p>
                            <p className="text-xs text-muted-foreground">{formatNumber(preview.stats.uniqueRows)} identidades únicas</p>
                        </div>
                        <div className="rounded-lg border bg-background p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valor/Pago</p>
                            <p className="mt-2 text-2xl font-bold">{formatMoney(preview.stats.amountTotal)}</p>
                            <p className="text-xs text-muted-foreground">
                                {formatImportDate(preview.stats.minCreatedAt)} - {formatImportDate(preview.stats.maxCreatedAt)}
                            </p>
                        </div>
                    </div>

                    <div className="rounded-lg border bg-background p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                                    <h3 className="text-lg font-semibold">Seleccionar columnas</h3>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Cada campo puede usar varias columnas. El orden define la prioridad.
                                </p>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                <div className="space-y-1">
                                    <Label>Fuente</Label>
                                    <Input value={sourceSystem} onChange={(event) => handleSourceChange(event.target.value)} className="w-full sm:w-40" />
                                </div>
                                <Button variant="outline" className="gap-2" onClick={resetMapping}>
                                    <RotateCcw className="h-4 w-4" />
                                    Redetectar
                                </Button>
                            </div>
                        </div>

                        <div className="mt-5 grid gap-4 lg:grid-cols-2">
                            {LEAD_IMPORT_TARGETS.map((field) => {
                                const selectedColumns = selectedColumnsFor(field.id);
                                return (
                                    <div key={field.id} className="rounded-lg border p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-semibold">{field.label}</p>
                                                <p className="text-xs text-muted-foreground">{field.description}</p>
                                            </div>
                                            {field.preview && <Badge variant="secondary">Preview</Badge>}
                                        </div>

                                        <div className="mt-3 space-y-2">
                                            {selectedColumns.length === 0 && (
                                                <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">No importar</div>
                                            )}
                                            {selectedColumns.map((column, index) => (
                                                <div key={column!.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-2">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium">{index + 1}. {column!.displayName}</p>
                                                        <p className="truncate text-[11px] text-muted-foreground">
                                                            {column!.filledCount} datos · {column!.sampleValues.slice(0, 2).join(" | ") || "sin muestra"}
                                                        </p>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-1">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveColumn(field.id, column!.id, -1)} disabled={index === 0}>
                                                            <ArrowUp className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveColumn(field.id, column!.id, 1)} disabled={index === selectedColumns.length - 1}>
                                                            <ArrowDown className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeColumn(field.id, column!.id)}>
                                                            <X className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-3 flex gap-2">
                                            <Select value={`__add_${field.id}`} onValueChange={(value) => addColumn(field.id, value)}>
                                                <SelectTrigger className="min-w-0 flex-1">
                                                    <SelectValue placeholder="Agregar columna" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={`__add_${field.id}`} disabled>
                                                        Agregar columna
                                                    </SelectItem>
                                                    {parsed.columns.map((column) => (
                                                        <SelectItem key={column.id} value={column.id}>
                                                            {column.displayName}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button variant="outline" size="icon" onClick={() => clearMapping(field.id)}>
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <Separator className="my-5" />

                        <div>
                            <p className="text-sm font-semibold">Columnas marcadas como no importar</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {noImportColumns.slice(0, 24).map((column) => (
                                    <Badge key={column.id} variant="outline">{column.displayName}</Badge>
                                ))}
                                {noImportColumns.length > 24 && <Badge variant="outline">+{noImportColumns.length - 24}</Badge>}
                                {noImportColumns.length === 0 && <span className="text-sm text-muted-foreground">Todas las columnas tienen al menos un uso.</span>}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <div className="rounded-lg border bg-background p-4">
                            <p className="text-sm font-semibold">Calidad de filas</p>
                            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                <div><span className="text-muted-foreground">Omitidas:</span> {formatNumber(preview.stats.skippedRows)}</div>
                                <div><span className="text-muted-foreground">Duplicadas:</span> {formatNumber(preview.stats.duplicateRows)}</div>
                                <div><span className="text-muted-foreground">Sin número:</span> {formatNumber(preview.stats.missingPhoneRows)}</div>
                                <div><span className="text-muted-foreground">Sin etiqueta:</span> {formatNumber(preview.stats.missingLabelRows)}</div>
                                <div><span className="text-muted-foreground">Sin canal:</span> {formatNumber(preview.stats.missingChannelRows)}</div>
                                <div><span className="text-muted-foreground">Fechas:</span> {formatNumber(preview.stats.dateWarningRows)}</div>
                            </div>
                        </div>

                        <div className="rounded-lg border bg-background p-4">
                            <p className="text-sm font-semibold">Canales detectados</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {topChannels.map(([channel, count]) => (
                                    <Badge key={channel} variant="secondary">{channel}: {formatNumber(count)}</Badge>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-lg border bg-background p-4">
                            <p className="text-sm font-semibold">Etiquetas detectadas</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {topLabels.map(([label, count]) => (
                                    <Badge key={label} variant="outline">{label}: {formatNumber(count)}</Badge>
                                ))}
                            </div>
                        </div>
                    </div>

                    {preview.issues.length > 0 && (
                        <Alert variant={preview.issues.some((issue) => issue.severity === "error") ? "destructive" : "default"}>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Revisiones detectadas</AlertTitle>
                            <AlertDescription>
                                <div className="mt-2 space-y-1">
                                    {preview.issues.slice(0, 8).map((issue) => (
                                        <p key={`${issue.rowNumber}-${issue.reason}`} className="text-xs">
                                            Fila {issue.rowNumber}: {issue.reason}
                                        </p>
                                    ))}
                                    {preview.issues.length > 8 && (
                                        <p className="text-xs">+{preview.issues.length - 8} revisiones adicionales quedarán guardadas en auditoría.</p>
                                    )}
                                </div>
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="rounded-lg border bg-background p-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex items-center gap-2">
                                <ClipboardCheck className="h-5 w-5 text-primary" />
                                <h3 className="text-lg font-semibold">Vista previa final</h3>
                            </div>
                            <Button onClick={handlePrepare} disabled={preparing || importing || preview.rows.length === 0} className="gap-2">
                                {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                                Preparar importación
                            </Button>
                        </div>

                        <div className="mt-4 overflow-hidden rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-20">Fila</TableHead>
                                        {previewFields.map((field) => (
                                            <TableHead key={field.id}>{field.label}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {preview.rows.slice(0, 25).map((row) => (
                                        <TableRow key={`${row.rowNumber}-${row.conversationId}`}>
                                            <TableCell className="text-xs text-muted-foreground">{row.rowNumber}</TableCell>
                                            <TableCell className="max-w-[180px] truncate">{row.name || "Sin nombre"}</TableCell>
                                            <TableCell>{row.phone || "Sin número"}</TableCell>
                                            <TableCell>{row.channel || "Sin canal"}</TableCell>
                                            <TableCell className="max-w-[220px] truncate">{row.labels.join(", ") || "Sin etiqueta"}</TableCell>
                                            <TableCell>{row.amountRaw || ""}</TableCell>
                                            <TableCell>{formatImportDate(row.createdAtIso)}</TableCell>
                                            <TableCell>{formatImportDate(row.updatedAtIso)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {preview.rows.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                                                No hay filas válidas con el mapeo actual.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        {preview.rows.length > 25 && (
                            <p className="mt-2 text-xs text-muted-foreground">Mostrando 25 de {formatNumber(preview.rows.length)} filas válidas.</p>
                        )}
                    </div>

                    {result && (
                        <Alert>
                            <CheckCircle2 className="h-4 w-4" />
                            <AlertTitle>Importación completada</AlertTitle>
                            <AlertDescription>
                                Lote {result.batchId}. Creados: {formatNumber(result.created)} · Actualizados: {formatNumber(result.updated)} · Omitidos: {formatNumber(result.skipped)}.
                            </AlertDescription>
                        </Alert>
                    )}
                </>
            )}

            <Dialog open={confirmOpen} onOpenChange={(open) => !importing && setConfirmOpen(open)}>
                <DialogContent className="sm:max-w-[640px]">
                    <DialogHeader>
                        <DialogTitle>Confirmar importación definitiva</DialogTitle>
                        <DialogDescription>
                            Esta acción guardará los leads en Supabase y actualizará las métricas del dashboard.
                        </DialogDescription>
                    </DialogHeader>

                    {commit && preview && (
                        <div className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs text-muted-foreground">Nuevos</p>
                                    <p className="text-2xl font-bold">{formatNumber(commit.createCount)}</p>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs text-muted-foreground">Actualizaciones</p>
                                    <p className="text-2xl font-bold">{formatNumber(commit.updateCount)}</p>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs text-muted-foreground">Omitidos</p>
                                    <p className="text-2xl font-bold">{formatNumber(preview.stats.skippedRows)}</p>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs text-muted-foreground">Valor/Pago total</p>
                                    <p className="text-2xl font-bold">{formatMoney(preview.stats.amountTotal)}</p>
                                </div>
                            </div>

                            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                                <Checkbox checked={confirmChecked} onCheckedChange={(checked) => setConfirmChecked(checked === true)} />
                                <span>
                                    Confirmo que revisé el mapeo, la vista previa y los totales. Entiendo que estos datos se guardarán en Supabase.
                                </span>
                            </label>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" disabled={importing} onClick={() => setConfirmOpen(false)}>Cancelar</Button>
                        <Button disabled={!confirmChecked || importing} onClick={handleImport} className="gap-2">
                            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            Importar definitivamente
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
