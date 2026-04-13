import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { Loader2, Database, LineChart as LineChartIcon } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const HistoricalTrendLayer = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [historicalData, setHistoricalData] = useState<any[]>([]);
    const [stats, setStats] = useState({ totalSyncLeads: 0, firstSyncDate: "" });

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                setLoading(true);
                // Fetch all raw conversations from Supabase
                const { data, error } = await supabase
                    .schema('cw')
                    .from('conversations_current')
                    .select('chatwoot_conversation_id, status, labels, created_at_chatwoot');

                if (error) throw error;

                if (!data || data.length === 0) {
                    setHistoricalData([]);
                    return;
                }

                setStats({
                    totalSyncLeads: data.length,
                    firstSyncDate: new Date(Math.min(...data.filter(d => d.created_at_chatwoot).map(d => new Date(d.created_at_chatwoot).getTime()))).toLocaleDateString()
                });

                // Group by month
                const trendMap = new Map<string, { date: string, leads: number, sqls: number, appointments: number, timestamp: number }>();

                data.forEach(conv => {
                    if (!conv.created_at_chatwoot) return;
                    const d = new Date(conv.created_at_chatwoot);
                    const monthKey = d.toLocaleString('es-ES', { month: 'short', year: '2-digit' });
                    const monthTs = new Date(d.getFullYear(), d.getMonth(), 1).getTime();

                    if (!trendMap.has(monthKey)) {
                        trendMap.set(monthKey, { date: monthKey, leads: 0, sqls: 0, appointments: 0, timestamp: monthTs });
                    }
                    const stat = trendMap.get(monthKey)!;
                    stat.leads++;

                    const lbls = Array.isArray(conv.labels) ? conv.labels : (conv.labels ? [conv.labels] : []);

                    if (lbls.some(l => ['interesado', 'crear_confianza', 'crear_urgencia'].includes(l))) {
                        stat.sqls++;
                    }
                    if (lbls.some(l => ['cita_agendada', 'cita'].includes(l))) {
                        stat.appointments++;
                    }
                });

                const sortedTrend = Array.from(trendMap.values()).sort((a, b) => a.timestamp - b.timestamp);
                setHistoricalData(sortedTrend);

            } catch (err: any) {
                console.error("Supabase fetch error:", err);
                setError(err.message || "Error conectando con Supabase o el schema cw no está expuesto.");
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-red-500 bg-red-50 rounded-xl p-8 border border-red-200">
                <Database className="h-12 w-12 mb-4 opacity-50" />
                <h3 className="text-lg font-bold">Error de Conexión Supabase</h3>
                <p className="mt-2 text-center max-w-md">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl flex items-start gap-4">
                <Database className="h-6 w-6 text-amber-600 mt-1" />
                <div>
                    <h3 className="font-bold text-amber-700">Modo: Tendencia Histórica (Larga Vida)</h3>
                    <p className="text-sm text-amber-600/80">
                        Esta capa está conectada directamente al Data Warehouse (Supabase <code>cw</code>), leyendo todo el historial
                        sincronizado independientemente de la ventana límite de la API de Chatwoot.
                    </p>
                    <div className="mt-2 flex gap-4 text-xs font-semibold text-amber-700">
                        <span>Registros Sincronizados: {stats.totalSyncLeads.toLocaleString()}</span>
                        <span>Dato más antiguo: {stats.firstSyncDate}</span>
                    </div>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <LineChartIcon className="h-5 w-5 text-primary" />
                        Evolución Histórica Completa
                    </CardTitle>
                    <CardDescription>Flujo de leads y citas agendadas desde el inicio de operaciones sincronizadas en DW</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[400px] w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={historicalData}>
                                <defs>
                                    <linearGradient id="colorHistoryLeads" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorHistorySales" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
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
                                    name="Histórico Leads"
                                    dataKey="leads"
                                    stroke="#8b5cf6"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorHistoryLeads)"
                                />
                                <Area
                                    type="monotone"
                                    name="Histórico Citas"
                                    dataKey="appointments"
                                    stroke="#f59e0b"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorHistorySales)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-primary" />
                        Datos Consolidados (DW)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted/50 text-muted-foreground font-medium border-b text-[10px] uppercase">
                                <tr>
                                    <th className="px-6 py-4">Mes</th>
                                    <th className="px-6 py-4">Leads DW</th>
                                    <th className="px-6 py-4">SQLs DW</th>
                                    <th className="px-6 py-4">Citas DW</th>
                                    <th className="px-6 py-4">Conversión Cita</th>
                                </tr>
                            </thead>
                            <tbody>
                                {historicalData.map((row) => (
                                    <tr key={row.date} className="border-b hover:bg-muted/30">
                                        <td className="px-6 py-4 font-medium">{row.date}</td>
                                        <td className="px-6 py-4">{row.leads}</td>
                                        <td className="px-6 py-4">{row.sqls}</td>
                                        <td className="px-6 py-4">{row.appointments}</td>
                                        <td className="px-6 py-4 font-bold text-amber-600">
                                            {row.leads > 0 ? Math.round((row.appointments / row.leads) * 100) : 0}%
                                        </td>
                                    </tr>
                                ))}
                                {historicalData.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">No hay datos históricos en la base de datos</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default HistoricalTrendLayer;
