import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import {
    Loader2,
    BarChart3,
    Smartphone,
    Globe,
    User,
    Target,
    Trophy,
    Percent
} from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    Cell
} from "recharts";

const PerformanceLayer = () => {
    const [selectedMonth, setSelectedMonth] = useState<Date | null>(null);
    const { loading, error, data } = useDashboardData(selectedMonth);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const channelData = data.channelData.map(c => ({
        name: c.name,
        leads: c.count,
        conversions: data.recentAppointments.filter(app => app.channel === c.name).length, // approximate if not direct
        color: c.name === "WhatsApp" ? "#22c55e" : (c.name === "Facebook" ? "#2563eb" : "#ec4899")
    }));

    const campaignData = [
        { name: "Promo Marzo", leads: data.kpis.totalLeads, rate: data.kpis.responseRate },
    ];

    const owners = data.ownerPerformance || [];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Channel performance */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Globe className="h-5 w-5 text-primary" />
                            Rendimiento por Canal
                        </CardTitle>
                        <CardDescription>Leads vs Conversiones por punto de entrada</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={channelData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                    <YAxis axisLine={false} tickLine={false} />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend />
                                    <Bar name="Total Leads" dataKey="leads" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                                    <Bar name="Conversiones" dataKey="conversions" radius={[4, 4, 0, 0]}>
                                        {channelData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Campaign performance table */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Target className="h-5 w-5 text-primary" />
                            Top Campañas
                        </CardTitle>
                        <CardDescription>Efectividad comercial por campaña activa</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {campaignData.sort((a, b) => b.rate - a.rate).map((camp) => (
                                <div key={camp.name} className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="flex flex-col">
                                        <span className="font-medium">{camp.name}</span>
                                        <span className="text-xs text-muted-foreground">{camp.leads} leads generados</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-primary">{camp.rate}%</div>
                                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">Tasa Conv.</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Owner Ranking */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-amber-500" />
                        Ranking de Responsables
                    </CardTitle>
                    <CardDescription>Líderes de conversión del equipo comercial</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {owners.slice(0, 3).map((owner: any, idx: number) => (
                            <div key={owner.name} className="relative p-6 border rounded-2xl bg-muted/30 overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <User className="h-16 w-16" />
                                </div>
                                <div className="relative">
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                                            #{idx + 1}
                                        </span>
                                        <h4 className="font-bold">{owner.name}</h4>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase font-bold">Citas</p>
                                            <p className="text-xl font-bold">{owner.appointments}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase font-bold">Win Rate</p>
                                            <p className="text-xl font-bold text-green-600">{owner.winRate}%</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-muted-foreground/10">
                                        <div className="flex justify-between text-xs mb-1">
                                            <span>Score de Calidad</span>
                                            <span className="font-bold">{owner.score}%</span>
                                        </div>
                                        <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                                            <div className="bg-primary h-full" style={{ width: `${owner.score}%` }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {owners.length === 0 && (
                            <div className="col-span-full py-12 text-center text-muted-foreground">
                                No hay datos de responsables asignados actualmente.
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default PerformanceLayer;
