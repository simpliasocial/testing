import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Settings2 } from "lucide-react";
import { formatBusinessLabel } from "@/lib/displayCopy";
import { getBucketRangeLabel, SCORE_BUCKET_COPY, SCORE_BUCKET_ORDER } from "@/lib/leadScoreClassification";
import { EmptyState } from "./ScoringShared";
import { isAdmin } from "@/domain/auth/permissions";
import type { ScoreAttributeOption } from "../model/leadScoringModel";
import type { ScoreThresholds } from "@/domain/lead";

interface ScoringConfigPanelProps {
    role: string | null;
    configOpen: boolean;
    setConfigOpen: (open: boolean) => void;
    settingsDirty: boolean;
    savingSettings: boolean;
    scoreAttributeKeyDraft: string | null;
    setScoreAttributeKeyDraft: (key: string | null) => void;
    thresholdHotDraft: string;
    setThresholdHotDraft: (value: string) => void;
    thresholdWarmDraft: string;
    setThresholdWarmDraft: (value: string) => void;
    appointmentLabelsDraft: string[];
    thresholdValidationError: string | null;
    noScoringAttributeAvailable: boolean;
    actualLabels: string[];
    scoreAttributeOptions: ScoreAttributeOption[];
    selectedScoreAttribute: ScoreAttributeOption | null;
    activeScoreThresholds: ScoreThresholds;
    toggleAppointmentLabel: (label: string) => void;
    saveScoringConfig: () => void;
    restoreDefaultConfig: () => void;
}

const BUCKET_ORDER = SCORE_BUCKET_ORDER;
const BUCKET_COPY = SCORE_BUCKET_COPY;

export const ScoringConfigPanel: React.FC<ScoringConfigPanelProps> = ({
    role, configOpen, setConfigOpen, settingsDirty, savingSettings,
    scoreAttributeKeyDraft, setScoreAttributeKeyDraft,
    thresholdHotDraft, setThresholdHotDraft, thresholdWarmDraft, setThresholdWarmDraft,
    appointmentLabelsDraft, thresholdValidationError, noScoringAttributeAvailable,
    actualLabels, scoreAttributeOptions, selectedScoreAttribute,
    activeScoreThresholds, toggleAppointmentLabel, saveScoringConfig, restoreDefaultConfig,
}) => {
    if (!isAdmin(role)) return null;

    return (
        <Card>
            <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
                <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Settings2 className="h-5 w-5 text-primary" />
                                Configurar puntajes
                            </CardTitle>
                            <CardDescription>
                                Elige el campo numérico oficial del puntaje, ajusta los rangos y define qué estados cuentan como cita.
                            </CardDescription>
                        </div>
                        <CollapsibleTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-2 self-start">
                                {configOpen ? "Ocultar configuración" : "Abrir configuración"}
                                <ChevronDown className={`h-4 w-4 transition-transform ${configOpen ? "rotate-180" : ""}`} />
                            </Button>
                        </CollapsibleTrigger>
                    </div>

                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr]">
                        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                            <div className="font-semibold">Campo actual del puntaje</div>
                            <div className="mt-1 text-muted-foreground">
                                {selectedScoreAttribute
                                    ? selectedScoreAttribute.label
                                    : "Sin campo numérico disponible"}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                                El tablero usa el valor final guardado en ese campo y lo clasifica con los rangos configurados.
                            </div>
                        </div>

                        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                            <div className="font-semibold">Niveles del puntaje</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {BUCKET_ORDER.map((bucket) => (
                                    <button
                                        key={bucket}
                                        type="button"
                                        onClick={() => setConfigOpen(true)}
                                        className={`rounded-full border px-3 py-1 text-xs font-medium transition hover:bg-muted/40 ${BUCKET_COPY[bucket].bg}`}
                                    >
                                        {BUCKET_COPY[bucket].label}: {getBucketRangeLabel(bucket, activeScoreThresholds)}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                                Pulsa cualquier nivel para cambiar los rangos.
                            </div>
                        </div>
                    </div>
                </CardHeader>

                <CollapsibleContent>
                    <CardContent className="space-y-4 pt-0">
                        {noScoringAttributeAvailable ? (
                            <EmptyState text="No hay campos numéricos configurados todavía. Crea uno para activar esta pestaña." />
                        ) : (
                            <>
                                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold">Campo numérico del puntaje</label>
                                        <Select
                                            value={scoreAttributeKeyDraft || ""}
                                            onValueChange={(value) => {
                                                setScoreAttributeKeyDraft(value);
                                            }}
                                        >
                                            <SelectTrigger className="h-10">
                                                <SelectValue placeholder="Selecciona un campo numérico" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {scoreAttributeOptions.map((option) => (
                                                    <SelectItem key={option.key} value={option.key}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            Solo aparecen campos numéricos. Si existe <span className="font-medium">Puntaje de interés</span>, se usa como sugerencia inicial.
                                        </p>
                                        {scoreAttributeOptions.find(option => option.key === scoreAttributeKeyDraft)?.description ? (
                                            <p className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                                                {scoreAttributeOptions.find(option => option.key === scoreAttributeKeyDraft)?.description}
                                            </p>
                                        ) : null}
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold">Estados que contarán como cita</label>
                                        <div className="rounded-lg border">
                                            <div className="border-b bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                                                Selecciona los estados que cuentan como cita o avance comercial para medir qué porcentaje de leads calientes ya llegó a ese punto.
                                            </div>
                                            <div className="max-h-[220px] space-y-2 overflow-y-auto p-3">
                                                {actualLabels.length === 0 ? (
                                                    <p className="py-4 text-center text-xs text-muted-foreground">No hay estados configurados todavía.</p>
                                                ) : (
                                                    actualLabels.map((label) => (
                                                        <label key={`score-appointment-${label}`} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/20">
                                                            <Checkbox
                                                                checked={appointmentLabelsDraft.includes(label)}
                                                                onCheckedChange={() => toggleAppointmentLabel(label)}
                                                            />
                                                            <span className="truncate text-sm">{formatBusinessLabel(label)}</span>
                                                        </label>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-lg border bg-muted/10 p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-semibold">Rangos para Caliente, Tibio y Frío</div>
                                            <p className="text-xs text-muted-foreground">
                                                El tablero clasificará el puntaje según estos cortes.
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {BUCKET_ORDER.map((bucket) => (
                                                <Badge key={`preview-${bucket}`} variant="outline" className={BUCKET_COPY[bucket].bg}>
                                                    {BUCKET_COPY[bucket].label}: {getBucketRangeLabel(bucket, activeScoreThresholds)}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold">Desde Caliente</label>
                                            <Input
                                                type="number"
                                                inputMode="decimal"
                                                value={thresholdHotDraft}
                                                onChange={(event) => {
                                                    setThresholdHotDraft(event.target.value);
                                                }}
                                                placeholder="70"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold">Desde Tibio</label>
                                            <Input
                                                type="number"
                                                inputMode="decimal"
                                                value={thresholdWarmDraft}
                                                onChange={(event) => {
                                                    setThresholdWarmDraft(event.target.value);
                                                }}
                                                placeholder="45"
                                            />
                                        </div>
                                    </div>

                                    {thresholdValidationError ? (
                                        <p className="mt-3 text-xs font-medium text-red-600">{thresholdValidationError}</p>
                                    ) : null}
                                </div>

                                <div className="rounded-lg border bg-muted/15 p-3 text-xs text-muted-foreground">
                                    Recomendación: guarda el puntaje final en el campo seleccionado. Luego el tablero lo clasificará usando los rangos configurados aquí.
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                    <Button variant="outline" size="sm" onClick={restoreDefaultConfig} disabled={savingSettings}>
                                        Restaurar valores sugeridos
                                    </Button>
                                    <Button size="sm" onClick={saveScoringConfig} disabled={!settingsDirty || savingSettings}>
                                        {savingSettings ? "Guardando..." : "Guardar configuración"}
                                    </Button>
                                </div>
                            </>
                        )}
                    </CardContent>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
};
