import { Upload, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNumber } from "../../utils/importUiHelpers";
import { type ParsedLeadImportFile, type LeadImportPreview } from "@/lib/leadImport";

interface ImportStepFileProps {
    parsed: ParsedLeadImportFile | null;
    preview: LeadImportPreview | null;
    loadingFile: boolean;
    importing: boolean;
    onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
}

export function ImportStepFile({
    parsed,
    preview,
    loadingFile,
    importing,
    onFileChange,
}: ImportStepFileProps) {
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
                    onChange={onFileChange}
                    disabled={loadingFile || importing}
                />
                {loadingFile && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Leyendo archivo y detectando columnas...
                    </div>
                )}
            </div>
            {parsed && preview && (
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
            )}
        </div>
    );
}
