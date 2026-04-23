import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useDashboardContext } from "@/context/DashboardDataContext";
import { GUAYAQUIL_TIMEZONE, getGuayaquilDateString } from "@/lib/guayaquilTime";
import { getInboxChannelName } from "@/lib/leadDisplay";
import {
    HybridDashboardService,
    IncomingMessageTrafficEvent
} from "@/services/HybridDashboardService";
import {
    AlertCircle,
    Clock,
    Info,
    Loader2,
    MessageCircle,
    UserCheck,
    Users
} from "lucide-react";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from "recharts";

const formatDuration = (seconds: number) => {
    if (!seconds) return "0 s";
    if (seconds < 60) return `${Math.round(seconds)} s`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    if (remainingSeconds === 0) return `${minutes} min`;
    return `${minutes} min ${remainingSeconds} s`;
};

const formatDateFilter = (date?: Date) => date ? getGuayaquilDateString(date) : "Sin fecha";

type TrafficDetailView = "peaks" | "days" | "hours";

const sourceLabel = (events: IncomingMessageTrafficEvent[]) => {
    const hasApi = events.some((event) => event.source === "api");
    const hasSupabase = events.some((event) => event.source === "supabase");
    if (hasApi && hasSupabase) return "Live + historico";
    if (hasApi) return "Live Chatwoot";
    if (hasSupabase) return "Historico Supabase";
    return "Sin mensajes";
};

const OperationalEfficiency = () => {
    const {
        globalFilters,
        tagSettings,
        inboxes,
        lastLiveFetchAt
    } = useDashboardContext();
    const { loading, error, data } = useDashboardData({
        ...globalFilters,
        ...tagSettings
    });

    const [trafficEvents, setTrafficEvents] = useState<IncomingMessageTrafficEvent[]>([]);
    const [trafficLoading, setTrafficLoading] = useState(false);
    const [trafficError, setTrafficError] = useState<string | null>(null);
    const [trafficDetailView, setTrafficDetailView] = useState<TrafficDetailView>("peaks");
    const [selectedTrafficDate, setSelectedTrafficDate] = useState<string | null>(null);

    useEffect(() => {
        if (!globalFilters.startDate) return;

        const controller = new AbortController();
        setTrafficLoading(true);
        setTrafficError(null);

        HybridDashboardService.fetchHybridIncomingMessageEvents({
            startDate: globalFilters.startDate,
            endDate: globalFilters.endDate || globalFilters.startDate,
            selectedInboxes: globalFilters.selectedInboxes || [],
            signal: controller.signal
        })
            .then((events) => {
                if (!controller.signal.aborted) setTrafficEvents(events);
            })
            .catch((err) => {
                if (!controller.signal.aborted) {
                    console.error("Error loading incoming traffic:", err);
                    setTrafficEvents([]);
                    setTrafficError("No se pudo cargar el trafico de mensajes entrantes.");
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setTrafficLoading(false);
            });

        return () => controller.abort();
    }, [
        globalFilters.startDate?.getTime(),
        globalFilters.endDate?.getTime(),
        (globalFilters.selectedInboxes || []).join(","),
        lastLiveFetchAt?.getTime()
    ]);

    const operational = data.operationalMetrics || {};
    const ownerRows = data.ownerPerformance || [];

    const trafficByHour = useMemo(() => {
        const counts = new Array(24).fill(0);
        trafficEvents.forEach((event) => {
            if (event.hour >= 0 && event.hour <= 23) counts[event.hour] += 1;
        });

        return counts.map((count, hour) => ({
            hour: `${hour.toString().padStart(2, "0")}:00`,
            count
        }));
    }, [trafficEvents]);

    const trafficByDateHour = useMemo(() => {
        const grouped = new Map<string, { date: string; hour: string; count: number; sources: Set<string> }>();
        trafficEvents.forEach((event) => {
            const key = `${event.date}|${event.hourLabel}`;
            const row = grouped.get(key) || {
                date: event.date,
                hour: event.hourLabel,
                count: 0,
                sources: new Set<string>()
            };
            row.count += 1;
            row.sources.add(event.source);
            grouped.set(key, row);
        });

        return Array.from(grouped.values())
            .sort((a, b) => b.count - a.count || b.date.localeCompare(a.date) || a.hour.localeCompare(b.hour));
    }, [trafficEvents]);

    const trafficByDate = useMemo(() => {
        const grouped = new Map<string, number>();
        trafficEvents.forEach((event) => {
            grouped.set(event.date, (grouped.get(event.date) || 0) + 1);
        });

        return Array.from(grouped.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [trafficEvents]);

    const trafficHourRows = useMemo(() => {
        return trafficByHour
            .filter((row) => row.count > 0)
            .sort((a, b) => b.count - a.count || a.hour.localeCompare(b.hour));
    }, [trafficByHour]);

    const selectedDateTrafficByHour = useMemo(() => {
        const counts = new Array(24).fill(0);
        if (!selectedTrafficDate) {
            return counts.map((count, hour) => ({
                hour: `${hour.toString().padStart(2, "0")}:00`,
                count
            }));
        }

        trafficEvents.forEach((event) => {
            if (event.date === selectedTrafficDate && event.hour >= 0 && event.hour <= 23) {
                counts[event.hour] += 1;
            }
        });

        return counts.map((count, hour) => ({
            hour: `${hour.toString().padStart(2, "0")}:00`,
            count
        }));
    }, [selectedTrafficDate, trafficEvents]);

    const selectedDateHourRows = useMemo(() => {
        return selectedDateTrafficByHour
            .filter((row) => row.count > 0)
            .sort((a, b) => b.count - a.count || a.hour.localeCompare(b.hour));
    }, [selectedDateTrafficByHour]);

    const topTrafficHours = trafficByDateHour.slice(0, 12);
    const peakChartData = topTrafficHours.map((row) => ({
        label: `${row.date} ${row.hour}`,
        date: row.date,
        hour: row.hour,
        count: row.count
    }));
    const totalIncomingMessages = trafficEvents.length;
    const peakDay = trafficByDate.reduce<{ date: string; count: number } | undefined>(
        (peak, row) => !peak || row.count > peak.count ? row : peak,
        undefined
    );
    const selectedTrafficEvents = selectedTrafficDate
        ? trafficEvents.filter((event) => event.date === selectedTrafficDate)
        : trafficEvents;
    const selectedTrafficDateSummary = selectedTrafficDate
        ? trafficByDate.find((row) => row.date === selectedTrafficDate)
        : null;
    const activeTrafficByHour = selectedTrafficDate ? selectedDateTrafficByHour : trafficByHour;
    const activeTrafficByDateHour = selectedTrafficDate
        ? trafficByDateHour.filter((row) => row.date === selectedTrafficDate)
        : trafficByDateHour;
    const activeIncomingMessages = selectedTrafficDate ? selectedTrafficEvents.length : totalIncomingMessages;
    const activePeakAggregatedHour = activeTrafficByHour.reduce((peak, row) => row.count > peak.count ? row : peak, activeTrafficByHour[0] || { hour: "00:00", count: 0 });
    const activePeakExact = activeTrafficByDateHour[0];
    const activePeakDay = selectedTrafficDate ? selectedTrafficDateSummary : peakDay;

    useEffect(() => {
        if (!selectedTrafficDate) return;
        const selectedDateStillExists = trafficByDate.some((row) => row.date === selectedTrafficDate);
        if (!selectedDateStillExists) setSelectedTrafficDate(null);
    }, [selectedTrafficDate, trafficByDate]);

    const selectedChannelLabel = useMemo(() => {
        const selectedInboxes = globalFilters.selectedInboxes || [];
        if (selectedInboxes.length === 0) return "Todos los canales";
        const names = Array.from(new Set(selectedInboxes
            .map((id) => inboxes.find((inbox: any) => Number(inbox.id) === Number(id)))
            .filter(Boolean)
            .map((inbox: any) => getInboxChannelName(inbox))));
        return names.join(", ");
    }, [globalFilters.selectedInboxes, inboxes]);

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
                Error: {error}
            </div>
        );
    }

    const totalLeads = operational.totalLeads || 0;
    const averageResponse = operational.averageFirstResponseSeconds || operational.firstResponseAverageSeconds || 0;
    const rawAverageResponse = operational.firstResponseRawAverageSeconds || 0;
    const responseGraceSeconds = operational.firstResponseGraceSeconds || 60;
    const responseSamples = operational.firstResponseCount || 0;
    const leadsWithoutResponse = operational.leadsSinRespuesta || 0;
    const leadsWithOwner = operational.leadsWithOwnerCount || 0;
    const unassignedLeads = operational.unassignedLeadsCount || ownerRows.find((owner: any) => owner.source === "sin_asignar")?.leads || 0;
    const leadsWithOwnerPercentage = operational.leadsWithOwnerPercentage || 0;
    const startLabel = formatDateFilter(globalFilters.startDate);
    const endLabel = formatDateFilter(globalFilters.endDate || globalFilters.startDate);

    const ownerSourceLabel = (source?: string) => {
        if (source === "responsable") return "Atributo responsable";
        if (source === "sin_asignar") return "Sin asignar";
        return "Agente asignado";
    };

    const changeTrafficView = (view: TrafficDetailView) => {
        setTrafficDetailView(view);
        setSelectedTrafficDate(null);
    };

    const selectTrafficDate = (date: string) => {
        setTrafficDetailView("days");
        setSelectedTrafficDate(date);
    };

    const trafficChartTitle = selectedTrafficDate
        ? `Horas del dia ${selectedTrafficDate}`
        : trafficDetailView === "days"
            ? "Mensajes por dia"
            : trafficDetailView === "peaks"
                ? "Picos exactos por fecha y hora"
                : "Mensajes por hora";

    const trafficChartDescription = selectedTrafficDate
        ? "Detalle por hora del dia seleccionado."
        : trafficDetailView === "days"
            ? "Haz clic en una barra o fila para abrir sus horas."
            : trafficDetailView === "peaks"
                ? "Muestra las combinaciones de fecha y hora con mas mensajes entrantes."
                : "Suma todos los mensajes entrantes del rango y los agrupa por hora local de Guayaquil.";

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-500" />
                            Tiempo promedio de respuesta
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatDuration(averageResponse)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Se descuentan los primeros {formatDuration(responseGraceSeconds)} de espera operativa.
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                            Despues de esa ventana se mide la demora real de respuesta.
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                            Bruto oficial promedio: {formatDuration(rawAverageResponse)}. Muestra ajustada sobre {responseSamples} conversaciones.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-red-500" />
                            Leads sin respuesta
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{leadsWithoutResponse}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Ultima interaccion del cliente sin respuesta posterior.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-emerald-500" />
                            Leads con responsable
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end justify-between gap-3">
                            <div>
                                <div className="text-2xl font-bold">{leadsWithOwnerPercentage}%</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {leadsWithOwner} de {totalLeads} leads asignados.
                                </p>
                            </div>
                            <Badge variant="outline">responsable &gt; agente</Badge>
                        </div>
                        <Progress value={leadsWithOwnerPercentage} className="h-1.5 mt-4" />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="h-5 w-5 text-primary" />
                        Desempeno por Responsable
                    </CardTitle>
                    <CardDescription>
                        El atributo de contacto responsable tiene prioridad sobre el agente asignado en Chatwoot.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto border rounded-xl">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 text-left">Responsable</th>
                                    <th className="px-4 py-3 text-left">Fuente</th>
                                    <th className="px-4 py-3 text-right">Leads</th>
                                    <th className="px-4 py-3 text-right">Sin respuesta</th>
                                    <th className="px-4 py-3 text-right">Citas</th>
                                    <th className="px-4 py-3 text-right">Conversion</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {ownerRows.map((owner: any) => (
                                    <tr key={owner.name} className="hover:bg-muted/20">
                                        <td className="px-4 py-3 font-medium">{owner.name}</td>
                                        <td className="px-4 py-3">
                                            <Badge variant={owner.source === "responsable" ? "default" : owner.source === "sin_asignar" ? "outline" : "secondary"}>
                                                {ownerSourceLabel(owner.source)}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold">{owner.leads}</td>
                                        <td className="px-4 py-3 text-right">{owner.unanswered || 0}</td>
                                        <td className="px-4 py-3 text-right">{owner.appointments}</td>
                                        <td className="px-4 py-3 text-right font-semibold">{owner.winRate}%</td>
                                    </tr>
                                ))}
                                {ownerRows.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                                            No hay leads en este periodo.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <span className="font-semibold">{unassignedLeads} leads sin responsable.</span>{" "}
                        Son leads sin agente asignado en Chatwoot y sin valor en el atributo responsable.
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <MessageCircle className="h-5 w-5 text-primary" />
                                Horas pico de trafico
                            </CardTitle>
                            <CardDescription className="mt-1 max-w-3xl">
                                Se mide por mensajes entrantes escritos por clientes dentro del rango seleccionado,
                                agrupados por hora local de Guayaquil.
                            </CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">Rango: {startLabel} - {endLabel}</Badge>
                            <Badge variant="outline">Canal: {selectedChannelLabel}</Badge>
                            <Badge variant="outline">Fuente: {sourceLabel(trafficEvents)}</Badge>
                            <Badge variant="secondary">{GUAYAQUIL_TIMEZONE}</Badge>
                        </div>
                    </div>
                    {trafficError && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            {trafficError}
                        </div>
                    )}
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground flex items-start gap-2">
                        <Info className="h-4 w-4 mt-0.5 text-primary" />
                        <span>
                            {selectedTrafficDate
                                ? "El grafico muestra las horas del dia seleccionado. Usa Ver todos los dias para regresar al rango completo."
                                : trafficDetailView === "days"
                                    ? "El grafico muestra el total por dia del rango filtrado. Haz clic en un dia para abrir sus horas."
                                    : trafficDetailView === "peaks"
                                        ? "El grafico muestra los picos exactos por fecha y hora. La tabla repite el detalle ordenado."
                                        : "El grafico suma todos los mensajes entrantes del rango y los agrupa por hora local de Guayaquil."}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <div className="rounded-xl border bg-background p-4">
                            <p className="text-xs uppercase text-muted-foreground font-semibold">Mensajes entrantes</p>
                            <p className="text-2xl font-bold mt-1">{activeIncomingMessages}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {selectedTrafficDate ? `Clientes del ${selectedTrafficDate}.` : "Clientes dentro del rango filtrado."}
                            </p>
                        </div>
                        <div className="rounded-xl border bg-background p-4">
                            <p className="text-xs uppercase text-muted-foreground font-semibold">Dia con mas trafico</p>
                            <p className="text-xl font-bold mt-1">{activePeakDay ? activePeakDay.date : "Sin datos"}</p>
                            <p className="text-xs text-muted-foreground mt-1">{activePeakDay ? `${activePeakDay.count} mensajes entrantes` : "No hay mensajes."}</p>
                        </div>
                        <div className="rounded-xl border bg-background p-4">
                            <p className="text-xs uppercase text-muted-foreground font-semibold">Hora pico agregada</p>
                            <p className="text-xl font-bold mt-1">{activeIncomingMessages > 0 ? activePeakAggregatedHour.hour : "Sin datos"}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {activeIncomingMessages > 0 ? `${activePeakAggregatedHour.count} mensajes ${selectedTrafficDate ? "en el dia" : "en el rango"}` : "No hay mensajes."}
                            </p>
                        </div>
                        <div className="rounded-xl border bg-background p-4">
                            <p className="text-xs uppercase text-muted-foreground font-semibold">Pico exacto</p>
                            <p className="text-xl font-bold mt-1">{activePeakExact ? `${activePeakExact.date} ${activePeakExact.hour}` : "Sin datos"}</p>
                            <p className="text-xs text-muted-foreground mt-1">{activePeakExact ? `${activePeakExact.count} mensajes entrantes` : "No hay mensajes."}</p>
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div>
                            <h3 className="font-semibold text-sm">{trafficChartTitle}</h3>
                            <p className="text-xs text-muted-foreground">{trafficChartDescription}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {trafficLoading && (
                                <Badge variant="secondary" className="gap-2">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Actualizando
                                </Badge>
                            )}
                            {selectedTrafficDate && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedTrafficDate(null)}
                                    className="rounded-md border px-3 py-1.5 text-xs font-medium bg-background text-muted-foreground hover:bg-muted"
                                >
                                    Ver todos los dias
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => changeTrafficView("peaks")}
                                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${trafficDetailView === "peaks" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"}`}
                            >
                                Picos exactos
                            </button>
                            <button
                                type="button"
                                onClick={() => changeTrafficView("days")}
                                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${trafficDetailView === "days" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"}`}
                            >
                                Por dia
                            </button>
                            <button
                                type="button"
                                onClick={() => changeTrafficView("hours")}
                                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${trafficDetailView === "hours" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"}`}
                            >
                                Por hora
                            </button>
                        </div>
                    </div>

                    <div className="h-[380px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            {trafficDetailView === "peaks" ? (
                                <BarChart data={peakChartData} margin={{ top: 10, right: 24, left: 0, bottom: 42 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.12} />
                                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval={0} angle={-18} textAnchor="end" height={56} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                                    <Tooltip
                                        cursor={{ fill: "hsl(var(--muted))" }}
                                        contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                                    />
                                    <Bar dataKey="count" name="Mensajes entrantes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            ) : trafficDetailView === "days" && !selectedTrafficDate ? (
                                <BarChart
                                    data={trafficByDate}
                                    margin={{ top: 10, right: 24, left: 0, bottom: 24 }}
                                    onClick={(chart: any) => {
                                        const date = chart?.activePayload?.[0]?.payload?.date;
                                        if (date) selectTrafficDate(date);
                                    }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.12} />
                                    <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} interval={0} angle={-12} textAnchor="end" height={44} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                                    <Tooltip
                                        cursor={{ fill: "hsl(var(--muted))" }}
                                        contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                                    />
                                    <Bar dataKey="count" name="Mensajes entrantes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} cursor="pointer" />
                                </BarChart>
                            ) : (
                                <LineChart data={trafficDetailView === "days" ? selectedDateTrafficByHour : trafficByHour} margin={{ top: 10, right: 24, left: 0, bottom: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.12} />
                                    <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={11} interval={1} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                                    <Tooltip
                                        cursor={{ stroke: "hsl(var(--primary))", strokeDasharray: "3 3" }}
                                        contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="count"
                                        name="Mensajes entrantes"
                                        stroke="hsl(var(--primary))"
                                        strokeWidth={3}
                                        dot={{ r: 3 }}
                                        activeDot={{ r: 5 }}
                                    />
                                </LineChart>
                            )}
                        </ResponsiveContainer>
                    </div>

                    <div className="space-y-3">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                            <div>
                                <h3 className="font-semibold text-sm">Detalle de trafico</h3>
                                <p className="text-xs text-muted-foreground">
                                    {selectedTrafficDate
                                        ? `Mostrando horas del ${selectedTrafficDate}.`
                                        : trafficDetailView === "days"
                                            ? "Selecciona un dia para abrir el detalle por horas."
                                            : trafficDetailView === "peaks"
                                                ? "Fechas y horas con mayor cantidad de mensajes entrantes."
                                                : "Horas agregadas del rango seleccionado."}
                                </p>
                            </div>
                        </div>

                        {trafficDetailView === "peaks" && (
                            <div className="rounded-xl border overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Fecha</th>
                                            <th className="px-4 py-3 text-left">Hora</th>
                                            <th className="px-4 py-3 text-right">Mensajes entrantes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {topTrafficHours.map((row) => (
                                            <tr key={`${row.date}_${row.hour}`}>
                                                <td className="px-4 py-3 font-medium">{row.date}</td>
                                                <td className="px-4 py-3">{row.hour}</td>
                                                <td className="px-4 py-3 text-right font-semibold">{row.count}</td>
                                            </tr>
                                        ))}
                                        {!trafficLoading && topTrafficHours.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground">
                                                    No hay mensajes entrantes de clientes en este rango.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {trafficDetailView === "days" && selectedTrafficDate && (
                            <div className="rounded-xl border overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Hora local</th>
                                            <th className="px-4 py-3 text-right">Mensajes entrantes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {selectedDateHourRows.map((row) => (
                                            <tr key={row.hour}>
                                                <td className="px-4 py-3 font-medium">{row.hour}</td>
                                                <td className="px-4 py-3 text-right font-semibold">{row.count}</td>
                                            </tr>
                                        ))}
                                        {!trafficLoading && selectedDateHourRows.length === 0 && (
                                            <tr>
                                                <td colSpan={2} className="px-4 py-12 text-center text-sm text-muted-foreground">
                                                    No hay mensajes entrantes de clientes en este dia.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {trafficDetailView === "days" && !selectedTrafficDate && (
                            <div className="rounded-xl border overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Fecha</th>
                                            <th className="px-4 py-3 text-right">Mensajes entrantes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {trafficByDate.map((row) => (
                                            <tr
                                                key={row.date}
                                                className="cursor-pointer hover:bg-muted/30"
                                                onClick={() => selectTrafficDate(row.date)}
                                            >
                                                <td className="px-4 py-3 font-medium">{row.date}</td>
                                                <td className="px-4 py-3 text-right font-semibold">{row.count}</td>
                                            </tr>
                                        ))}
                                        {!trafficLoading && trafficByDate.length === 0 && (
                                            <tr>
                                                <td colSpan={2} className="px-4 py-12 text-center text-sm text-muted-foreground">
                                                    No hay mensajes entrantes de clientes en este rango.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {trafficDetailView === "hours" && (
                            <div className="rounded-xl border overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Hora local</th>
                                            <th className="px-4 py-3 text-right">Mensajes entrantes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {trafficHourRows.map((row) => (
                                            <tr key={row.hour}>
                                                <td className="px-4 py-3 font-medium">{row.hour}</td>
                                                <td className="px-4 py-3 text-right font-semibold">{row.count}</td>
                                            </tr>
                                        ))}
                                        {!trafficLoading && trafficHourRows.length === 0 && (
                                            <tr>
                                                <td colSpan={2} className="px-4 py-12 text-center text-sm text-muted-foreground">
                                                    No hay mensajes entrantes de clientes en este rango.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default OperationalEfficiency;
