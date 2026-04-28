import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Loader2, ArrowRight, Filter, TrendingDown, Percent, Info, Activity, History, DollarSign } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    FunnelChart,
    Funnel,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    Cell,
    LabelList
} from "recharts";

import { useDashboardContext } from "@/context/DashboardDataContext";

const MetricInfo = ({ text }: { text: string }) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <button
                type="button"
                className="order-last inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Informacion de la metrica"
            >
                <Info className="h-3.5 w-3.5" />
            </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-xs leading-relaxed">
            {text}
        </TooltipContent>
    </Tooltip>
);

const FunnelLayer = () => {
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
                Error: {error}
            </div>
        );
    }

    const { kpis, historicalFunnelData } = data;

    // Conversion Calculations (Based on Historical, since that represents the true progress)
    const getConversion = (current: number, previous: number) => {
        if (previous === 0) return 0;
        return Math.round((current / previous) * 100);
    };

    const historicalSql = historicalFunnelData?.[0]?.value || 0;
    const historicalAppointment = historicalFunnelData?.[1]?.value || 0;
    const historicalSale = historicalFunnelData?.[2]?.value || 0;

    const convTotalToSql = getConversion(historicalSql, kpis.totalLeads);
    const convSqlToAppointment = getConversion(historicalAppointment, historicalSql);
    const convAppointmentToSale = getConversion(historicalSale, historicalAppointment);
    const convTotalToAppointment = getConversion(historicalAppointment, kpis.totalLeads);

    return (
        <div className="space-y-10">
            {/* RENDIMIENTO HISTÓRICO (FUNNEL) */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                    <History className="h-6 w-6 text-emerald-500" />
                    <div>
                        <h2 className="text-xl font-bold tracking-tight">Embudo Orgánico de Conversión (Histórico)</h2>
                        <p className="text-sm text-muted-foreground">Flujo acumulativo demostrando todos los Leads que probaron alcanzar una etapa en su vida útil, permitiendo conocer las tasas de cierre exactas.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Visual Funnel Chart */}
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Filter className="h-5 w-5 text-emerald-500" />
                                Embudo de Conversión
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[400px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <FunnelChart margin={{ top: 12, right: 140, bottom: 12, left: 12 }}>
                                        <RechartsTooltip
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Funnel
                                            dataKey="value"
                                            data={[
                                                { label: "Total Procesados", value: kpis.totalLeads, color: "#64748b" },
                                                ...(historicalFunnelData || [])
                                            ]}
                                            isAnimationActive
                                        >
                                            <LabelList position="right" fill="#334155" stroke="none" dataKey="label" offset={12} />
                                            <LabelList position="center" fill="#fff" stroke="none" dataKey="value" style={{ fontWeight: 'bold' }} />
                                            {[...Array(4)].map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={index === 0 ? "#64748b" : historicalFunnelData?.[index - 1]?.color || "#000"} />
                                            ))}
                                        </Funnel>
                                    </FunnelChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Conversion Stats */}
                    <div className="space-y-6">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <Percent className="h-4 w-4 text-indigo-500" />
                                    <MetricInfo text="Calculado usando la información histórica de todos los tags. Porcentaje puro de los que logran pasar el filtro de SQL." />
                                    Tasa Orgánica de Calificación
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{convTotalToSql}%</div>
                                <p className="text-xs text-muted-foreground mt-1">Leads que conectan para buscar información</p>
                                <div className="w-full bg-secondary h-1.5 rounded-full mt-3 overflow-hidden">
                                    <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${convTotalToSql}%` }} />
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <TrendingDown className="h-4 w-4 text-emerald-500" />
                                    <MetricInfo text="Mide cuántos SQLs orgánicos se transforman en Citas efectivas durante todo el ciclo de maduración del prospecto." />
                                    Conversión pura a Cita
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{convSqlToAppointment}%</div>
                                <p className="text-xs text-muted-foreground mt-1">SQLs que llegan a agenda</p>
                                <div className="w-full bg-secondary h-1.5 rounded-full mt-3 overflow-hidden">
                                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${convSqlToAppointment}%` }} />
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <DollarSign className="h-4 w-4 text-emerald-600" />
                                    <MetricInfo text="Determina el exito definitivo analizando cuántas Citas registradas se pagaron exitosamente." />
                                    Conversión Orgánica a Venta
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{convAppointmentToSale}%</div>
                                <p className="text-xs text-muted-foreground mt-1">Citas efectivas finalizadas en venta</p>
                                <div className="w-full bg-secondary h-1.5 rounded-full mt-3 overflow-hidden">
                                    <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${convAppointmentToSale}%` }} />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Micro-Funnel Detail */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 py-4">
                    <div className="relative flex flex-col items-center p-4 bg-card border rounded-xl">
                        <span className="text-xs text-muted-foreground font-medium uppercase">TOTAL PROCESADOS</span>
                        <span className="text-2xl font-bold mt-1 text-foreground">{kpis.totalLeads}</span>
                        <span className="text-xs text-muted-foreground mt-2 opacity-0">.</span>
                        <div className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 bg-background border rounded-full p-1 shadow-sm hidden md:block">
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        </div>
                    </div>
                    {/* Llegaron a SQL */}
                    <div className="relative flex flex-col items-center p-4 bg-card border rounded-xl">
                        <span className="text-xs text-muted-foreground font-medium uppercase">Llegaron a SQL</span>
                        <span className="text-2xl font-bold mt-1 text-foreground">{historicalSql}</span>
                        <span className="text-xs text-rose-500 mt-2 font-medium">⬇ {kpis.totalLeads - historicalSql} abandonaron (antes de SQL)</span>
                        <div className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 bg-background border rounded-full p-1 shadow-sm hidden md:block">
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        </div>
                    </div>
                    {/* Alcanzaron Cita */}
                    <div className="relative flex flex-col items-center p-4 bg-card border rounded-xl">
                        <span className="text-xs text-muted-foreground font-medium uppercase">Alcanzaron Cita</span>
                        <span className="text-2xl font-bold mt-1 text-foreground">{historicalAppointment}</span>
                        <span className="text-xs text-rose-500 mt-2 font-medium">⬇ {historicalSql - historicalAppointment} se quedaron en SQL</span>
                        <div className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 bg-background border rounded-full p-1 shadow-sm hidden md:block">
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        </div>
                    </div>
                    {/* Cerraron Venta */}
                    <div className="relative flex flex-col items-center p-4 bg-primary/10 border-primary/20 border rounded-xl shadow-inner">
                        <span className="text-xs text-primary font-bold uppercase">Cerraron Venta (WIN)</span>
                        <span className="text-2xl font-bold mt-1 text-primary">{historicalSale}</span>
                        <span className="text-xs text-rose-500 mt-2 font-medium">⬇ {historicalAppointment - historicalSale} se cayeron tras Cita</span>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default FunnelLayer;
