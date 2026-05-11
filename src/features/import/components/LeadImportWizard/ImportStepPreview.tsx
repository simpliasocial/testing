import { useMemo } from "react";
import { AlertTriangle, Database, ClipboardCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
    formatNumber,
    formatMoney,
    formatIssueForUser,
    optionalTargets,
    visibleTargets,
} from "../../utils/importUiHelpers";
import {
    type LeadImportPreview,
    type LeadImportMapping,
    type LeadImportTargetField,
    type ParsedLeadImportFile,
    type LeadImportPreviewRow,
} from "@/lib/leadImport";

interface ImportStepPreviewProps {
    parsed: ParsedLeadImportFile | null;
    mapping: LeadImportMapping | null;
    preview: LeadImportPreview | null;
}

const rowValueFor = (row: LeadImportPreviewRow, field: LeadImportTargetField) => {
    switch (field) {
        case "externalId": return row.externalLeadId;
        case "name": return row.name;
        case "phone": return row.phone;
        case "channel": return row.channel;
        case "labels": return row.labels?.join(", ");
        case "amount": return row.amountRaw;
        case "paymentDate": return row.paymentDateIso;
        case "createdAt": return row.createdAtIso;
        case "updatedAt": return row.updatedAtIso;
        case "email": return row.email;
        case "campaign": return row.campaign;
        case "city": return row.city;
        default: return "";
    }
};

export function ImportStepPreview({
    parsed,
    mapping,
    preview,
}: ImportStepPreviewProps) {
    const groupedIssues = useMemo(() => {
        const groups = new Map<string, {
            field?: string;
            label: string;
            reason: string;
            severity: "error" | "warning";
            rows: Set<number>;
        }>();

        (preview?.issues || []).forEach((issue) => {
            const fieldLabel = visibleTargets.find(t => t.id === issue.field)?.label || "Fila";
            const key = `${issue.severity}:${issue.field || "row"}:${issue.reason}`;
            const existing = groups.get(key);
            if (existing) {
                existing.rows.add(issue.rowNumber);
                return;
            }
            groups.set(key, {
                field: issue.field,
                label: fieldLabel,
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
                    topValues,
                };
            })
            .filter(Boolean);
    }, [mapping, preview]);

    if (!parsed || !preview) return null;

    return (
        <div className="space-y-5">
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

            <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
                <div className="space-y-5">
                    {blockingIssueGroups.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="flex items-center gap-2 font-semibold text-destructive">
                                <AlertTriangle className="h-4 w-4" />
                                Errores críticos que bloquean filas
                            </h4>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {blockingIssueGroups.map((group) => (
                                    <div key={group.reason} className="rounded-lg border border-red-100 bg-red-50/50 p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="text-sm font-semibold text-red-900">{group.label}</p>
                                            <Badge variant="destructive">{group.count} filas</Badge>
                                        </div>
                                        <p className="mt-1 text-xs text-red-800">{group.reason}</p>
                                        <p className="mt-2 text-[10px] text-red-700/60">
                                            Ejemplos: filas {group.examples.join(", ")}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        <h4 className="flex items-center gap-2 font-semibold">
                            <ClipboardCheck className="h-4 w-4 text-green-600" />
                            Resumen de datos a importar
                        </h4>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {optionalFieldSummaries.map((summary: any) => (
                                <div key={summary.id} className="rounded-lg border bg-background p-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm font-semibold">{summary.label}</p>
                                        <Badge variant="secondary">{formatNumber(summary.count)}</Badge>
                                    </div>
                                    <div className="mt-2 space-y-1">
                                        {summary.topValues.map((item: any) => (
                                            <div key={item.value} className="flex items-center justify-between gap-2 text-[11px]">
                                                <span className="truncate text-muted-foreground">{item.value}</span>
                                                <span className="shrink-0 font-medium">{formatNumber(item.count)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="rounded-lg border bg-blue-50/30 p-4">
                        <h4 className="flex items-center gap-2 font-semibold text-blue-900">
                            <Database className="h-4 w-4" />
                            Calidad de los datos
                        </h4>
                        <p className="mt-2 text-sm text-blue-900/70">
                            El sistema detectó {warningIssueGroups.length} tipos de avisos no bloqueantes. Estas filas se subirán pero pueden faltar datos opcionales.
                        </p>
                        <div className="mt-4 space-y-3">
                            {warningIssueGroups.slice(0, 5).map((group) => (
                                <div key={group.reason} className="space-y-1">
                                    <div className="flex items-center justify-between gap-2 text-xs font-medium text-blue-900">
                                        <span>{group.label}</span>
                                        <span>{group.count} filas</span>
                                    </div>
                                    <p className="text-[11px] text-blue-800/60 leading-relaxed">
                                        {group.reason}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
