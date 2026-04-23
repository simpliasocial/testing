import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardData } from "@/hooks/useDashboardData";
import {
    AlertCircle,
    Compass,
    DollarSign,
    Info,
    Loader2,
    Target
} from "lucide-react";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    LabelList,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from "recharts";

import { useDashboardContext } from "@/context/DashboardDataContext";

const COLORS = ["#243d90", "#059669", "#d97706", "#7c3aed", "#db2777", "#475569", "#0891b2"];

const formatCurrency = (value: number) =>
    new Intl.NumberFormat("es-US", { style: "currency", currency: "USD" }).format(value || 0);

const EmptyState = ({ text }: { text: string }) => (
    <div className="flex h-full min-h-[220px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        {text}
    </div>
);

const TrendLayer = () => {
    const { globalFilters, tagSettings } = useDashboardContext();
    const { loading, data } = useDashboardData({
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

    const { trendMetrics } = data;
    const channelTotal = (trendMetrics.channelLeads || []).reduce((sum: number, item: any) => sum + (item.value || 0), 0);
    const campaignTotal = (trendMetrics.campaignList || []).reduce((sum: number, item: any) => sum + (item.value || 0), 0);
    const disqualificationTotal = (trendMetrics.disqualificationStats || []).reduce((sum: number, item: any) => sum + (item.value || 0), 0);
    const revenueTotal = (trendMetrics.revenuePeaks || []).reduce((sum: number, item: any) => sum + (item.value || 0), 0);
    const unqualifiedLabels = tagSettings.unqualifiedTags?.length ? tagSettings.unqualifiedTags.join(", ") : "no aplica";

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight">Tendencias</h2>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Compass className="h-5 w-5 text-primary" />
                                    Origen de leads
                                </CardTitle>
                                <CardDescription>
                                    Compara los canales existentes detectados en Chatwoot.
                                </CardDescription>
                            </div>
                            <Badge variant="outline">{channelTotal} leads</Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {trendMetrics.channelLeads.length === 0 ? (
                            <EmptyState text="No hay leads por canal en este rango." />
                        ) : (
                            <div className="h-[320px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={trendMetrics.channelLeads}
                                        layout="vertical"
                                        margin={{ left: 18, right: 24, top: 12, bottom: 8 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} strokeOpacity={0.12} />
                                        <XAxis type="number" allowDecimals={false} />
                                        <YAxis
                                            dataKey="name"
                                            type="category"
                                            width={96}
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fontSize: 12, fontWeight: 600 }}
                                        />
                                        <Tooltip
                                            cursor={{ fill: "transparent" }}
                                            formatter={(value: number) => [`${value} leads`, "Canal"]}
                                        />
                                        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                                            {trendMetrics.channelLeads.map((entry: any, index: number) => (
                                                <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                            <LabelList dataKey="value" position="right" style={{ fontWeight: 700 }} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <DollarSign className="h-5 w-5 text-emerald-600" />
                                    Picos de ingresos
                                </CardTitle>
                                <CardDescription>
                                    Usa venta_exitosa, monto_operacion y fecha_monto_operacion.
                                </CardDescription>
                            </div>
                            <Badge variant="outline">{formatCurrency(revenueTotal)}</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {trendMetrics.revenuePeaks.length === 0 ? (
                            <EmptyState text="No hay ventas exitosas con ingresos en este rango." />
                        ) : (
                            <>
                                <div className="h-[240px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={trendMetrics.revenuePeaks} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
                                            <defs>
                                                <linearGradient id="trendRevenue" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#059669" stopOpacity={0.25} />
                                                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.12} />
                                            <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                            <YAxis tickFormatter={(value) => `$${value}`} axisLine={false} tickLine={false} />
                                            <Tooltip
                                                formatter={(value: number, name: string, item: any) => [
                                                    formatCurrency(value),
                                                    `${item?.payload?.sales || 0} venta${item?.payload?.sales === 1 ? "" : "s"}`
                                                ]}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="value"
                                                stroke="#059669"
                                                strokeWidth={3}
                                                fill="url(#trendRevenue)"
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {(trendMetrics.revenuePeakDays || []).slice(0, 4).map((item: any) => (
                                        <div key={item.date} className="rounded-lg border bg-muted/20 p-3">
                                            <p className="text-xs font-semibold">{item.date}</p>
                                            <p className="text-lg font-bold text-emerald-700">{formatCurrency(item.value)}</p>
                                            <p className="text-[10px] text-muted-foreground">{item.sales} venta{item.sales === 1 ? "" : "s"}</p>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <AlertCircle className="h-5 w-5 text-amber-600" />
                                    Motivos de descalificacion
                                </CardTitle>
                                <CardDescription>
                                    Distribucion de leads con etiquetas configuradas como no aplica.
                                </CardDescription>
                            </div>
                            <Badge variant="outline">{disqualificationTotal} leads</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                            <div className="mb-1 flex items-center gap-2 font-semibold">
                                <Info className="h-4 w-4" />
                                Contexto
                            </div>
                            <p>
                                Se toma de las etiquetas de descalificacion configuradas en el funnel: {unqualifiedLabels}. Usualmente agrupa leads que insultan, mandan videos, memes, reels o preguntas fuera del contexto del negocio.
                            </p>
                        </div>

                        {trendMetrics.disqualificationStats.length === 0 ? (
                            <EmptyState text="No hay leads descalificados en este rango." />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="h-[240px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={trendMetrics.disqualificationStats}
                                                dataKey="value"
                                                nameKey="name"
                                                innerRadius={54}
                                                outerRadius={82}
                                                paddingAngle={4}
                                            >
                                                {trendMetrics.disqualificationStats.map((entry: any, index: number) => (
                                                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value: number) => [`${value} leads`, "Descalificacion"]} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex flex-col justify-center gap-2">
                                    {trendMetrics.disqualificationStats.slice(0, 6).map((item: any, index: number) => (
                                        <div key={item.name} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                                <span className="truncate">{item.name}</span>
                                            </div>
                                            <span className="font-bold">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Target className="h-5 w-5 text-violet-600" />
                                    Campanas
                                </CardTitle>
                                <CardDescription>
                                    Cuenta leads por valor no vacio del contact attribute campana.
                                </CardDescription>
                            </div>
                            <Badge variant="outline">{campaignTotal} leads</Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {trendMetrics.campaignList.length === 0 ? (
                            <EmptyState text="No hay valores de campana en este rango." />
                        ) : (
                            <div className="space-y-3">
                                {trendMetrics.campaignList.slice(0, 8).map((campaign: any) => {
                                    const percentage = campaignTotal > 0 ? Math.round((campaign.value / campaignTotal) * 100) : 0;
                                    return (
                                        <div key={campaign.name} className="rounded-lg border p-3">
                                            <div className="mb-2 flex items-center justify-between gap-3">
                                                <span className="truncate font-semibold">{campaign.name}</span>
                                                <span className="text-sm font-bold text-primary">{campaign.value}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                                    <div className="h-full rounded-full bg-violet-600" style={{ width: `${percentage}%` }} />
                                                </div>
                                                <span className="w-10 text-right text-xs font-semibold text-muted-foreground">{percentage}%</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default TrendLayer;
