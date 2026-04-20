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

import { useDashboardContext } from "@/context/DashboardDataContext";

const OperationalEfficiency = () => {
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

    const { leadsSinRespuesta, leadsWithOwnerPercentage, agingData, trafficData } = data.operationalMetrics || {
        leadsSinRespuesta: 0,
        leadsWithOwnerPercentage: 0,
        agingData: [],
        trafficData: []
    };

    return (
        <div className="space-y-6">
            {/* Operational KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-500" />
                            T. Mediano Respuesta
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{Math.round(data.responseTime || 0)} min</div>
                        <p className="text-xs text-muted-foreground mt-1">Incluye ~60s de procesamiento bot</p>
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
                        <p className="text-xs text-muted-foreground mt-1">Nadie respondió al cliente aún</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-indigo-500" />
                            Leads con Responsable
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{leadsWithOwnerPercentage}%</div>
                        <p className="text-xs text-muted-foreground mt-1">Asignación por Agente o Atributo</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Aging Chart */}
                <Card className="h-fit">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Zap className="h-5 w-5 text-primary" />
                            Antigüedad del Pipeline (Aging)
                        </CardTitle>
                        <CardDescription>Días transcurridos desde creación de lead</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[250px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={agingData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                                    <XAxis dataKey="range" axisLine={false} tickLine={false} fontSize={12} />
                                    <YAxis axisLine={false} tickLine={false} fontSize={12} />
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
                <Card className="h-fit">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Users className="h-5 w-5 text-primary" />
                            Desempeño por Responsable
                        </CardTitle>
                        <CardDescription>Incluye Agentes y Responsables Manuales</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {(data.ownerPerformance || []).slice(0, 5).map((agent: any) => (
                                <div key={agent.name} className="flex items-center justify-between p-2.5 border rounded-lg hover:bg-muted/50 transition-colors">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-sm">{agent.name}</span>
                                        <span className="text-[10px] text-muted-foreground uppercase">{agent.leads} LEADS ASIGNADOS</span>
                                    </div>
                                    <div className="flex gap-6 text-sm">
                                        <div className="flex flex-col text-right">
                                            <span className="text-muted-foreground text-[10px] uppercase font-bold">Citas</span>
                                            <span className="font-bold text-primary">{agent.appointments}</span>
                                        </div>
                                        <div className="flex flex-col text-right">
                                            <span className="text-muted-foreground text-[10px] uppercase font-bold">WR</span>
                                            <span className={agent.winRate > 15 ? "text-green-600 font-bold" : "text-amber-600 font-bold"}>{agent.winRate}%</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {(!data.ownerPerformance || data.ownerPerformance.length === 0) && (
                                <div className="py-12 text-center text-muted-foreground italic text-sm">
                                    Sin datos de desempeño por el momento.
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Traffic Peaks Chart */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Clock className="h-5 w-5 text-primary" />
                        Horas Pico de Tráfico
                    </CardTitle>
                    <CardDescription>Distribución de contactos por hora para optimización de turnos</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[300px] w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={trafficData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                                <XAxis
                                    dataKey="hour"
                                    axisLine={false}
                                    tickLine={false}
                                    fontSize={10}
                                    interval={1}
                                />
                                <YAxis axisLine={false} tickLine={false} fontSize={10} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default OperationalEfficiency;
