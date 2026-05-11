import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatNumber, requiredTargets, visibleTargets } from "../../utils/importUiHelpers";
import { type LeadImportMapping, type LeadImportPreview, type ParsedLeadImportFile } from "@/lib/leadImport";

interface ImportStepRequirementsProps {
    parsed: ParsedLeadImportFile | null;
    preview: LeadImportPreview | null;
    mapping: LeadImportMapping | null;
    missingRequiredMapping: any[];
}

export function ImportStepRequirements({
    parsed,
    preview,
    mapping,
    missingRequiredMapping,
}: ImportStepRequirementsProps) {
    if (!parsed || !preview) return null;

    return (
        <div className="space-y-5">
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
