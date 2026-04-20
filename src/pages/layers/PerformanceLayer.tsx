import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import {
    Loader2,
    Users,
    Target,
    Trophy,
    TrendingUp,
    DollarSign,
    Zap,
    MousePointerClick,
    BarChart3
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
    LabelList
} from "recharts";

import { useDashboardContext } from "@/context/DashboardDataContext";
import { KPICard } from "@/components/dashboard/KPICard";

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

    const conversionData = [
        { name: "Seguimiento Humano", value: humanMetrics.followup, color: "#6366f1" },
        { name: "Citas Agendadas", value: humanMetrics.appointments, color: "#10b981" }
    ];

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }).format(value);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Rendimiento Humano</h2>
                    <p className="text-muted-foreground">Análisis de conversión y efectividad del equipo comercial</p>
                </div>
            </div>

            {/* Main Human KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KPICard
                    title="Leads en Seguimiento"
                    value={humanMetrics.followup.toLocaleString()}
                    subtitle="Etiqueta seguimiento_humano"
                    icon={Users}
                    variant="primary"
                />
                <KPICard
                    title="Citas Agendadas"
                    value={humanMetrics.appointments.toLocaleString()}
                    subtitle="Etiqueta cita_agendada_humano"
                    icon={Target}
                    variant="accent"
                />
                <KPICard
                    title="Tasa de Cierre (Humano)"
                    value={`${humanMetrics.conversionRate}%`}
                    subtitle="Citas / (Seguimiento + Citas)"
                    icon={TrendingUp}
                    variant="success"
                />
                <KPICard
                    title="Ventas Exitosas"
                    value={humanMetrics.salesCount.toLocaleString()}
                    subtitle="Etiqueta venta_exitosa"
                    icon={Trophy}
                    variant="success"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Comparison Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-amber-500" />
                            Comparativa: Seguimiento vs Citas
                        </CardTitle>
                        <CardDescription>Visualización del embudo de gestión humana</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={conversionData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                    <YAxis hide />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar dataKey="value" barSize={60} radius={[8, 8, 0, 0]}>
                                        {conversionData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                        <LabelList dataKey="value" position="top" style={{ fontWeight: 'bold' }} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Sales Volume / Impact */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-emerald-500" />
                            Impacto por Ventas Exitosas
                        </CardTitle>
                        <CardDescription>Resumen financiero de leads con cierre comercial</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col justify-center h-[300px]">
                        <div className="space-y-6 text-center">
                            <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 inline-block px-12">
                                <p className="text-sm font-medium text-emerald-600 uppercase tracking-wider mb-2">Volumen Total Vendido</p>
                                <p className="text-5xl font-extrabold text-emerald-700 font-display">
                                    {formatCurrency(humanMetrics.salesVolume)}
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl bg-muted/50">
                                    <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Tiket Promedio</p>
                                    <p className="text-xl font-bold">
                                        {formatCurrency(humanMetrics.salesCount > 0 ? humanMetrics.salesVolume / humanMetrics.salesCount : 0)}
                                    </p>
                                </div>
                                <div className="p-4 rounded-xl bg-muted/50">
                                    <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Total Leads</p>
                                    <p className="text-xl font-bold">{humanMetrics.salesCount}</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Additional Context Card */}
            <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                        <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                            <BarChart3 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h4 className="font-bold text-primary mb-1">Analítica de Gestión</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Esta vista se sincroniza con las etiquetas <code className="bg-background px-1 rounded">seguimiento_humano</code>,
                                <code className="bg-background px-1 rounded">cita_agendada_humano</code> y
                                <code className="bg-background px-1 rounded">venta_exitosa</code>. Los datos financieros se extraen
                                del campo <code className="bg-background px-1 rounded">monto_operacion</code> en los atributos personalizados.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default PerformanceLayer;
