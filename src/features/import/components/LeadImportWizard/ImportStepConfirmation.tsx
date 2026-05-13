import { AlertTriangle, CheckCircle2, Loader2, Plus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { formatNumber, formatMoney } from "../../utils/importUiHelpers";
import { type LeadImportCommitPlan, type LeadImportSaveResult } from "@/lib/leadImport";

interface ImportStepConfirmationProps {
    commit: LeadImportCommitPlan | null;
    result: LeadImportSaveResult | null;
    importing: boolean;
    mappingChecked: boolean;
    previewChecked: boolean;
    saveChecked: boolean;
    onMappingCheckedChange: (checked: boolean) => void;
    onPreviewCheckedChange: (checked: boolean) => void;
    onSaveCheckedChange: (checked: boolean) => void;
}

export function ImportStepConfirmation({
    commit,
    result,
    importing,
    mappingChecked,
    previewChecked,
    saveChecked,
    onMappingCheckedChange,
    onPreviewCheckedChange,
    onSaveCheckedChange,
}: ImportStepConfirmationProps) {
    const commitPayments = commit?.rows.filter((row) => row.amountNumber > 0).length || 0;
    const commitAmount = commit?.rows.reduce((sum, row) => sum + row.amountNumber, 0) || 0;

    if (result) {
        return (
            <div className="space-y-6 py-4 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <div>
                    <h3 className="text-2xl font-bold">¡Importación Exitosa!</h3>
                    <p className="mt-2 text-muted-foreground">
                        Se procesaron todas las filas válidas del archivo.
                    </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border bg-muted/20 p-4">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Nuevos Leads</p>
                        <p className="mt-2 text-3xl font-bold text-green-600">{formatNumber(result.created)}</p>
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-4">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Actualizados</p>
                        <p className="mt-2 text-3xl font-bold text-blue-600">{formatNumber(result.updated)}</p>
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-4">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Omitidos/Avisos</p>
                        <p className="mt-2 text-3xl font-bold text-amber-600">{formatNumber(result.skipped + result.warnings)}</p>
                    </div>
                </div>
                <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800">
                    El dashboard se actualizará automáticamente con los nuevos datos. Puedes cerrar esta ventana.
                </div>
            </div>
        );
    }

    if (!commit) return null;

    return (
        <div className="space-y-6">
            <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Confirmar acción final</AlertTitle>
                <AlertDescription>
                    Esta acción modificará la base de datos del dashboard. Revisa el impacto antes de ejecutar.
                </AlertDescription>
            </Alert>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border p-4">
                    <h4 className="font-semibold">Impacto en la base de datos</h4>
                    <div className="mt-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                                    <Plus className="h-4 w-4 text-green-600" />
                                </div>
                                <span className="text-sm">Leads nuevos a crear</span>
                            </div>
                            <Badge variant="outline" className="text-base">{formatNumber(commit.createCount)}</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                                    <Plus className="h-4 w-4 text-blue-600" />
                                </div>
                                <span className="text-sm">Leads existentes a actualizar</span>
                            </div>
                            <Badge variant="outline" className="text-base">{formatNumber(commit.updateCount)}</Badge>
                        </div>
                        <div className="flex items-center justify-between border-t pt-4">
                            <span className="text-sm font-semibold">Total de cambios</span>
                            <span className="text-xl font-bold">{formatNumber(commit.createCount + commit.updateCount)}</span>
                        </div>
                    </div>
                </div>

                <div className="rounded-lg border p-4">
                    <h4 className="font-semibold">Métricas de negocio</h4>
                    <div className="mt-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm">Nuevos pagos/ventas detectados</span>
                            <Badge variant="secondary" className="text-base bg-amber-100 text-amber-800 border-amber-200">
                                {formatNumber(commitPayments)}
                            </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm">Volumen total de estas ventas</span>
                            <span className="text-lg font-bold text-amber-700">{formatMoney(commitAmount)}</span>
                        </div>
                        <p className="mt-4 text-[11px] text-muted-foreground leading-relaxed">
                            Los leads que ya tienen una venta registrada en el sistema no duplicarán el monto, solo se actualizarán sus otros datos si es necesario.
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <h4 className="text-sm font-semibold">Checklist de seguridad</h4>
                <div className="space-y-3">
                    <label className="flex cursor-pointer items-start gap-3">
                        <Checkbox checked={mappingChecked} onCheckedChange={(c) => onMappingCheckedChange(c === true)} />
                        <span className="text-xs leading-none">Confirmo que las columnas están correctamente mapeadas y no hay datos cruzados.</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3">
                        <Checkbox checked={previewChecked} onCheckedChange={(c) => onPreviewCheckedChange(c === true)} />
                        <span className="text-xs leading-none">He revisado la vista previa y acepto que las filas con errores no se importarán.</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3">
                        <Checkbox checked={saveChecked} onCheckedChange={(c) => onSaveCheckedChange(c === true)} />
                        <span className="text-xs leading-none">Entiendo que esta acción es irreversible y afectará las métricas del dashboard.</span>
                    </label>
                </div>
            </div>

            {importing && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Guardando leads en la base de datos...
                        </span>
                    </div>
                    <Progress value={undefined} className="h-2" />
                </div>
            )}
        </div>
    );
}
