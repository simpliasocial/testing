import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardContext } from "@/context/DashboardDataContext";
import { useDashboardData } from "@/hooks/useDashboardData";
import { CalendarCheck2, DollarSign, Loader2, TrendingUp } from "lucide-react";
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

const PerformanceLayer = () => {
    const { globalFilters, tagSettings } = useDashboardContext();
    const { loading, error, data } = useDashboardData({
        ...globalFilters,
        ...tagSettings
    });

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
    const mode = modeCopy[humanMetrics.humanAppointmentMode] || modeCopy.estimated_legacy;
    const appointmentComparison = [
        { name: "Seguimiento actual", value: humanMetrics.followupCurrent, fill: "#243d90" },
        { name: "Citas humanas", value: humanMetrics.humanAppointmentConversions, fill: "#059669" }
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
                                    Mide leads que pasan de seguimiento_humano a cita_agendada_humano.
                                </CardDescription>
                            </div>
                            <Badge variant="outline" className="w-fit">{mode.label}</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-lg border bg-muted/20 p-3">
                                <p className="text-[10px] uppercase font-bold text-muted-foreground">Seguimiento</p>
                                <p className="text-2xl font-bold">{humanMetrics.followupCurrent}</p>
                            </div>
                            <div className="rounded-lg border bg-muted/20 p-3">
                                <p className="text-[10px] uppercase font-bold text-muted-foreground">Citas humanas</p>
                                <p className="text-2xl font-bold">{humanMetrics.humanAppointmentConversions}</p>
                            </div>
                            <div className="rounded-lg border bg-muted/20 p-3">
                                <p className="text-[10px] uppercase font-bold text-muted-foreground">Conversion</p>
                                <p className="text-2xl font-bold">{humanMetrics.humanAppointmentConversionRate}%</p>
                            </div>
                        </div>

                        <p className="text-xs text-muted-foreground">{mode.description}</p>

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
                            Leads con venta_exitosa y valores de monto_operacion.
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
