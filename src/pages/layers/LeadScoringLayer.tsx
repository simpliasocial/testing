import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useDashboardContext } from "@/context/DashboardDataContext";
import {
    formatDateTime,
    getAttrs,
    getLeadChannelName,
    getLeadInboxName,
    getLeadName,
    getLeadPhone,
    normalize
} from "@/lib/leadDisplay";
import { MinifiedConversation } from "@/services/StorageService";
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
    ChevronDown,
    Gauge,
    Info,
    Loader2,
    Target,
    TrendingUp
} from "lucide-react";

type ScoreBucket = "high" | "medium" | "low";
type ScoreDimension = "label" | "campaign";

interface ScoredLead {
    lead: MinifiedConversation;
    score: number;
    scoreInteres: number | null;
    scoreSource: "score_interes" | "label_fallback";
    bucket: ScoreBucket;
    bucketLabel: string;
    reason: string;
    stage: string;
    channel: string;
    campaign: string;
    owner: string;
    status: string;
}

interface ScoreLabelRules {
    high: string[];
    medium: string[];
    low: string[];
}

const SCORE_VERSION = "label-config-v1 / Abril 2026";
const BUCKET_ORDER: ScoreBucket[] = ["high", "medium", "low"];
const BUCKET_COPY: Record<ScoreBucket, { label: string; color: string; bg: string }> = {
    high: { label: "High", color: "#059669", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    medium: { label: "Medium", color: "#d97706", bg: "bg-amber-50 text-amber-700 border-amber-200" },
    low: { label: "Low", color: "#dc2626", bg: "bg-red-50 text-red-700 border-red-200" }
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

const scoreAverage = (items: ScoredLead[]) =>
    items.length > 0 ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length) : 0;

const percent = (count: number, total: number) =>
    total > 0 ? Math.round((count / total) * 100) : 0;

const labelsIncludeAny = (lead: MinifiedConversation, labels: string[]) =>
    (lead.labels || []).some(label => labels.includes(label));

const parseScoreInteres = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(String(value).replace(",", "."));
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.min(100, Math.round(parsed)));
};

const rangeBucketFromScore = (score: number): ScoreBucket => {
    if (score >= 70) return "high";
    if (score >= 40) return "medium";
    return "low";
};

const EmptyState = ({ text }: { text: string }) => (
    <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
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
        loading
    } = useDashboardContext();

    const [campaignFilter, setCampaignFilter] = useState("all");
    const [labelFilter, setLabelFilter] = useState("all");
    const [ownerFilter, setOwnerFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [stageFilter, setStageFilter] = useState("all");
    const [bucketFilter, setBucketFilter] = useState("all");
    const [scoreDimension, setScoreDimension] = useState<ScoreDimension>("label");
    const [labelRules, setLabelRules] = useState<ScoreLabelRules | null>(null);
    const [rulesDirty, setRulesDirty] = useState(false);

    const inboxMap = useMemo(
        () => new Map(inboxes.map((inbox: any) => [Number(inbox.id), inbox])),
        [inboxes]
    );

    const actualLabels = useMemo(
        () => unique((configuredLabels || []).filter(label => typeof label === "string")),
        [configuredLabels]
    );

    const filterActualLabels = (labels: string[]) => {
        const actualSet = new Set(actualLabels);
        return unique(labels.filter(label => actualSet.has(label)));
    };

    const suggestedRules = useMemo<ScoreLabelRules>(() => ({
        high: filterActualLabels([...(tagSettings.saleTags || []), ...(tagSettings.appointmentTags || []), "venta_exitosa", "cita_agendada_humano", "cita_agendada"]),
        medium: filterActualLabels([...(tagSettings.sqlTags || []), "seguimiento_humano", "interesado", "crear_confianza", "crear_urgencia"]),
        low: filterActualLabels([...(tagSettings.unqualifiedTags || []), "desinteresado"])
    }), [tagSettings, actualLabels]);

    const configuredScoreRules = useMemo<ScoreLabelRules | null>(() => {
        const high = filterActualLabels(tagSettings.scoreHighTags || []);
        const medium = filterActualLabels(tagSettings.scoreMediumTags || []);
        const low = filterActualLabels(tagSettings.scoreLowTags || []);

        return high.length || medium.length || low.length ? { high, medium, low } : null;
    }, [tagSettings.scoreHighTags, tagSettings.scoreMediumTags, tagSettings.scoreLowTags, actualLabels]);

    useEffect(() => {
        if (!rulesDirty) {
            setLabelRules(configuredScoreRules || suggestedRules);
        }
    }, [configuredScoreRules, suggestedRules, rulesDirty]);

    const effectiveRules = labelRules || configuredScoreRules || suggestedRules;

    const availableLabels = actualLabels;

    const toggleRuleTag = (bucket: ScoreBucket, label: string) => {
        setRulesDirty(true);
        setLabelRules((current) => {
            const base = current || effectiveRules;
            const wasSelected = base[bucket].includes(label);
            const next: ScoreLabelRules = {
                high: base.high.filter(item => item !== label),
                medium: base.medium.filter(item => item !== label),
                low: base.low.filter(item => item !== label)
            };

            if (!wasSelected) {
                next[bucket] = unique([...next[bucket], label]);
            }

            return next;
        });
    };

    const saveRules = () => {
        updateTagSettings({
            ...tagSettings,
            scoreHighTags: filterActualLabels(effectiveRules.high),
            scoreMediumTags: filterActualLabels(effectiveRules.medium),
            scoreLowTags: filterActualLabels(effectiveRules.low)
        });
        setRulesDirty(false);
    };

    const restoreSuggestedRules = () => {
        setLabelRules(suggestedRules);
        setRulesDirty(true);
    };

    const scoredLeads = useMemo<ScoredLead[]>(() => {
        const start = globalFilters.startDate ? new Date(globalFilters.startDate) : new Date(2024, 0, 1);
        start.setHours(0, 0, 0, 0);
        const end = globalFilters.endDate ? new Date(globalFilters.endDate) : new Date(2030, 0, 1);
        end.setHours(23, 59, 59, 999);
        const selectedInboxes = globalFilters.selectedInboxes || [];

        return conversations
            .filter((lead) => {
                if (selectedInboxes.length > 0 && !selectedInboxes.includes(Number(lead.inbox_id))) return false;
                const createdAt = parseDate(lead.created_at || lead.timestamp);
                return createdAt >= start && createdAt <= end;
            })
            .map((lead) => {
                const inbox = lead.inbox_id ? inboxMap.get(Number(lead.inbox_id)) : null;
                const attrs = getAttrs(lead);
                const channel = getLeadChannelName(lead, inbox);
                const campaign = String(attrs.campana || "").trim() || "Sin campana";
                const owner = String(attrs.responsable || lead.meta?.assignee?.name || "").trim() || "Sin responsable";
                const status = String(lead.status || "Sin estado");
                const scoreInteres = parseScoreInteres(attrs.score_interes);

                let score = scoreInteres ?? 35;
                let scoreSource: "score_interes" | "label_fallback" = scoreInteres === null ? "label_fallback" : "score_interes";
                let bucket: ScoreBucket = "low";
                let reason = "Sin regla activa";
                let stage = "Sin etapa";

                if (labelsIncludeAny(lead, effectiveRules.high)) {
                    score = scoreInteres ?? 90;
                    bucket = "high";
                    reason = "Etiqueta configurada como High";
                    stage = labelsIncludeAny(lead, tagSettings.saleTags || []) || (lead.labels || []).includes("venta_exitosa") ? "Venta" : "Cita";
                } else if (labelsIncludeAny(lead, effectiveRules.medium)) {
                    score = scoreInteres ?? 60;
                    bucket = "medium";
                    reason = "Etiqueta configurada como Medium";
                    stage = (lead.labels || []).includes("seguimiento_humano") ? "Seguimiento humano" : "SQL";
                } else if (labelsIncludeAny(lead, effectiveRules.low)) {
                    score = scoreInteres ?? 20;
                    bucket = "low";
                    reason = "Etiqueta configurada como Low";
                    stage = "Descalificado";
                } else if (scoreInteres !== null) {
                    bucket = rangeBucketFromScore(scoreInteres);
                    reason = "Fallback por score_interes";
                    stage = "Score interes";
                }

                return {
                    lead,
                    score,
                    scoreInteres,
                    scoreSource,
                    bucket,
                    bucketLabel: BUCKET_COPY[bucket].label,
                    reason,
                    stage,
                    channel,
                    campaign,
                    owner,
                    status
                };
            });
    }, [conversations, globalFilters.startDate, globalFilters.endDate, globalFilters.selectedInboxes, inboxMap, effectiveRules, tagSettings.saleTags]);

    const filterOptions = useMemo(() => ({
        campaigns: unique(conversations.map(lead => String(getAttrs(lead).campana || "").trim() || "Sin campana")),
        labels: availableLabels,
        owners: unique(conversations.map(lead => {
            const attrs = getAttrs(lead);
            return String(attrs.responsable || lead.meta?.assignee?.name || "").trim() || "Sin responsable";
        })),
        statuses: unique(conversations.map(lead => String(lead.status || "Sin estado"))),
        stages: unique(scoredLeads.map(item => item.stage))
    }), [conversations, scoredLeads, availableLabels]);

    const filteredLeads = useMemo(() => {
        return scoredLeads.filter(item => {
            if (campaignFilter !== "all" && item.campaign !== campaignFilter) return false;
            if (labelFilter !== "all" && !(item.lead.labels || []).includes(labelFilter)) return false;
            if (ownerFilter !== "all" && item.owner !== ownerFilter) return false;
            if (statusFilter !== "all" && item.status !== statusFilter) return false;
            if (stageFilter !== "all" && item.stage !== stageFilter) return false;
            if (bucketFilter !== "all" && item.bucket !== bucketFilter) return false;
            return true;
        });
    }, [scoredLeads, campaignFilter, labelFilter, ownerFilter, statusFilter, stageFilter, bucketFilter]);

    const bucketDistribution = BUCKET_ORDER.map(bucket => ({
        bucket,
        name: BUCKET_COPY[bucket].label,
        value: filteredLeads.filter(item => item.bucket === bucket).length,
        fill: BUCKET_COPY[bucket].color
    }));

    const isAppointmentOrSale = (item: ScoredLead) =>
        labelsIncludeAny(item.lead, tagSettings.appointmentTags || []) ||
        labelsIncludeAny(item.lead, tagSettings.saleTags || []) ||
        (item.lead.labels || []).includes("venta_exitosa") ||
        (item.lead.labels || []).includes("venta") ||
        (item.lead.labels || []).includes("cita") ||
        (item.lead.labels || []).includes("cita_agendada") ||
        (item.lead.labels || []).includes("cita_agendada_humano");

    const highLeads = filteredLeads.filter(item => item.bucket === "high");
    const lowLeads = filteredLeads.filter(item => item.bucket === "low");
    const scoreInteresCount = filteredLeads.filter(item => item.scoreInteres !== null).length;
    const highAppointments = highLeads.filter(isAppointmentOrSale).length;

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
        score: Math.round(row.total / row.count),
        leads: row.count
    })).sort((a, b) => b.score - a.score || b.leads - a.leads);

    const averageByDimension = Array.from(
        filteredLeads.reduce((map, item) => {
            const keys = scoreDimension === "campaign"
                ? [item.campaign]
                : (item.lead.labels || []).filter(label => actualLabels.includes(label)).length > 0
                    ? (item.lead.labels || []).filter(label => actualLabels.includes(label))
                    : ["Sin etiqueta"];

            keys.forEach(key => {
                const row = map.get(key) || { name: key, total: 0, count: 0 };
                row.total += item.score;
                row.count += 1;
                map.set(key, row);
            });

            return map;
        }, new Map<string, { name: string; total: number; count: number }>())
    ).map(([, row]) => ({
        name: row.name,
        score: Math.round(row.total / row.count),
        leads: row.count
    })).sort((a, b) => b.score - a.score || b.leads - a.leads).slice(0, 8);

    const conversionByBucket = BUCKET_ORDER.map(bucket => {
        const bucketLeads = filteredLeads.filter(item => item.bucket === bucket);
        const converted = bucketLeads.filter(isAppointmentOrSale).length;

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

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold tracking-tight">Lead Scoring</h2>
                <p className="text-sm text-muted-foreground">
                    Calidad de leads por bucket High, Medium y Low usando etiquetas reales de Chatwoot y score_interes cuando existe. La data viene del flujo hibrido: hoy/ayer API y el resto Supabase.
                </p>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Gauge className="h-5 w-5 text-primary" />
                        Filtros de scoring
                    </CardTitle>
                    <CardDescription>
                        Fecha y canal se controlan arriba; estos filtros refinan campana, etiqueta, responsable, estado, etapa y bucket.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                        <FilterSelect label="Campana" value={campaignFilter} onChange={setCampaignFilter} options={filterOptions.campaigns} />
                        <FilterSelect label="Etiqueta" value={labelFilter} onChange={setLabelFilter} options={filterOptions.labels} />
                        <FilterSelect label="Responsable" value={ownerFilter} onChange={setOwnerFilter} options={filterOptions.owners} />
                        <FilterSelect label="Estado" value={statusFilter} onChange={setStatusFilter} options={filterOptions.statuses} />
                        <FilterSelect label="Etapa" value={stageFilter} onChange={setStageFilter} options={filterOptions.stages} />
                        <FilterSelect
                            label="Bucket"
                            value={bucketFilter}
                            onChange={setBucketFilter}
                            options={BUCKET_ORDER}
                            optionLabel={(value) => BUCKET_COPY[value as ScoreBucket]?.label || value}
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard icon={Gauge} title="Lead score promedio" value={`${kpis.averageScore}`} description={`${filteredLeads.length} leads evaluados - ${scoreInteresCount} con score_interes`} />
                <KpiCard icon={BadgeCheck} title="% high quality" value={`${kpis.highPercentage}%`} description={`${highLeads.length} leads high`} />
                <KpiCard icon={TrendingUp} title="Citas de high quality" value={`${kpis.highAppointmentConversion}%`} description={`${highAppointments} de ${highLeads.length} high llegan a cita/venta`} />
                <KpiCard icon={Activity} title="% low quality" value={`${kpis.lowPercentage}%`} description={`${lowLeads.length} leads low`} />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <ChartCard title="Distribucion por bucket" description="Reparte los leads entre Low, Medium y High quality.">
                    {filteredLeads.length === 0 ? (
                        <EmptyState text="No hay leads con estos filtros." />
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={bucketDistribution} margin={{ top: 20, right: 24, left: 0, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.12} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                <YAxis allowDecimals={false} />
                                <Tooltip cursor={{ fill: "transparent" }} formatter={(value: number) => [`${value} leads`, "Bucket"]} />
                                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                    {bucketDistribution.map(row => <Cell key={row.bucket} fill={row.fill} />)}
                                    <LabelList dataKey="value" position="top" style={{ fontWeight: 700 }} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>

                <ChartCard title="Score promedio por canal" description="Compara que canal trae mejor calidad promedio.">
                    {averageByChannel.length === 0 ? (
                        <EmptyState text="No hay canales para mostrar." />
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={averageByChannel.slice(0, 8)} layout="vertical" margin={{ top: 12, right: 30, left: 28, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} strokeOpacity={0.12} />
                                <XAxis type="number" domain={[0, 100]} />
                                <YAxis dataKey="name" type="category" width={108} axisLine={false} tickLine={false} />
                                <Tooltip formatter={(value: number, name: string, item: any) => [`${value}/100`, `${item?.payload?.leads || 0} leads`]} />
                                <Bar dataKey="score" fill="#243d90" radius={[0, 6, 6, 0]}>
                                    <LabelList dataKey="score" position="right" style={{ fontWeight: 700 }} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>

                <ChartCard
                    title={scoreDimension === "label" ? "Score promedio por etiqueta" : "Score promedio por campana"}
                    description="Detecta etiquetas o campanas con leads mas valiosos."
                    action={(
                        <Select value={scoreDimension} onValueChange={(value: ScoreDimension) => setScoreDimension(value)}>
                            <SelectTrigger className="h-8 w-[132px] text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="label">Etiqueta</SelectItem>
                                <SelectItem value="campaign">Campana</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                >
                    {averageByDimension.length === 0 ? (
                        <EmptyState text="No hay datos para esta dimension." />
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={averageByDimension} layout="vertical" margin={{ top: 12, right: 30, left: 48, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} strokeOpacity={0.12} />
                                <XAxis type="number" domain={[0, 100]} />
                                <YAxis dataKey="name" type="category" width={128} axisLine={false} tickLine={false} />
                                <Tooltip formatter={(value: number, name: string, item: any) => [`${value}/100`, `${item?.payload?.leads || 0} leads`]} />
                                <Bar dataKey="score" fill="#7c3aed" radius={[0, 6, 6, 0]}>
                                    <LabelList dataKey="score" position="right" style={{ fontWeight: 700 }} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>

                <ChartCard title="Conversion a cita por bucket" description="Valida si el scoring predice avance comercial.">
                    {filteredLeads.length === 0 ? (
                        <EmptyState text="No hay conversiones para mostrar." />
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={conversionByBucket} margin={{ top: 20, right: 24, left: 0, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.12} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                                <Tooltip formatter={(value: number, name: string, item: any) => [`${value}%`, `${item?.payload?.converted || 0} de ${item?.payload?.total || 0}`]} />
                                <Bar dataKey="conversion" radius={[6, 6, 0, 0]}>
                                    {conversionByBucket.map(row => <Cell key={row.bucket} fill={row.fill} />)}
                                    <LabelList dataKey="conversion" position="top" formatter={(value: number) => `${value}%`} style={{ fontWeight: 700 }} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Card className="xl:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Info className="h-5 w-5 text-primary" />
                            Reglas activas
                        </CardTitle>
                        <CardDescription>
                            Selecciona que etiquetas caen en High, Medium o Low. Version {SCORE_VERSION}.
                            {rulesDirty ? " Hay cambios sin guardar." : ""}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                            Solo se muestran etiquetas existentes en Chatwoot. Si una etiqueta no esta configurada y el lead tiene score_interes, se usa fallback por rango: High 70-100, Medium 40-69, Low 0-39.
                        </div>
                        <RuleConfigBucket bucket="high" labels={availableLabels} selected={effectiveRules.high} onToggle={toggleRuleTag} />
                        <RuleConfigBucket bucket="medium" labels={availableLabels} selected={effectiveRules.medium} onToggle={toggleRuleTag} />
                        <RuleConfigBucket bucket="low" labels={availableLabels} selected={effectiveRules.low} onToggle={toggleRuleTag} />
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <Button variant="outline" size="sm" onClick={restoreSuggestedRules}>
                                Restaurar sugeridas
                            </Button>
                            <Button size="sm" onClick={saveRules}>
                                Guardar reglas
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className="xl:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Target className="h-5 w-5 text-primary" />
                            Leads evaluados
                        </CardTitle>
                        <CardDescription>Top 10 por score dentro de los filtros seleccionados.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto rounded-xl border">
                            <table className="w-full min-w-[780px] text-left text-sm">
                                <thead className="border-b bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                                    <tr>
                                        <th className="px-4 py-3">Lead</th>
                                        <th className="px-4 py-3">Bucket</th>
                                        <th className="px-4 py-3">Score</th>
                                        <th className="px-4 py-3">Canal</th>
                                        <th className="px-4 py-3">Campana</th>
                                        <th className="px-4 py-3">Motivo</th>
                                        <th className="px-4 py-3">Fecha</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {detailRows.length === 0 ? (
                                        <tr>
                                            <td className="px-4 py-12 text-center text-muted-foreground" colSpan={7}>
                                                No hay leads para mostrar.
                                            </td>
                                        </tr>
                                    ) : (
                                        detailRows.map(item => (
                                            <tr key={item.lead.id} className="hover:bg-muted/20">
                                                <td className="px-4 py-3">
                                                    <div className="font-semibold">{getLeadName(item.lead)}</div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        ID {item.lead.id} - {getLeadPhone(item.lead, item.channel) || "Sin numero"}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Badge variant="outline" className={BUCKET_COPY[item.bucket].bg}>{item.bucketLabel}</Badge>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-bold">{item.score}</div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {item.scoreSource === "score_interes" ? "score_interes" : "fallback etiqueta"}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium">{item.channel}</div>
                                                    <div className="text-[10px] text-muted-foreground">{getLeadInboxName(item.lead, inboxMap.get(Number(item.lead.inbox_id)))}</div>
                                                </td>
                                                <td className="px-4 py-3">{item.campaign}</td>
                                                <td className="px-4 py-3">{item.reason}</td>
                                                <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(item.lead.created_at || item.lead.timestamp)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
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

const KpiCard = ({ icon: Icon, title, value, description }: any) => (
    <Card>
        <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Icon className="h-4 w-4 text-primary" />
                {title}
            </div>
            <p className="text-3xl font-bold">{value}</p>
            <p className="mt-2 text-xs text-muted-foreground">{description}</p>
        </CardContent>
    </Card>
);

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

const RuleConfigBucket = ({
    bucket,
    labels,
    selected,
    onToggle
}: {
    bucket: ScoreBucket;
    labels: string[];
    selected: string[];
    onToggle: (bucket: ScoreBucket, label: string) => void;
}) => (
    <Collapsible className="rounded-lg border">
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 p-3 text-left">
            <div className="flex min-w-0 items-center gap-2">
                <Badge variant="outline" className={BUCKET_COPY[bucket].bg}>{BUCKET_COPY[bucket].label}</Badge>
                <span className="truncate text-xs text-muted-foreground">
                    {selected.length > 0 ? selected.slice(0, 2).join(", ") : "Sin etiquetas"}
                    {selected.length > 2 ? ` +${selected.length - 2}` : ""}
                </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">{selected.length}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
            <div className="border-t bg-muted/10 p-3">
                <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                    {labels.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">No se detectaron etiquetas.</p>
                    ) : (
                        labels.map(label => (
                            <label key={`${bucket}-${label}`} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-background">
                                <Checkbox
                                    checked={selected.includes(label)}
                                    onCheckedChange={() => onToggle(bucket, label)}
                                />
                                <span className="truncate text-xs font-medium">{label}</span>
                            </label>
                        ))
                    )}
                </div>
            </div>
        </CollapsibleContent>
    </Collapsible>
);

export default LeadScoringLayer;
