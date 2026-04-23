import { useState } from "react";
import { startOfMonth, endOfMonth } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Loader2, ArrowRight, Filter, TrendingDown, Percent, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
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

    const { kpis } = data;

    // Funnel Data Construction
    // Stage 1: Total Leads
    // Stage 2: SQLs (Interested)
    // Stage 3: Scheduled (Citas)
    // Stage 4: Won (Ventas)
    const funnelData = [
        { name: "Total Leads", value: kpis.totalLeads, color: "#94a3b8" },
        { name: "SQLs (Calificados)", value: kpis.interestedLeads, color: "#6366f1" },
        { name: "Citas Agendadas", value: kpis.scheduledAppointments, color: "#10b981" },
        { name: "Ventas Exitosas", value: kpis.closedSales || 0, color: "#f59e0b" },
    ];

    // Conversion Calculations
    const getConversion = (current: number, previous: number) => {
        if (previous === 0) return 0;
        return Math.round((current / previous) * 100);
    };

    const convTotalToSql = getConversion(funnelData[1].value, funnelData[0].value);
    const convSqlToAppointment = getConversion(funnelData[2].value, funnelData[1].value);
    const convAppointmentToSale = getConversion(funnelData[3].value, funnelData[2].value);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Visual Funnel Chart */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Filter className="h-5 w-5 text-primary" />
                            Embudo de Ventas (Funnel)
                        </CardTitle>
                        <CardDescription>Visualización del proceso comercial desde el primer contacto</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[400px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    layout="vertical"
                                    data={funnelData}
                                    margin={{ top: 5, right: 80, left: 20, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} strokeOpacity={0.1} />
                                    <XAxis type="number" hide />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        width={120}
                                        tick={{ fontSize: 12, fontWeight: 500 }}
                                    />
                                    <RechartsTooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar dataKey="value" barSize={45} radius={[0, 4, 4, 0]}>
                                        {funnelData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                        <LabelList dataKey="value" position="right" offset={10} style={{ fontWeight: 'bold' }} />
                                    </Bar>
                                </BarChart>
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
                                <MetricInfo text="Este porcentaje representa el total de leads que se vuelven SQLs." />
                                Tasa de Calificación
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{convTotalToSql}%</div>
                            <p className="text-xs text-muted-foreground mt-1">Leads que se vuelven SQLs</p>
                            <div className="w-full bg-secondary h-1.5 rounded-full mt-3 overflow-hidden">
                                <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${convTotalToSql}%` }} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <TrendingDown className="h-4 w-4 text-emerald-500" />
                                <MetricInfo text="Este porcentaje representa el total de SQLs que se convierten en citas." />
                                Conversión a Cita
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{convSqlToAppointment}%</div>
                            <p className="text-xs text-muted-foreground mt-1">SQLs que llegan a agendar</p>
                            <div className="w-full bg-secondary h-1.5 rounded-full mt-3 overflow-hidden">
                                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${convSqlToAppointment}%` }} />
                            </div>
                        </CardContent>
                    </Card>

                </div>
            </div>

            {/* Micro-Funnel Detail */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 py-4">
                {funnelData.slice(0, -1).map((stage, i) => (
                    <div key={stage.name} className="relative flex flex-col items-center p-4 bg-card border rounded-xl">
                        <span className="text-xs text-muted-foreground font-medium uppercase">{stage.name}</span>
                        <span className="text-xl font-bold mt-1 text-foreground">{stage.value}</span>
                        {i < 2 && (
                            <div className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 bg-background border rounded-full p-1 shadow-sm hidden md:block">
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            </div>
                        )}
                    </div>
                ))}
                <div className="flex flex-col items-center p-4 bg-primary/10 border-primary/20 border rounded-xl">
                    <span className="text-xs text-primary font-medium uppercase">Win Rate Final</span>
                    <span className="text-xl font-bold mt-1 text-primary">{convAppointmentToSale}%</span>
                </div>
            </div>
        </div>
    );
};

export default FunnelLayer;
