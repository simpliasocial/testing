import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardContext } from "@/context/DashboardDataContext";
import { useDashboardData } from "@/hooks/useDashboardData";
import { CalendarCheck2, ArrowRightLeft, DollarSign, Loader2, TrendingUp } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { getGuayaquilDateString } from "@/lib/guayaquilTime";
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

const formatCurrency = (value: number) =>
    new Intl.NumberFormat("es-US", { style: "currency", currency: "USD" }).format(value || 0);

const modeCopy: Record<string, { label: string; description: string }> = {
    exact: {
        label: "Exacto",
        description: "Medido con eventos reales de cambio de etiqueta."
    },
    mixed: {
        label: "Mixto",
        description: "Combina eventos reales nuevos con estimacion historica anterior al tracking."
    },
    estimated_legacy: {
        label: "Estimado historico",
        description: "No existia historial de cambios para este rango; se estima con etiquetas actuales."
    }
};

const parseTs = (ts: any): Date => {
    if (!ts) return new Date(0);
    const numeric = Number(ts);
    if (Number.isNaN(numeric)) return new Date(ts);
    return new Date(numeric < 10000000000 ? numeric * 1000 : numeric);
};

const getCreatedDate = (conv: any): Date => parseTs(conv.created_at || conv.timestamp);

const labelsInclude = (conv: any, label: string) => Array.isArray(conv?.labels) && conv.labels.includes(label);

const PerformanceLayer = () => {
    const { globalFilters, tagSettings, labels, conversations, labelEvents } = useDashboardContext();
    const { loading, error, data } = useDashboardData({
        ...globalFilters,
        ...tagSettings
    });

    const humanFollowupQueueTags = tagSettings.humanFollowupQueueTags || ['seguimiento_humano'];
    const humanAppointmentTargetLabel = tagSettings.humanAppointmentTargetLabel || 'cita_agendada_humano';
    const humanSaleTargetLabel = tagSettings.humanSaleTargetLabel || 'venta_exitosa';
    const defaultFromLabel = humanFollowupQueueTags[0] || "seguimiento_humano";
    const defaultToLabel = humanAppointmentTargetLabel || "cita_agendada_humano";
    const [transitionFromLabel, setTransitionFromLabel] = useState(defaultFromLabel);
    const [transitionToLabel, setTransitionToLabel] = useState(defaultToLabel);

    useEffect(() => {
        setTransitionFromLabel(defaultFromLabel);
    }, [defaultFromLabel]);

    useEffect(() => {
        setTransitionToLabel(defaultToLabel);
    }, [defaultToLabel]);

    const availableHumanTransitionLabels = useMemo(() => {
        const merged = Array.from(
            new Set(
                [
                    ...labels,
                    ...humanFollowupQueueTags,
                    humanAppointmentTargetLabel
                ]
                    .map((label) => String(label || "").trim())
                    .filter(Boolean)
            )
        );
        return merged.sort((a, b) => a.localeCompare(b));
    }, [humanAppointmentTargetLabel, humanFollowupQueueTags, labels]);

    const humanAppointmentMetrics = useMemo(() => {
        let globalStart: Date;
        let globalEnd: Date;

        if (globalFilters.startDate && globalFilters.endDate) {
            globalStart = new Date(globalFilters.startDate);
            globalStart.setHours(0, 0, 0, 0);
            globalEnd = new Date(globalFilters.endDate);
            globalEnd.setHours(23, 59, 59, 999);
        } else if (globalFilters.startDate) {
            globalStart = new Date(globalFilters.startDate);
            globalStart.setHours(0, 0, 0, 0);
            globalEnd = new Date();
            globalEnd.setHours(23, 59, 59, 999);
        } else {
            globalStart = new Date(2024, 0, 1);
            globalEnd = new Date(2030, 0, 1);
        }

        const selectedInboxes = globalFilters.selectedInboxes || [];
        const conversationById = new Map(conversations.map((conv) => [Number(conv.id), conv]));
        const filteredConversations = conversations.filter((conv) => {
            if (selectedInboxes.length > 0 && !selectedInboxes.includes(Number(conv.inbox_id))) return false;
            const createdAt = getCreatedDate(conv);
            return !Number.isNaN(createdAt.getTime()) && createdAt >= globalStart && createdAt <= globalEnd;
        });

        const followupCurrent = filteredConversations.filter((conv) => labelsInclude(conv, transitionFromLabel)).length;

        const sortedLabelEvents = [...(labelEvents || [])].sort(
            (a: any, b: any) => parseTs(a.occurred_at).getTime() - parseTs(b.occurred_at).getTime()
        );
        const trackingStartedAt = sortedLabelEvents[0]?.occurred_at || null;
        const trackingStartDate = trackingStartedAt ? parseTs(trackingStartedAt) : null;
        const humanAppointmentMode: "exact" | "mixed" | "estimated_legacy" = !trackingStartDate
            ? "estimated_legacy"
            : globalStart < trackingStartDate && globalEnd >= trackingStartDate
                ? "mixed"
                : globalEnd < trackingStartDate
                    ? "estimated_legacy"
                    : "exact";

        const filteredLabelEvents = sortedLabelEvents.filter((event: any) => {
            const eventDate = parseTs(event.occurred_at);
            if (Number.isNaN(eventDate.getTime()) || eventDate < globalStart || eventDate > globalEnd) return false;

            if (selectedInboxes.length > 0) {
                const eventConversation = conversationById.get(Number(event.chatwoot_conversation_id));
                if (!eventConversation || !selectedInboxes.includes(Number(eventConversation.inbox_id))) return false;
            }

            return true;
        });

        const exactHumanAppointmentIds = new Set<number>();
        filteredLabelEvents.forEach((event: any) => {
            const added = Array.isArray(event.added_labels) ? event.added_labels : [];
            const removed = Array.isArray(event.removed_labels) ? event.removed_labels : [];
            if (added.includes(transitionToLabel) && removed.includes(transitionFromLabel)) {
                exactHumanAppointmentIds.add(Number(event.chatwoot_conversation_id));
            }
        });

        const legacyHumanAppointments = filteredConversations.filter((conv) => {
            if (!labelsInclude(conv, transitionToLabel)) return false;
            if (exactHumanAppointmentIds.has(Number(conv.id))) return false;
            if (humanAppointmentMode === "exact") return false;
            if (!trackingStartDate) return true;
            return getCreatedDate(conv) < trackingStartDate;
        }).length;

        const humanAppointmentConversions = humanAppointmentMode === "estimated_legacy"
            ? legacyHumanAppointments
            : exactHumanAppointmentIds.size + legacyHumanAppointments;
        const humanAppointmentConversionRate = (followupCurrent + humanAppointmentConversions) > 0
            ? Math.round((humanAppointmentConversions / (followupCurrent + humanAppointmentConversions)) * 100)
            : 0;

        return {
            followupCurrent,
            humanAppointmentConversions,
            humanAppointmentConversionRate,
            humanAppointmentMode,
            trackingStartedAt,
            rangeLabel:
                globalFilters.startDate && globalFilters.endDate
                    ? `${getGuayaquilDateString(globalFilters.startDate)} - ${getGuayaquilDateString(globalFilters.endDate)}`
                    : "Rango global"
        };
    }, [conversations, globalFilters.endDate, globalFilters.selectedInboxes, globalFilters.startDate, labelEvents, transitionFromLabel, transitionToLabel]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-96 text-red-500">
                Error al cargar datos: {error}
            </div>
        );
    }

    const { humanMetrics } = data;
    const mode = modeCopy[humanAppointmentMetrics.humanAppointmentMode] || modeCopy.estimated_legacy;
    const appointmentComparison = [
        { name: transitionFromLabel, value: humanAppointmentMetrics.followupCurrent, fill: "#243d90" },
        { name: transitionToLabel, value: humanAppointmentMetrics.humanAppointmentConversions, fill: "#059669" }
    ];
    const salesChartData = humanMetrics.salesByDate?.length
        ? humanMetrics.salesByDate
        : [{ date: "Sin ventas", sales: 0, salesVolume: 0 }];

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight">Rendimiento Humano</h2>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <CalendarCheck2 className="h-5 w-5 text-emerald-600" />
                                    Citas agendadas por humano
                                </CardTitle>
                                <CardDescription>
                                    Analiza cuántos leads estaban en una etiqueta y luego pasaron a otra. Elige abajo la etiqueta inicial y la etiqueta destino para este negocio.
                                </CardDescription>
                            </div>
                            <Badge variant="outline" className="w-fit">{mode.label}</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="rounded-xl border bg-muted/20 p-4">
                            <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground">Etiqueta inicial</p>
                                    <Select value={transitionFromLabel} onValueChange={setTransitionFromLabel}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecciona etiqueta inicial" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableHumanTransitionLabels.map((label) => (
                                                <SelectItem key={`human-from-${label}`} value={label}>
                                                    {label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-center justify-center pb-1 text-muted-foreground">
                                    <ArrowRightLeft className="h-4 w-4" />
                                </div>

                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground">Etiqueta destino</p>
                                    <Select value={transitionToLabel} onValueChange={setTransitionToLabel}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecciona etiqueta destino" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableHumanTransitionLabels.map((label) => (
                                                <SelectItem key={`human-to-${label}`} value={label}>
                                                    {label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground">
                                Se calcula sobre leads que estaban en <span className="font-medium text-foreground">{transitionFromLabel}</span> y después pasaron a <span className="font-medium text-foreground">{transitionToLabel}</span>, respetando el rango y canal seleccionados.
                            </p>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-lg border bg-muted/20 p-3">
                                <p className="text-[10px] uppercase font-bold text-muted-foreground">Seguimiento</p>
                                <p className="text-2xl font-bold">{humanAppointmentMetrics.followupCurrent}</p>
                            </div>
                            <div className="rounded-lg border bg-muted/20 p-3">
                                <p className="text-[10px] uppercase font-bold text-muted-foreground">Citas humanas</p>
                                <p className="text-2xl font-bold">{humanAppointmentMetrics.humanAppointmentConversions}</p>
                            </div>
                            <div className="rounded-lg border bg-muted/20 p-3">
                                <p className="text-[10px] uppercase font-bold text-muted-foreground">Conversion</p>
                                <p className="text-2xl font-bold">{humanAppointmentMetrics.humanAppointmentConversionRate}%</p>
                            </div>
                        </div>

                        <div className="space-y-1 text-xs text-muted-foreground">
                            <p>{mode.description}</p>
                            <p>Rango aplicado: {humanAppointmentMetrics.rangeLabel}</p>
                        </div>

                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={appointmentComparison} margin={{ top: 20, right: 20, left: 0, bottom: 10 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.12} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip cursor={{ fill: "transparent" }} />
                                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                        {appointmentComparison.map((entry) => (
                                            <Cell key={entry.name} fill={entry.fill} />
                                        ))}
                                        <LabelList dataKey="value" position="top" style={{ fontWeight: 700 }} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-emerald-600" />
                            Ventas exitosas
                        </CardTitle>
                        <CardDescription>
                            Leads con {humanSaleTargetLabel} y valores de monto_operacion.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-lg border bg-muted/20 p-3">
                                <p className="text-[10px] uppercase font-bold text-muted-foreground">Ventas</p>
                                <p className="text-2xl font-bold">{humanMetrics.salesCount}</p>
                            </div>
                            <div className="rounded-lg border bg-muted/20 p-3">
                                <p className="text-[10px] uppercase font-bold text-muted-foreground">Total vendido</p>
                                <p className="text-2xl font-bold">{formatCurrency(humanMetrics.salesVolume)}</p>
                            </div>
                            <div className="rounded-lg border bg-muted/20 p-3">
                                <p className="text-[10px] uppercase font-bold text-muted-foreground">Ticket promedio</p>
                                <p className="text-2xl font-bold">{formatCurrency(humanMetrics.averageTicket)}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <TrendingUp className="h-4 w-4" />
                            La fecha del grafico usa fecha_monto_operacion; si falta, usa la fecha de creacion del lead.
                        </div>

                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={salesChartData} margin={{ top: 20, right: 20, left: 0, bottom: 10 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.12} />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={(value) => `$${value}`} />
                                    <Tooltip
                                        cursor={{ fill: "transparent" }}
                                        formatter={(value: number, name: string, item: any) => {
                                            if (name === "salesVolume") return [formatCurrency(value), "Monto vendido"];
                                            return [item?.payload?.sales || 0, "Ventas"];
                                        }}
                                    />
                                    <Bar dataKey="salesVolume" fill="#059669" radius={[6, 6, 0, 0]}>
                                        <LabelList
                                            dataKey="sales"
                                            position="top"
                                            formatter={(value: number) => `${value} venta${value === 1 ? "" : "s"}`}
                                            style={{ fontWeight: 700 }}
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default PerformanceLayer;
