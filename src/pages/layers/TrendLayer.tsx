import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import {
    Loader2,
    TrendingUp,
    BarChart3,
    Compass,
    AlertCircle,
    Info,
    DollarSign,
    Target
} from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    PieChart,
    Pie,
    AreaChart,
    Area,
    Legend
} from "recharts";

import { useDashboardContext } from "@/context/DashboardDataContext";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];

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

    const { trendMetrics, kpis } = data;
    const campaignTotal = (trendMetrics.campaignList || []).reduce((acc: number, curr: any) => acc + (curr.value || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold tracking-tight">Tendencias y Orígenes</h2>
                <p className="text-muted-foreground text-sm max-w-3xl">
                    Desglose de dónde vienen los leads (TikTok vs WhatsApp vs Messenger vs Instagram) o qué días generan los mayores picos de ingresos, así como la distribución de motivos de descalificación.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Orígenes de Tráfico */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Compass className="h-5 w-5 text-blue-500" />
                            Orígenes de Tráfico
                        </CardTitle>
                        <CardDescription>Distribución de leads por red social y canal</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={trendMetrics.channelLeads}
                                    layout="vertical"
                                    margin={{ left: 40, right: 20 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} strokeOpacity={0.1} />
                                    <XAxis type="number" hide />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 12, fontWeight: 500 }}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar dataKey="value" name="Leads" radius={[0, 4, 4, 0]}>
                                        {trendMetrics.channelLeads.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Motivos de Descalificación */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <AlertCircle className="h-5 w-5 text-orange-500" />
                            Motivos de Descalificación
                        </CardTitle>
                        <CardDescription>Análisis de leads que no cumplen el perfil comercial</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="h-[250px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={trendMetrics.disqualificationStats}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {trendMetrics.disqualificationStats.map((entry: any, index: number) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex flex-col justify-center gap-4">
                                <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl">
                                    <div className="flex gap-2 text-orange-800 font-semibold text-xs mb-1">
                                        <Info className="h-4 w-4" />
                                        Nota sobre "No Aplica"
                                    </div>
                                    <p className="text-[11px] text-orange-700 leading-relaxed">
                                        Los leads marcados como <strong>desestimados</strong> suelen caer bajo categorías de insultos, contenido irrelevante (memes/videos/reels) o consultas fuera del contexto de negocio.
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    {trendMetrics.disqualificationStats.slice(0, 4).map((item: any, idx: number) => (
                                        <div key={item.name} className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2 text-muted-foreground">
                                                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                                <span className="truncate max-w-[120px]">{item.name}</span>
                                            </div>
                                            <span className="font-bold">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* 3. Picos de Ingresos */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <DollarSign className="h-5 w-5 text-green-500" />
                                    Picos de Ingresos por Día
                                </CardTitle>
                                <CardDescription>Volumen financiero generado por cierres exitosos</CardDescription>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-bold text-green-600">${kpis.totalProfit.toLocaleString()}</div>
                                <div className="text-[10px] text-muted-foreground uppercase font-semibold">Total Acumulado</div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendMetrics.revenuePeaks}>
                                    <defs>
                                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                                    <XAxis
                                        dataKey="date"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10 }}
                                        tickFormatter={(val) => val.split('-').slice(1).reverse().join('/')}
                                    />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value: number) => [`$${value.toLocaleString()}`, 'Ingreso']}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="value"
                                        stroke="#10b981"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorRev)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* 4. Rendimiento de Campañas */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Target className="h-5 w-5 text-purple-500" />
                            Distribución por Campaña
                        </CardTitle>
                        <CardDescription>Ranking de efectividad de las campañas detectadas</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="border rounded-xl overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted/50 text-muted-foreground font-medium border-b text-[10px] uppercase">
                                    <tr>
                                        <th className="px-6 py-4">Campaña</th>
                                        <th className="px-6 py-4 text-center">Leads Totales</th>
                                        <th className="px-6 py-4">Proporción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {trendMetrics.campaignList.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="px-6 py-10 text-center text-muted-foreground">
                                                No se han detectado campañas en este periodo.
                                            </td>
                                        </tr>
                                    ) : (
                                        trendMetrics.campaignList.map((camp: any) => {
                                            const pct = campaignTotal > 0 ? Math.round((camp.value / campaignTotal) * 100) : 0;
                                            return (
                                                <tr key={camp.name} className="border-b hover:bg-muted/30">
                                                    <td className="px-6 py-4 font-medium flex items-center gap-3">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                                        {camp.name}
                                                    </td>
                                                    <td className="px-6 py-4 text-center font-bold text-primary">
                                                        {camp.value}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-purple-500 rounded-full"
                                                                    style={{ width: `${pct}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-[10px] font-bold text-muted-foreground w-8">
                                                                {pct}%
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
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

export default TrendLayer;
