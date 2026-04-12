import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Loader2, Zap, Clock, ShieldCheck, AlertCircle, UserCheck, Users } from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts";

const OperationalEfficiency = () => {
    const [selectedMonth, setSelectedMonth] = useState<Date | null>(null);
    const { loading, error, data } = useDashboardData(selectedMonth);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const { slaPercentage, leadsSinRespuesta, leadsWithOwnerPercentage, agingData } = data.operationalMetrics || {
        slaPercentage: 0,
        leadsSinRespuesta: 0,
        leadsWithOwnerPercentage: 0,
        agingData: []
    };

    return (
        <div className="space-y-6">
            {/* Operational KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-500" />
                            T. Mediano Respuesta
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{Math.round(data.responseTime || 0)} min</div>
                        <p className="text-xs text-muted-foreground mt-1">Meta: &lt; 10 min</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-green-500" />
                            Cumplimiento SLA
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{slaPercentage}%</div>
                        <p className="text-xs text-muted-foreground mt-1">Dentro del horario objetivo</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-red-500" />
                            Leads sin Respuesta
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{leadsSinRespuesta}</div>
                        <p className="text-xs text-muted-foreground mt-1">Pendientes de seguimiento</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-indigo-500" />
                            Leads con Owner
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{leadsWithOwnerPercentage}%</div>
                        <p className="text-xs text-muted-foreground mt-1">Asignación de carga</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Aging Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-primary" />
                            Antigüedad del Pipeline (Aging)
                        </CardTitle>
                        <CardDescription>Distribución de leads activos por días desde su creación</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={agingData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                                    <XAxis dataKey="range" axisLine={false} tickLine={false} />
                                    <YAxis axisLine={false} tickLine={false} />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                        {agingData.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Efficiency by Agent Table */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-primary" />
                            Desempeño por Responsable
                        </CardTitle>
                        <CardDescription>Principales métricas por agente/bot</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {(data.ownerPerformance || []).map((agent: any) => (
                                <div key={agent.name} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                    <div className="flex flex-col">
                                        <span className="font-medium">{agent.name}</span>
                                        <span className="text-xs text-muted-foreground">{agent.leads} leads asignados</span>
                                    </div>
                                    <div className="flex gap-8 text-sm">
                                        <div className="flex flex-col text-right">
                                            <span className="text-muted-foreground text-[10px] uppercase font-bold">SLA</span>
                                            <span className={agent.winRate > 85 ? "text-green-600 font-bold" : "text-amber-600 font-bold"}>{agent.winRate}%</span>
                                        </div>
                                        <div className="flex flex-col text-right">
                                            <span className="text-muted-foreground text-[10px] uppercase font-bold">Respuesta</span>
                                            <span>{Math.round(data.responseTime)}m</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {(!data.ownerPerformance || data.ownerPerformance.length === 0) && (
                                <div className="py-12 text-center text-muted-foreground italic">
                                    Sin datos de desempeño por el momento.
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default OperationalEfficiency;
