import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    ChatwootAttributeDefinition,
    ScoreThresholds,
    useDashboardContext
} from "@/context/DashboardDataContext";
import {
    formatDateTime,
    getAttrs,
    getLeadChannelName,
    getLeadName,
    getLeadPhone,
} from "@/lib/leadDisplay";
import { formatBusinessLabel, formatFieldLabel } from "@/lib/displayCopy";
import { MinifiedConversation } from "@/services/StorageService";
import { KPICard } from "@/components/dashboard/KPICard";
import { cn } from "@/lib/utils";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    LabelList,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from "recharts";
import {
    Activity,
    BadgeCheck,
    Check,
    ChevronDown,
    ChevronsUpDown,
    Gauge,
    Loader2,
    Settings2,
    Target,
    TrendingUp
} from "lucide-react";

type ScoreBucket = "high" | "medium" | "low";
type ScoreDimension = "label" | "campaign";

interface ScoreAttributeOption {
    key: string;
    label: string;
    description: string;
    type: string;
}

interface PreparedLead {
    lead: any;
    score: number | null;
    bucket: ScoreBucket | null;
    bucketLabel: string;
    channel: string;
    campaign: string;
    owner: string;
    attributeKey: string;
    attributeLabel: string;
}

const BUCKET_ORDER: ScoreBucket[] = ["high", "medium", "low"];
const BUCKET_COPY: Record<ScoreBucket, { label: string; color: string; bg: string }> = {
    high: { label: "Alta", color: "#059669", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    medium: { label: "Media", color: "#d97706", bg: "bg-amber-50 text-amber-700 border-amber-200" },
    low: { label: "Baja", color: "#dc2626", bg: "bg-red-50 text-red-700 border-red-200" }
};
const DEFAULT_SCORE_THRESHOLDS: ScoreThresholds = {
    highMin: 20,
    mediumMin: 10
};

const unique = (values: string[]) =>
    Array.from(new Set(values.map(value => value?.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

const parseDate = (value: unknown) => {
    if (!value) return new Date(0);
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return new Date(numeric < 10000000000 ? numeric * 1000 : numeric);
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
};

const parseNumericScore = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;

    const normalized = String(value)
        .trim()
        .replace(",", ".")
        .replace(/[^0-9.-]/g, "");
    if (!normalized) return null;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};

const scoreAverage = (items: PreparedLead[]) =>
    items.length > 0 ? Math.round((items.reduce((sum, item) => sum + (item.score || 0), 0) / items.length) * 10) / 10 : 0;

const percent = (count: number, total: number) =>
    total > 0 ? Math.round((count / total) * 100) : 0;

const normalizeThresholds = (thresholds?: Partial<ScoreThresholds> | null): ScoreThresholds => {
    const parsedHigh = Number(thresholds?.highMin);
    const parsedMedium = Number(thresholds?.mediumMin);
    const highMin = Number.isFinite(parsedHigh) ? parsedHigh : DEFAULT_SCORE_THRESHOLDS.highMin;
    const mediumMin = Number.isFinite(parsedMedium) ? parsedMedium : DEFAULT_SCORE_THRESHOLDS.mediumMin;

    if (highMin <= mediumMin) {
        return DEFAULT_SCORE_THRESHOLDS;
    }

    return { highMin, mediumMin };
};

const bucketFromScore = (score: number, thresholds: ScoreThresholds): ScoreBucket => {
    if (score >= thresholds.highMin) return "high";
    if (score >= thresholds.mediumMin) return "medium";
    return "low";
};

const formatThresholdValue = (value: number) => Number.isInteger(value) ? String(value) : value.toString();

const getBucketRangeLabel = (bucket: ScoreBucket, thresholds: ScoreThresholds) => {
    if (bucket === "high") return `Desde ${formatThresholdValue(thresholds.highMin)}`;
    if (bucket === "medium") return `Desde ${formatThresholdValue(thresholds.mediumMin)} y antes de ${formatThresholdValue(thresholds.highMin)}`;
    return `Menor a ${formatThresholdValue(thresholds.mediumMin)}`;
};

const isNumericAttributeDefinition = (definition: ChatwootAttributeDefinition) => {
    const type = String(definition.attribute_display_type || "").trim().toLowerCase();
    return ["number", "integer", "decimal", "float"].some(token => type.includes(token));
};

const toAttributeOption = (definition: ChatwootAttributeDefinition): ScoreAttributeOption | null => {
    const key = String(definition.attribute_key || "").trim();
    if (!key) return null;

    return {
        key,
        label: formatFieldLabel(definition.attribute_display_name || key),
        description: String(definition.attribute_description || "").trim(),
        type: String(definition.attribute_display_type || "number").trim()
    };
};

const extractLeadLabels = (lead: any) =>
    unique([...(lead?.resolvedLabels || []), ...(lead?.labels || [])].map(label => String(label || "")));

const resolveLeadCampaign = (lead: any) =>
    String(lead?.resolvedAttrs?.utm_campaign || lead?.resolvedAttrs?.campana || lead?.resolvedAttrs?.origen || "").trim() || "Sin campaña";

const EmptyState = ({ text }: { text: string }) => (
    <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground">
        {text}
    </div>
);

const LeadScoringLayer = () => {
    const {
        conversations,
        inboxes,
        globalFilters,
        tagSettings,
        updateTagSettings,
        labels: configuredLabels,
        contactAttributeDefinitions,
        loading
    } = useDashboardContext();
    const { role } = useAuth();

    const [campaignFilter, setCampaignFilter] = useState("all");
    const [labelFilters, setLabelFilters] = useState<string[]>([]);
    const [ownerFilter, setOwnerFilter] = useState("all");
    const [bucketFilter, setBucketFilter] = useState("all");
    const [scoreDimension, setScoreDimension] = useState<ScoreDimension>("label");
    const [configOpen, setConfigOpen] = useState(() => !tagSettings.scoreAttributeKey);
    const [settingsDirty, setSettingsDirty] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [scoreAttributeKeyDraft, setScoreAttributeKeyDraft] = useState("");
    const [appointmentLabelsDraft, setAppointmentLabelsDraft] = useState<string[]>([]);
    const [thresholdHighDraft, setThresholdHighDraft] = useState(String(DEFAULT_SCORE_THRESHOLDS.highMin));
    const [thresholdMediumDraft, setThresholdMediumDraft] = useState(String(DEFAULT_SCORE_THRESHOLDS.mediumMin));

    const inboxMap = useMemo(
        () => new Map(inboxes.map((inbox: any) => [Number(inbox.id), inbox])),
        [inboxes]
    );

    const actualLabels = useMemo(
        () => unique((configuredLabels || []).filter(label => typeof label === "string")),
        [configuredLabels]
    );

    const effectiveScoreThresholds = useMemo(
        () => normalizeThresholds(tagSettings.scoreThresholds),
        [tagSettings.scoreThresholds]
    );

    const scoreAttributeOptions = useMemo(() => {
        const byKey = new Map<string, ScoreAttributeOption>();

        contactAttributeDefinitions
            .filter(isNumericAttributeDefinition)
            .forEach((definition) => {
                const option = toAttributeOption(definition);
                if (!option) return;
                byKey.set(option.key, option);
            });

        return Array.from(byKey.values()).sort((a, b) => {
            if (a.key === "score_interes") return -1;
            if (b.key === "score_interes") return 1;
            return a.label.localeCompare(b.label);
        });
    }, [contactAttributeDefinitions]);

    const defaultScoreAttributeKey = useMemo(
        () => scoreAttributeOptions.find(option => option.key === "score_interes")?.key || scoreAttributeOptions[0]?.key || "",
        [scoreAttributeOptions]
    );

    const effectiveScoreAttributeKey = useMemo(() => {
        if (tagSettings.scoreAttributeKey && scoreAttributeOptions.some(option => option.key === tagSettings.scoreAttributeKey)) {
            return tagSettings.scoreAttributeKey;
        }
        return defaultScoreAttributeKey;
    }, [tagSettings.scoreAttributeKey, scoreAttributeOptions, defaultScoreAttributeKey]);

    const defaultAppointmentLabels = useMemo(
        () => unique([...(tagSettings.appointmentTags || []), tagSettings.humanAppointmentTargetLabel || ""].filter(Boolean)),
        [tagSettings.appointmentTags, tagSettings.humanAppointmentTargetLabel]
    );

    const effectiveAppointmentLabels = useMemo(() => {
        const configuredAppointmentLabels = unique((tagSettings.scoreAppointmentLabels || []).filter(label => actualLabels.includes(label)));
        return configuredAppointmentLabels.length > 0 ? configuredAppointmentLabels : defaultAppointmentLabels;
    }, [tagSettings.scoreAppointmentLabels, actualLabels, defaultAppointmentLabels]);

    useEffect(() => {
        if (!settingsDirty) {
            setScoreAttributeKeyDraft(effectiveScoreAttributeKey);
            setAppointmentLabelsDraft(effectiveAppointmentLabels);
            setThresholdHighDraft(String(effectiveScoreThresholds.highMin));
            setThresholdMediumDraft(String(effectiveScoreThresholds.mediumMin));
        }
    }, [effectiveScoreAttributeKey, effectiveAppointmentLabels, effectiveScoreThresholds, settingsDirty]);

    const activeScoreAttributeKey = (settingsDirty ? scoreAttributeKeyDraft : effectiveScoreAttributeKey) || "";
    const activeAppointmentLabels = useMemo(
        () => unique((settingsDirty ? appointmentLabelsDraft : effectiveAppointmentLabels).filter(label => actualLabels.includes(label))),
        [appointmentLabelsDraft, effectiveAppointmentLabels, settingsDirty, actualLabels]
    );
    const activeScoreThresholds = useMemo(
        () => normalizeThresholds({
            highMin: Number(settingsDirty ? thresholdHighDraft : effectiveScoreThresholds.highMin),
            mediumMin: Number(settingsDirty ? thresholdMediumDraft : effectiveScoreThresholds.mediumMin)
        }),
        [settingsDirty, thresholdHighDraft, thresholdMediumDraft, effectiveScoreThresholds]
    );

    const thresholdValidationError = useMemo(() => {
        const parsedHigh = Number(thresholdHighDraft);
        const parsedMedium = Number(thresholdMediumDraft);

        if (!Number.isFinite(parsedHigh) || !Number.isFinite(parsedMedium)) {
            return "Ingresa valores numéricos válidos para Alta y Media.";
        }

        if (parsedHigh <= parsedMedium) {
            return "El valor de Alta debe ser mayor que el valor de Media.";
        }

        return null;
    }, [thresholdHighDraft, thresholdMediumDraft]);

    const selectedScoreAttribute = useMemo(
        () => scoreAttributeOptions.find(option => option.key === activeScoreAttributeKey) || null,
        [scoreAttributeOptions, activeScoreAttributeKey]
    );

    const saveScoringConfig = async () => {
        if (!scoreAttributeKeyDraft) {
            toast.error("Selecciona un campo numérico para calcular el puntaje.");
            return;
        }
        if (thresholdValidationError) {
            toast.error(thresholdValidationError);
            return;
        }

        setSavingSettings(true);
        try {
            await updateTagSettings({
                ...tagSettings,
                scoreAttributeKey: scoreAttributeKeyDraft,
                scoreAppointmentLabels: unique(appointmentLabelsDraft.filter(label => actualLabels.includes(label))),
                scoreThresholds: {
                    highMin: Number(thresholdHighDraft),
                    mediumMin: Number(thresholdMediumDraft)
                }
            });
            setSettingsDirty(false);
            setConfigOpen(false);
            toast.success("La configuración de puntajes quedó guardada.");
        } catch (saveError) {
            console.error("Error saving scoring config:", saveError);
            toast.error("No se pudo guardar la configuración de puntajes.");
        } finally {
            setSavingSettings(false);
        }
    };

    const restoreDefaultConfig = () => {
        setSettingsDirty(true);
        setScoreAttributeKeyDraft(defaultScoreAttributeKey);
        setAppointmentLabelsDraft(defaultAppointmentLabels);
        setThresholdHighDraft(String(DEFAULT_SCORE_THRESHOLDS.highMin));
        setThresholdMediumDraft(String(DEFAULT_SCORE_THRESHOLDS.mediumMin));
    };

    const toggleAppointmentLabel = (label: string) => {
        setSettingsDirty(true);
        setAppointmentLabelsDraft((current) =>
            current.includes(label)
                ? current.filter(item => item !== label)
                : unique([...current, label])
        );
    };

    const dateFilteredLeads = useMemo(() => {
        const start = globalFilters.startDate ? new Date(globalFilters.startDate) : new Date(2024, 0, 1);
        start.setHours(0, 0, 0, 0);
        const end = globalFilters.endDate ? new Date(globalFilters.endDate) : new Date(2030, 0, 1);
        end.setHours(23, 59, 59, 999);
        const selectedInboxes = globalFilters.selectedInboxes || [];

        return conversations.filter((lead) => {
            if (selectedInboxes.length > 0 && !selectedInboxes.includes(Number(lead.inbox_id))) return false;
            const createdAt = parseDate(lead.created_at || lead.timestamp);
            return createdAt >= start && createdAt <= end;
        });
    }, [conversations, globalFilters.startDate, globalFilters.endDate, globalFilters.selectedInboxes]);

    const preparedLeads = useMemo<PreparedLead[]>(() => {
        const selectedAttributeLabel = selectedScoreAttribute?.label || formatFieldLabel(activeScoreAttributeKey) || "Sin campo";

        return dateFilteredLeads.map((lead: any) => {
            const inbox = lead.inbox_id ? inboxMap.get(Number(lead.inbox_id)) : null;
            const score = activeScoreAttributeKey ? parseNumericScore(lead.resolvedAttrs[activeScoreAttributeKey]) : null;
            const bucket = score === null ? null : bucketFromScore(score, activeScoreThresholds);

            return {
                lead,
                score,
                bucket,
                bucketLabel: bucket ? BUCKET_COPY[bucket].label : "Sin puntaje",
                channel: getLeadChannelName(lead, inbox),
                campaign: resolveLeadCampaign(lead),
                owner: String(lead.resolvedAttrs.responsable || lead.meta?.assignee?.name || "").trim() || "Sin responsable",
                attributeKey: activeScoreAttributeKey,
                attributeLabel: selectedAttributeLabel
            };
        });
    }, [dateFilteredLeads, inboxMap, activeScoreAttributeKey, activeScoreThresholds, selectedScoreAttribute]);

    const scorablePreparedLeads = useMemo(
        () => preparedLeads.filter((item): item is PreparedLead & { score: number; bucket: ScoreBucket } => item.score !== null && item.bucket !== null),
        [preparedLeads]
    );

    const scoreVisibleLabels = useMemo(
        () => unique(scorablePreparedLeads.flatMap(item => extractLeadLabels(item.lead))),
        [scorablePreparedLeads]
    );

    const allVisibleLabels = useMemo(
        () => unique([...actualLabels, ...preparedLeads.flatMap(item => extractLeadLabels(item.lead))]),
        [actualLabels, preparedLeads]
    );

    const filterOptions = useMemo(() => ({
        campaigns: unique(preparedLeads.map(item => item.campaign)),
        labels: allVisibleLabels,
        owners: unique(preparedLeads.map(item => item.owner)),
    }), [preparedLeads, allVisibleLabels]);

    useEffect(() => {
        if (campaignFilter !== "all" && !filterOptions.campaigns.includes(campaignFilter)) setCampaignFilter("all");
        if (ownerFilter !== "all" && !filterOptions.owners.includes(ownerFilter)) setOwnerFilter("all");
        setLabelFilters((current) =>
            current.some(label => !filterOptions.labels.includes(label))
                ? current.filter(label => filterOptions.labels.includes(label))
                : current
        );
    }, [campaignFilter, ownerFilter, filterOptions]);

    const visiblePreparedLeads = useMemo(() => {
        return preparedLeads.filter(item => {
            if (campaignFilter !== "all" && item.campaign !== campaignFilter) return false;
            if (labelFilters.length > 0 && !extractLeadLabels(item.lead).some(label => labelFilters.includes(label))) return false;
            if (ownerFilter !== "all" && item.owner !== ownerFilter) return false;
            return true;
        });
    }, [preparedLeads, campaignFilter, labelFilters, ownerFilter]);

    const missingScoreCount = visiblePreparedLeads.filter(item => item.score === null).length;

    const filteredLeads = useMemo(
        () => visiblePreparedLeads.filter((item): item is PreparedLead & { score: number; bucket: ScoreBucket } => {
            if (item.score === null || !item.bucket) return false;
            if (bucketFilter !== "all" && item.bucket !== bucketFilter) return false;
            return true;
        }),
        [visiblePreparedLeads, bucketFilter]
    );

    const scoredLeadCount = filteredLeads.length;

    const isAppointmentLead = (lead: any) => {
        const hasAppointmentLabel = activeAppointmentLabels.length > 0 && lead.resolvedLabels.some((l: string) => activeAppointmentLabels.includes(l));
        const hasSale = lead.resolvedStage === 'sale';
        return hasAppointmentLabel || hasSale;
    };

    const bucketDistribution = BUCKET_ORDER.map(bucket => ({
        bucket,
        name: BUCKET_COPY[bucket].label,
        value: filteredLeads.filter(item => item.bucket === bucket).length,
        fill: BUCKET_COPY[bucket].color
    }));

    const highLeads = filteredLeads.filter(item => item.bucket === "high");
    const lowLeads = filteredLeads.filter(item => item.bucket === "low");
    const highAppointments = highLeads.filter(item => isAppointmentLead(item.lead)).length;

    const averageByChannel = Array.from(
        filteredLeads.reduce((map, item) => {
            const row = map.get(item.channel) || { name: item.channel, total: 0, count: 0 };
            row.total += item.score;
            row.count += 1;
            map.set(item.channel, row);
            return map;
        }, new Map<string, { name: string; total: number; count: number }>())
    ).map(([, row]) => ({
        name: row.name,
        score: Math.round((row.total / row.count) * 10) / 10,
        leads: row.count
    })).sort((a, b) => b.score - a.score || b.leads - a.leads);

    const averageByDimension = Array.from(
        filteredLeads.reduce((map, item) => {
            const keys = scoreDimension === "campaign"
                ? (item.campaign !== "Sin campaña" ? [item.campaign] : [])
                : extractLeadLabels(item.lead).filter(label => scoreVisibleLabels.includes(label)).length > 0
                    ? extractLeadLabels(item.lead).filter(label => scoreVisibleLabels.includes(label))
                    : ["Sin estado actual"];

            keys.forEach((key) => {
                const row = map.get(key) || { name: key, total: 0, count: 0 };
                row.total += item.score;
                row.count += 1;
                map.set(key, row);
            });

            return map;
        }, new Map<string, { name: string; total: number; count: number }>())
    ).map(([, row]) => ({
        name: scoreDimension === "label" ? formatBusinessLabel(row.name) : row.name,
        score: Math.round((row.total / row.count) * 10) / 10,
        leads: row.count
    })).sort((a, b) => b.score - a.score || b.leads - a.leads).slice(0, 8);

    const dimensionCardTitle = scoreDimension === "label"
        ? "Puntaje promedio según estado actual"
        : "Puntaje promedio según campaña";
    const dimensionCardDescription = scoreDimension === "label"
        ? "Muestra el puntaje promedio de los leads que hoy tienen cada estado visible."
        : "Muestra el puntaje promedio de los leads con una campaña asignada.";

    const scoreDomain = useMemo(() => {
        const values = [
            ...filteredLeads.map(item => item.score),
            ...averageByChannel.map(item => item.score),
            ...averageByDimension.map(item => item.score)
        ].filter((value): value is number => Number.isFinite(value));

        if (values.length === 0) return [-5, 25];

        const min = Math.min(...values);
        const max = Math.max(...values);
        const spread = max - min;
        const padding = Math.max(2, Math.ceil((spread || Math.max(Math.abs(max), 10)) * 0.1));

        return [Math.min(0, min - padding), max + padding];
    }, [filteredLeads, averageByChannel, averageByDimension]);

    const conversionByBucket = BUCKET_ORDER.map(bucket => {
        const bucketLeads = filteredLeads.filter(item => item.bucket === bucket);
        const converted = bucketLeads.filter(item => isAppointmentLead(item.lead)).length;

        return {
            bucket,
            name: BUCKET_COPY[bucket].label,
            conversion: percent(converted, bucketLeads.length),
            converted,
            total: bucketLeads.length,
            fill: BUCKET_COPY[bucket].color
        };
    });

    const kpis = {
        averageScore: scoreAverage(filteredLeads),
        highPercentage: percent(highLeads.length, filteredLeads.length),
        highAppointmentConversion: percent(highAppointments, highLeads.length),
        lowPercentage: percent(lowLeads.length, filteredLeads.length)
    };

    const detailRows = [...filteredLeads]
        .sort((a, b) => b.score - a.score || (b.lead.timestamp || 0) - (a.lead.timestamp || 0))
        .slice(0, 10);

    const noScoringAttributeAvailable = scoreAttributeOptions.length === 0;

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold tracking-tight">Calidad de leads</h2>
                <p className="text-sm text-muted-foreground">
                    La calidad del lead se calcula con un campo numérico configurado. El tablero usa la información más actual disponible y la complementa con el historial.
                </p>
            </div>

            <Card>
                {role === 'admin' && (
                    <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
                        <CardHeader className="pb-3">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="space-y-1">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Settings2 className="h-5 w-5 text-primary" />
                                        Configurar puntajes
                                    </CardTitle>
                                    <CardDescription>
                                        Elige el campo numérico oficial del puntaje y define qué estados cuentan como cita para validar la calidad alta.
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
                                        El tablero usa el valor final guardado en ese campo y lo clasifica con los rangos de abajo.
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
                                                        setSettingsDirty(true);
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
                                                        Selecciona los estados que cuentan como cita o avance comercial para medir qué porcentaje de leads de nivel alto ya llegó a ese punto.
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
                                                    <div className="text-sm font-semibold">Rangos para Alta, Media y Baja</div>
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
                                                    <label className="text-sm font-semibold">Desde Alta</label>
                                                    <Input
                                                        type="number"
                                                        inputMode="decimal"
                                                        value={thresholdHighDraft}
                                                        onChange={(event) => {
                                                            setSettingsDirty(true);
                                                            setThresholdHighDraft(event.target.value);
                                                        }}
                                                        placeholder="20"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-semibold">Desde Media</label>
                                                    <Input
                                                        type="number"
                                                        inputMode="decimal"
                                                        value={thresholdMediumDraft}
                                                        onChange={(event) => {
                                                            setSettingsDirty(true);
                                                            setThresholdMediumDraft(event.target.value);
                                                        }}
                                                        placeholder="10"
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
                )}
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Gauge className="h-5 w-5 text-primary" />
                        Filtros de calidad
                    </CardTitle>
                    <CardDescription>
                        Fecha y canal se controlan arriba. Aquí refinamos campaña, estado, responsable y nivel.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <FilterSelect label="Campaña" value={campaignFilter} onChange={setCampaignFilter} options={filterOptions.campaigns} />
                        <MultiFilterSelect label="Estado" values={labelFilters} onChange={setLabelFilters} options={filterOptions.labels} optionLabel={formatBusinessLabel} />
                        <FilterSelect label="Responsable" value={ownerFilter} onChange={setOwnerFilter} options={filterOptions.owners} />
                        <FilterSelect
                            label="Nivel"
                            value={bucketFilter}
                            onChange={setBucketFilter}
                            options={BUCKET_ORDER}
                            optionLabel={(value) => BUCKET_COPY[value as ScoreBucket]?.label || value}
                        />
                    </div>
                </CardContent>
            </Card>

            {noScoringAttributeAvailable ? null : (
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <KPICard
                            icon={Gauge}
                            title="Puntaje promedio"
                            value={`${kpis.averageScore}`}
                            subtitle={`${scoredLeadCount} leads con puntaje - ${missingScoreCount} sin puntaje`}
                            variant="primary"
                        />
                        <KPICard
                            icon={BadgeCheck}
                            title="% leads de alta calidad"
                            value={`${kpis.highPercentage}%`}
                            subtitle={`${highLeads.length} leads en nivel alto`}
                            variant="success"
                        />
                        <KPICard
                            icon={TrendingUp}
                            title="Leads altos que llegan a cita"
                            value={`${kpis.highAppointmentConversion}%`}
                            subtitle={activeAppointmentLabels.length === 0
                                ? "Primero configura qué estados cuentan como cita."
                                : `${highAppointments} de ${highLeads.length} leads altos ya llegaron a cita`}
                            variant="success"
                        />
                        <KPICard
                            icon={Activity}
                            title="% leads de baja calidad"
                            value={`${kpis.lowPercentage}%`}
                            subtitle={`${lowLeads.length} leads en nivel bajo`}
                            variant="destructive"
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        <ChartCard title="Distribución por nivel de puntaje" description="Reparte los leads con puntaje entre baja, media y alta calidad.">
                            {filteredLeads.length === 0 ? (
                                <EmptyState text={missingScoreCount > 0 ? "Los leads visibles no tienen puntaje en el campo seleccionado." : "No hay leads con estos filtros."} />
                            ) : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={bucketDistribution} margin={{ top: 20, right: 24, left: 0, bottom: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.12} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                        <YAxis allowDecimals={false} />
                                        <Tooltip cursor={{ fill: "transparent" }} formatter={(value: number) => [`${value} leads`, "Nivel"]} />
                                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                            {bucketDistribution.map(row => <Cell key={row.bucket} fill={row.fill} />)}
                                            <LabelList dataKey="value" position="top" style={{ fontWeight: 700 }} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        <ChartCard title="Puntaje promedio por canal" description="Compara qué red social trae mejor calidad promedio.">
                            {averageByChannel.length === 0 ? (
                                <EmptyState text="No hay canales con puntaje para mostrar." />
                            ) : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={averageByChannel.slice(0, 8)} layout="vertical" margin={{ top: 12, right: 30, left: 28, bottom: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} strokeOpacity={0.12} />
                                        <XAxis type="number" domain={scoreDomain} />
                                        <YAxis dataKey="name" type="category" width={108} axisLine={false} tickLine={false} />
                                        <Tooltip formatter={(value: number, _name: string, item: any) => [`${value}`, `${item?.payload?.leads || 0} leads`]} />
                                        <Bar dataKey="score" fill="#243d90" radius={[0, 6, 6, 0]}>
                                            <LabelList dataKey="score" position="right" style={{ fontWeight: 700 }} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        <ChartCard
                            title={dimensionCardTitle}
                            description={dimensionCardDescription}
                            action={(
                                <Select value={scoreDimension} onValueChange={(value: ScoreDimension) => setScoreDimension(value)}>
                                    <SelectTrigger className="h-8 w-[132px] text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="label">Estado actual</SelectItem>
                                        <SelectItem value="campaign">Campaña</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        >
                            {averageByDimension.length === 0 ? (
                                <EmptyState text={scoreDimension === "campaign"
                                    ? "No hay leads con puntaje y con campaña para esta vista."
                                    : "No hay leads con puntaje para esta vista y estos filtros."} />
                            ) : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={averageByDimension} layout="vertical" margin={{ top: 12, right: 30, left: 48, bottom: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} strokeOpacity={0.12} />
                                        <XAxis type="number" domain={scoreDomain} />
                                        <YAxis dataKey="name" type="category" width={128} axisLine={false} tickLine={false} />
                                        <Tooltip formatter={(value: number, _name: string, item: any) => [`${value}`, `${item?.payload?.leads || 0} leads`]} />
                                        <Bar dataKey="score" fill="#0f9d76" radius={[0, 6, 6, 0]}>
                                            <LabelList dataKey="score" position="right" style={{ fontWeight: 700 }} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        <ChartCard
                            title="Leads con cita según nivel de puntaje"
                            description="Muestra qué porcentaje de leads con puntaje alto, medio o bajo ya llegó a los estados de cita configurados."
                        >
                            {activeAppointmentLabels.length === 0 ? (
                                <EmptyState text="Primero configura qué estados cuentan como cita." />
                            ) : filteredLeads.length === 0 ? (
                                <EmptyState text="No hay leads con puntaje para esta vista y estos filtros." />
                            ) : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={conversionByBucket} margin={{ top: 20, right: 24, left: 0, bottom: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.12} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                        <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                                        <Tooltip formatter={(value: number, _name: string, item: any) => [`${value}%`, `${item?.payload?.converted || 0} de ${item?.payload?.total || 0}`]} />
                                        <Bar dataKey="conversion" radius={[6, 6, 0, 0]}>
                                            {conversionByBucket.map(row => <Cell key={row.bucket} fill={row.fill} />)}
                                            <LabelList dataKey="conversion" position="top" formatter={(value: number) => `${value}%`} style={{ fontWeight: 700 }} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Target className="h-5 w-5 text-primary" />
                                Leads evaluados
                            </CardTitle>
                            <CardDescription>
                                Top 10 por puntaje dentro de los filtros seleccionados. El puntaje sale de {selectedScoreAttribute?.label || formatFieldLabel(activeScoreAttributeKey) || "ningún campo"}.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto rounded-xl border">
                                <table className="w-full min-w-[820px] text-left text-sm">
                                    <thead className="border-b bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                                        <tr>
                                            <th className="px-4 py-3">Lead</th>
                                            <th className="px-4 py-3">Nivel</th>
                                            <th className="px-4 py-3">Puntaje</th>
                                            <th className="px-4 py-3">Canal</th>
                                            <th className="px-4 py-3">Campaña</th>
                                            <th className="px-4 py-3">Campo usado</th>
                                            <th className="px-4 py-3">Fecha</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {detailRows.length === 0 ? (
                                            <tr>
                                                <td className="px-4 py-12 text-center text-muted-foreground" colSpan={7}>
                                                    No hay leads con puntaje para mostrar.
                                                </td>
                                            </tr>
                                        ) : (
                                            detailRows.map(item => (
                                                <tr key={item.lead.id} className="hover:bg-muted/20">
                                                    <td className="px-4 py-3">
                                                        <div className="font-semibold">{getLeadName(item.lead)}</div>
                                                        <div className="text-[10px] text-muted-foreground">
                                                            ID {item.lead.id} - {getLeadPhone(item.lead, item.channel) || "Sin número"}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <Badge variant="outline" className={BUCKET_COPY[item.bucket].bg}>{item.bucketLabel}</Badge>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-bold">{item.score}</div>
                                                        <div className="text-[10px] text-muted-foreground">
                                                            {item.bucket === "high" ? "Alta calidad" : item.bucket === "medium" ? "Calidad media" : "Baja calidad"}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium">{item.channel}</div>
                                                    </td>
                                                    <td className="px-4 py-3">{item.campaign}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium">{item.attributeLabel}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(item.lead.created_at || item.lead.timestamp)}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
};

const FilterSelect = ({
    label,
    value,
    onChange,
    options,
    optionLabel
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: string[];
    optionLabel?: (value: string) => string;
}) => (
    <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground">{label}</label>
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="h-9">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {options.map(option => (
                    <SelectItem key={option} value={option}>{optionLabel ? optionLabel(option) : option}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    </div>
);

const MultiFilterSelect = ({
    label,
    values,
    onChange,
    options,
    optionLabel
}: {
    label: string;
    values: string[];
    onChange: (values: string[]) => void;
    options: string[];
    optionLabel?: (value: string) => string;
}) => {
    const [open, setOpen] = useState(false);

    const toggleValue = (option: string) => {
        onChange(
            values.includes(option)
                ? values.filter(value => value !== option)
                : unique([...values, option])
        );
    };

    const summary = values.length === 0
        ? "Todos"
        : values.length === 1
            ? (optionLabel ? optionLabel(values[0]) : values[0])
            : `${values.length} seleccionados`;

    return (
        <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">{label}</label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={open} className="h-9 w-full justify-between font-normal">
                        <span className="truncate">{summary}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-0" align="start">
                    <Command>
                        <CommandInput placeholder={`Buscar ${label.toLowerCase()}...`} />
                        <CommandList>
                            <CommandEmpty>No se encontraron opciones.</CommandEmpty>
                            <CommandGroup>
                                <CommandItem value="__all__" onSelect={() => onChange([])}>
                                    <Checkbox checked={values.length === 0} className="pointer-events-none mr-2" />
                                    <span>Todos</span>
                                </CommandItem>
                                {options.map((option) => {
                                    const checked = values.includes(option);
                                    const display = optionLabel ? optionLabel(option) : option;

                                    return (
                                        <CommandItem
                                            key={option}
                                            value={`${display} ${option}`}
                                            onSelect={() => toggleValue(option)}
                                        >
                                            <Checkbox checked={checked} className="pointer-events-none mr-2" />
                                            <span className={cn("truncate", checked && "font-medium")}>{display}</span>
                                            {checked ? <Check className="ml-auto h-4 w-4 text-primary" /> : null}
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
};



const ChartCard = ({ title, description, children, action }: any) => (
    <Card>
        <CardHeader>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <CardTitle className="text-base">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </div>
                {action}
            </div>
        </CardHeader>
        <CardContent>{children}</CardContent>
    </Card>
);

export default LeadScoringLayer;
