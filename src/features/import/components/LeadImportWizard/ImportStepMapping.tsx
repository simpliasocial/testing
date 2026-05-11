import { RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    formatIssueForUser,
    normalizationHelpFor,
    normalizedExampleFor,
    visibleTargets,
} from "../../utils/importUiHelpers";
import {
    type LeadImportColumn,
    type LeadImportMapping,
    type LeadImportPreview,
    type LeadImportTargetDefinition,
    type LeadImportTargetField,
    type ParsedLeadImportFile,
} from "@/lib/leadImport";

interface ImportStepMappingProps {
    parsed: ParsedLeadImportFile | null;
    mapping: LeadImportMapping | null;
    preview: LeadImportPreview | null;
    sourceSystem: string;
    activeFieldIndex: number;
    reviewedFieldIds: Set<LeadImportTargetField>;
    onSourceChange: (value: string) => void;
    onActiveFieldChange: (index: number) => void;
    onAddColumn: (field: LeadImportTargetField, columnId: string) => void;
    onRemoveColumn: (field: LeadImportTargetField, columnId: string) => void;
    onClearMapping: (field: LeadImportTargetField) => void;
    onResetMapping: () => void;
}

export function ImportStepMapping({
    parsed,
    mapping,
    preview,
    sourceSystem,
    activeFieldIndex,
    reviewedFieldIds,
    onSourceChange,
    onActiveFieldChange,
    onAddColumn,
    onRemoveColumn,
    onClearMapping,
    onResetMapping,
}: ImportStepMappingProps) {
    const activeField = visibleTargets[Math.min(activeFieldIndex, visibleTargets.length - 1)];
    const reviewedFieldsCount = visibleTargets.filter((target) => reviewedFieldIds.has(target.id)).length;

    const selectedColumnsFor = (field: LeadImportTargetField) =>
        (mapping?.[field] || [])
            .map((columnId) => parsed?.columns.find((column) => column.id === columnId))
            .filter(Boolean) as LeadImportColumn[];

    const fieldIssues = (field: LeadImportTargetField) =>
        (preview?.issues || []).filter((issue) => issue.field === field).slice(0, 4);

    if (!activeField) return null;

    const selectedColumns = selectedColumnsFor(activeField.id);
    const firstSample = selectedColumns[0]?.sampleValues[0] || "";
    const normalizedSample = normalizedExampleFor(activeField.id, firstSample);
    const issues = fieldIssues(activeField.id);
    const isRequiredMissing = activeField.required && selectedColumns.length === 0;

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
                        <Input
                            value={sourceSystem}
                            onChange={(event) => onSourceChange(event.target.value)}
                            className="w-full sm:w-40"
                        />
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

            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                <div className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Campos a revisar</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                Revisados {reviewedFieldsCount}/{visibleTargets.length}
                            </p>
                        </div>
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
                                    onClick={() => onActiveFieldChange(index)}
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
                                <h3 className="text-lg font-semibold">{activeField.label}</h3>
                                <Badge variant={activeField.required ? "default" : "outline"}>
                                    {activeField.required ? "Obligatorio" : "Opcional"}
                                </Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{activeField.description}</p>
                        </div>
                        <Button variant="outline" className="gap-2" onClick={onResetMapping}>
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
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onRemoveColumn(activeField.id, column.id)}>
                                                <X className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                {selectedColumns.length === 0 && (
                                    <div className={`rounded-md px-3 py-2 text-sm ${activeField.required ? "bg-red-50 text-red-800" : "bg-muted/60 text-muted-foreground"}`}>
                                        {activeField.required ? "Este campo debe tener una columna para poder importar filas." : "No se importará este dato."}
                                    </div>
                                )}
                            </div>

                            <div className="mt-3 flex gap-2">
                                <Select value={selectedColumns[0]?.id || `__select_${activeField.id}`} onValueChange={(value) => onAddColumn(activeField.id, value)}>
                                    <SelectTrigger className="min-w-0 flex-1">
                                        <SelectValue placeholder="Seleccionar columna" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={`__select_${activeField.id}`} disabled>Seleccionar una columna</SelectItem>
                                        {(parsed?.columns || []).map((column) => (
                                            <SelectItem key={column.id} value={column.id}>
                                                {column.displayName}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button variant="outline" onClick={() => onClearMapping(activeField.id)}>Limpiar</Button>
                            </div>
                        </div>

                        <div className="rounded-lg bg-muted/30 p-3">
                            <p className="text-sm font-semibold">Formato final del sistema</p>
                            <div className="mt-3 space-y-3 text-sm">
                                <p className="rounded-md bg-background px-3 py-2 text-xs text-muted-foreground">
                                    {normalizationHelpFor(activeField.id)}
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
                        <Button variant="outline" onClick={() => onActiveFieldChange(Math.max(activeFieldIndex - 1, 0))} disabled={activeFieldIndex === 0}>
                            Campo anterior
                        </Button>
                        <Button onClick={() => onActiveFieldChange(Math.min(activeFieldIndex + 1, visibleTargets.length - 1))} disabled={activeFieldIndex === visibleTargets.length - 1}>
                            Siguiente campo
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
