import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import {
    Loader2,
    TrendingUp,
    Calendar,
    ArrowUpRight,
    ArrowDownRight,
    LineChart as LineChartIcon
} from "lucide-react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    AreaChart,
    Area
} from "recharts";

const TrendLayer = () => {
    const [selectedMonth, setSelectedMonth] = useState<Date | null>(null);
    const { loading, error, data } = useDashboardData(selectedMonth);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const { monthlyTrend, kpis, responseTime } = data;

    let growth = { leads: 0, conversions: 0, responseTime: 0 };
    if (monthlyTrend && monthlyTrend.length >= 2) {
        const current = monthlyTrend[monthlyTrend.length - 1];
        const prev = monthlyTrend[monthlyTrend.length - 2];
        const calcGrowth = (curr: number, prior: number) => prior === 0 ? 100 : Math.round(((curr - prior) / prior) * 100);

        const currConv = current.leads > 0 ? (current.appointments / current.leads) * 100 : 0;
        const prevConv = prev.leads > 0 ? (prev.appointments / prev.leads) * 100 : 0;

        growth = {
            leads: calcGrowth(current.leads, prev.leads),
            conversions: Math.round(currConv - prevConv),
            responseTime: 0 // Placeholder
        };
    }

    return (
        <div className="space-y-6">
            {/* Quick Delta Insights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Leads vs Periodo Anterior</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-baseline gap-2">
                            <div className="text-2xl font-bold">{kpis?.totalLeads?.toLocaleString() || 0}</div>
                            <div className={`flex items-center text-xs font-medium ${growth.leads >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {growth.leads >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                {Math.abs(growth.leads)}%
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Conversión vs Periodo Anterior</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-baseline gap-2">
                            <div className="text-2xl font-bold">{kpis?.schedulingRate || 0}%</div>
                            <div className={`flex items-center text-xs font-medium ${growth.conversions >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {growth.conversions >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                {Math.abs(growth.conversions)}%
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Mejora Tiempo Respuesta</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-baseline gap-2">
                            <div className="text-2xl font-bold">{Math.round(responseTime || 0)} min</div>
                            <div className={`flex items-center text-xs font-medium ${growth.responseTime >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {growth.responseTime >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                {Math.abs(growth.responseTime)}%
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Volume Trend Chart */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <LineChartIcon className="h-5 w-5 text-primary" />
                        Evolución Temporal
                    </CardTitle>
                    <CardDescription>Flujo semanal de leads, SQLs y citas agendadas</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[400px] w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={monthlyTrend}>
                                <defs>
                                    <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend verticalAlign="top" height={36} />
                                <Area
                                    type="monotone"
                                    name="Leads Totales"
                                    dataKey="leads"
                                    stroke="#3b82f6"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorLeads)"
                                />
                                <Area
                                    type="monotone"
                                    name="Citas Agendadas"
                                    dataKey="appointments"
                                    stroke="#10b981"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorSales)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Comparison Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-primary" />
                        Histórico por Semana
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted/50 text-muted-foreground font-medium border-b text-[10px] uppercase">
                                <tr>
                                    <th className="px-6 py-4">Periodo</th>
                                    <th className="px-6 py-4">Leads</th>
                                    <th className="px-6 py-4">SQLs</th>
                                    <th className="px-6 py-4">Citas</th>
                                    <th className="px-6 py-4">Cierres</th>
                                    <th className="px-6 py-4">Tasa Conv.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {monthlyTrend.map((row) => (
                                    <tr key={row.date} className="border-b hover:bg-muted/30">
                                        <td className="px-6 py-4 font-medium">{row.date}</td>
                                        <td className="px-6 py-4">{row.leads}</td>
                                        <td className="px-6 py-4">{row.sqls}</td>
                                        <td className="px-6 py-4">{row.appointments}</td>
                                        <td className="px-6 py-4">{row.closedSales || 0}</td>
                                        <td className="px-6 py-4 font-bold text-primary">
                                            {row.leads > 0 ? Math.round((row.appointments / row.leads) * 100) : 0}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default TrendLayer;
