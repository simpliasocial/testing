import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import {
    Loader2,
    Database,
    TrendingUp,
    Clock,
    Filter,
    Download,
    Calendar,
    BarChart3,
    AlertCircle,
    CheckCircle2,
    Users,
    Target,
    Zap,
    LayoutDashboard,
    Activity
} from "lucide-react";
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    BarChart as ReBarChart,
    Bar,
    LineChart,
    Line,
    ReferenceLine,
    ComposedChart
} from "recharts";
import { Button } from "@/components/ui/button";
import { channelLabelFromType } from "@/lib/leadDisplay";

const HistoricalTrendLayer = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [rawData, setRawData] = useState<any[]>([]);
    const [stats, setStats] = useState({ totalSyncLeads: 0, firstSyncDate: "" });

    // Filters
    const [timeGrain, setTimeGrain] = useState<'monthly' | 'weekly'>('monthly');
    const [selectedYear, setSelectedYear] = useState<string>('all');
    const [selectedChannel, setSelectedChannel] = useState<string>('all');

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                setLoading(true);
                // Fetch all raw conversations from Supabase
                const { data, error } = await supabase
                    .schema('cw')
                    .from('conversations_current')
                    .select('*');

                if (error) throw error;

                if (!data || data.length === 0) {
                    setRawData([]);
                    return;
                }

                setRawData(data);

                const dates = data.filter(d => d.created_at_chatwoot).map(d => new Date(d.created_at_chatwoot).getTime());
                setStats({
                    totalSyncLeads: data.length,
                    firstSyncDate: dates.length > 0 ? new Date(Math.min(...dates)).toLocaleDateString() : "N/A"
                });

            } catch (err: any) {
                console.error("Historical trend fetch error:", err);
                setError("No se pudo cargar el historial. Intenta nuevamente.");
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, []);

    const filteredData = useMemo(() => {
        return rawData.filter(d => {
            if (!d.created_at_chatwoot) return false;
            const date = new Date(d.created_at_chatwoot);
            const matchesYear = selectedYear === 'all' || date.getFullYear().toString() === selectedYear;
            const channelName = channelLabelFromType(undefined, d.canal);
            const matchesChannel = selectedChannel === 'all' || channelName === selectedChannel;
            return matchesYear && matchesChannel;
        });
    }, [rawData, selectedYear, selectedChannel]);

    const aggregatedData = useMemo(() => {
        const map = new Map<string, {
            date: string,
            leads: number,
            contacted: number,
            interested: number,
            appointments: number,
            lost: number,
            backlog: number,
            responseTimes: number[],
            slaBreaches: number,
            timestamp: number
        }>();

        filteredData.forEach(conv => {
            const d = new Date(conv.created_at_chatwoot);
            let key = "";
            let ts = 0;

            if (timeGrain === 'monthly') {
                key = d.toLocaleString('es-ES', { month: 'short', year: '2-digit' });
                ts = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
            } else {
                // ISO Week
                const startOfYear = new Date(d.getFullYear(), 0, 1);
                const days = Math.floor((d.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
                const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
                key = `S${weekNumber}-${d.getFullYear().toString().slice(2)}`;
                ts = d.getTime() - (d.getDay() * 24 * 60 * 60 * 1000);
            }

            if (!map.has(key)) {
                map.set(key, {
                    date: key,
                    leads: 0,
                    contacted: 0,
                    interested: 0,
                    appointments: 0,
                    lost: 0,
                    backlog: 0,
                    responseTimes: [],
                    slaBreaches: 0,
                    timestamp: ts
                });
            }

            const row = map.get(key)!;
            row.leads++;

            if (conv.status !== 'resolved') {
                row.backlog++;
            }

            const lbls = Array.isArray(conv.labels) ? conv.labels : [];
            const isContacted = conv.first_reply_created_at || conv.status !== 'new';
            if (isContacted) row.contacted++;

            if (lbls.some((l: string) => ['interesado', 'crear_confianza', 'crear_urgencia'].includes(l.toLowerCase()))) {
                row.interested++;
            }

            if (lbls.some((l: string) => ['cita', 'venta', 'booking', 'cita_agendada', 'venta_exitosa'].includes(l.toLowerCase()))) {
                row.appointments++;
            }
            if (lbls.some((l: string) => ['perdido', 'descartado', 'spam', 'desinteresado'].includes(l.toLowerCase()))) {
                row.lost++;
            }

            // Metric: Median First Response Time
            if (conv.first_reply_created_at && conv.created_at_chatwoot) {
                const diff = (new Date(conv.first_reply_created_at).getTime() - new Date(conv.created_at_chatwoot).getTime()) / (1000 * 60);
                if (diff >= 0) row.responseTimes.push(diff);
                if (diff > 30) row.slaBreaches++; // Dummy SLA 30m
            }
        });

        const calculateMedian = (arr: number[]) => {
            if (arr.length === 0) return 0;
            const sorted = [...arr].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        };

        return Array.from(map.values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(r => ({
                ...r,
                medianResponseTime: Number(calculateMedian(r.responseTimes).toFixed(1)),
                slaCompliance: r.leads > 0 ? Number(((1 - (r.slaBreaches / Math.max(1, r.responseTimes.length))) * 100).toFixed(1)) : 100,
                contactRate: r.leads > 0 ? Number(((r.contacted / r.leads) * 100).toFixed(1)) : 0,
                interestRate: r.contacted > 0 ? Number(((r.interested / r.contacted) * 100).toFixed(1)) : 0,
                bookingRate: r.interested > 0 ? Number(((r.appointments / r.interested) * 100).toFixed(1)) : 0,
                conversionRate: r.leads > 0 ? Number(((r.appointments / r.leads) * 100).toFixed(1)) : 0,
            }));
    }, [filteredData, timeGrain]);

    const summaryStats = useMemo(() => {
        let leads = filteredData.length;
        let appointments = 0;
        let backlog = 0;
        let slaBreaches = 0;
        const responseTimes: number[] = [];

        filteredData.forEach(conv => {
            const lbls = Array.isArray(conv.labels) ? conv.labels : [];
            if (lbls.some(l => ['cita', 'venta', 'booking', 'cita_agendada', 'venta_exitosa'].includes(l.toLowerCase()))) {
                appointments++;
            }
            if (conv.status !== 'resolved') {
                backlog++;
            }
            if (conv.first_reply_created_at && conv.created_at_chatwoot) {
                const diff = (new Date(conv.first_reply_created_at).getTime() - new Date(conv.created_at_chatwoot).getTime()) / (1000 * 60);
                if (diff >= 0) responseTimes.push(diff);
                if (diff > 30) slaBreaches++;
            }
        });

        const sortedRT = [...responseTimes].sort((a, b) => a - b);
        const medianRT = sortedRT.length > 0
            ? (sortedRT.length % 2 !== 0
                ? sortedRT[Math.floor(sortedRT.length / 2)]
                : (sortedRT[Math.floor(sortedRT.length / 2) - 1] + sortedRT[Math.floor(sortedRT.length / 2)]) / 2)
            : 0;

        const slaCompliance = responseTimes.length > 0 ? ((responseTimes.length - slaBreaches) / responseTimes.length) * 100 : 100;

        return {
            leads,
            appointments,
            conversion: leads > 0 ? (appointments / leads) * 100 : 0,
            medianRT: Number(medianRT.toFixed(1)),
            slaCompliance: Number(slaCompliance.toFixed(1)),
            avgBacklog: aggregatedData.length > 0 ? Math.round(backlog / aggregatedData.length) : 0
        };
    }, [filteredData, aggregatedData.length]);

    const exportToCSV = () => {
        const headers = ["Periodo", "Leads", "Citas/Ventas", "Perdidos", "Mediana Rpta (min)", "SLA %"];
        const rows = aggregatedData.map(r => [r.date, r.leads, r.appointments, r.lost, r.medianResponseTime, r.slaCompliance]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `Simplia_Historico.csv`);
        link.click();
    };

    const channels = useMemo(
        () => Array.from(new Set(rawData.map(d => channelLabelFromType(undefined, d.canal)).filter(channel => channel && channel !== "Otro"))),
        [rawData]
    );
    const years = useMemo(() => Array.from(new Set(rawData.map(d => new Date(d.created_at_chatwoot).getFullYear()))).sort(), [rawData]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-indigo-500/5 border border-indigo-500/10 p-6 rounded-2xl">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-indigo-500/10 rounded-xl">
                        <Database className="h-6 w-6 text-indigo-600" />
                    </div>
                    <div>
                        <h3 className="font-bold text-indigo-900 text-lg">Reporte de Tendencias Históricas</h3>
                        <p className="text-sm text-indigo-700/60 max-w-2xl">
                            Información histórica consolidada para analizar estacionalidad y comportamiento comercial por periodos amplios.
                        </p>
                        <div className="mt-3 flex gap-4 text-[10px] font-bold uppercase tracking-widest text-indigo-600">
                            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Historial activo</span>
                            <span>Leads: {stats.totalSyncLeads.toLocaleString()}</span>
                            <span>Desde: {stats.firstSyncDate}</span>
                        </div>
                    </div>
                </div>
                <Button onClick={exportToCSV} variant="outline" className="bg-white border-indigo-100 text-indigo-600 hover:bg-indigo-50 gap-2 shrink-0">
                    <Download className="h-4 w-4" />
                    Exportar CSV
                </Button>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Frecuencia</label>
                    <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-100">
                        <button onClick={() => setTimeGrain('monthly')} className={`flex-1 py-1 selection:px-2 rounded-md text-[10px] font-bold transition-all ${timeGrain === 'monthly' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>MENSUAL</button>
                        <button onClick={() => setTimeGrain('weekly')} className={`flex-1 py-1 selection:px-2 rounded-md text-[10px] font-bold transition-all ${timeGrain === 'weekly' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>SEMANAL</button>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Año</label>
                    <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-full bg-slate-50 border-none rounded-lg text-xs font-bold py-2 focus:ring-2 focus:ring-indigo-100">
                        <option value="all">TODOS</option>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Canal</label>
                    <select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)} className="w-full bg-slate-50 border-none rounded-lg text-xs font-bold py-2 focus:ring-2 focus:ring-indigo-100 uppercase">
                        <option value="all">TODOS LOS CANALES</option>
                        {channels.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                <Card className="bg-white border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Leads</p>
                            <Users className="h-4 w-4 text-indigo-500" />
                        </div>
                        <p className="text-2xl font-black text-indigo-700">{summaryStats.leads.toLocaleString()}</p>
                    </CardContent>
                </Card>
                <Card className="bg-white border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Citas Totales</p>
                            <Calendar className="h-4 w-4 text-emerald-500" />
                        </div>
                        <p className="text-2xl font-black text-emerald-600">{summaryStats.appointments.toLocaleString()}</p>
                    </CardContent>
                </Card>
                <Card className="bg-white border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Conversión Total</p>
                            <Target className="h-4 w-4 text-amber-500" />
                        </div>
                        <p className="text-2xl font-black text-amber-600">{summaryStats.conversion.toFixed(1)}%</p>
                    </CardContent>
                </Card>
                <Card className="bg-white border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Mediana Rpta</p>
                            <Clock className="h-4 w-4 text-sky-500" />
                        </div>
                        <p className="text-2xl font-black text-sky-600">{summaryStats.medianRT} min</p>
                    </CardContent>
                </Card>
                <Card className="bg-white border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">SLA Cumplido</p>
                            <CheckCircle2 className="h-4 w-4 text-teal-500" />
                        </div>
                        <p className="text-2xl font-black text-teal-600">{summaryStats.slaCompliance}%</p>
                    </CardContent>
                </Card>
                <Card className="bg-white border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Backlog Promed.</p>
                            <Activity className="h-4 w-4 text-rose-500" />
                        </div>
                        <p className="text-2xl font-black text-rose-600">{summaryStats.avgBacklog}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Layout Block 1: Business Trends */}
            <Card className="border-none shadow-sm overflow-hidden bg-white">
                <CardHeader className="pb-2 border-b border-slate-50">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <LayoutDashboard className="h-4 w-4 text-indigo-500" />
                        1. Tendencias de Negocio ({timeGrain})
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={aggregatedData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.05} />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Legend verticalAlign="top" align="right" iconType="circle" />
                                <Bar name="Leads" dataKey="leads" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
                                <Line type="monotone" name="Citas" dataKey="appointments" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                                <Line type="monotone" name="Perdidos" dataKey="lost" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4 }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Layout Block 2: Conversion Trends */}
            <Card className="border-none shadow-sm overflow-hidden bg-white">
                <CardHeader className="pb-2 border-b border-slate-50">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                        2. Tendencias de Conversión ({timeGrain})
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={aggregatedData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.05} />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} unit="%" />
                                <Tooltip />
                                <Legend verticalAlign="top" align="right" iconType="circle" />
                                <Line type="monotone" name="Tasa Contacto" dataKey="contactRate" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
                                <Line type="monotone" name="Tasa Interés" dataKey="interestRate" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
                                <Line type="monotone" name="Tasa Citas" dataKey="bookingRate" stroke="#14b8a6" strokeWidth={2} dot={{ r: 4 }} />
                                <Line type="monotone" name="Conversión Total" dataKey="conversionRate" stroke="#10b981" strokeWidth={3} strokeDasharray="4 4" dot={{ r: 4 }} />
                                <ReferenceLine y={20} label={{ value: 'Meta Conv. 20%', fontSize: 10, fill: '#10b981' }} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.5} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Layout Block 3: Operational Trends */}
            <Card className="border-none shadow-sm overflow-hidden bg-white">
                <CardHeader className="pb-2 border-b border-slate-50">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Zap className="h-4 w-4 text-amber-500" />
                        3. Tendencias Operativas ({timeGrain})
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={aggregatedData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.05} />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} unit="" />
                                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} unit="%" />
                                <Tooltip />
                                <Legend verticalAlign="top" align="right" iconType="circle" />
                                <Bar yAxisId="left" name="Backlog(Mes)" dataKey="backlog" fill="#fbbf24" radius={[4, 4, 0, 0]} barSize={20} />
                                <Bar yAxisId="left" name="Incumplen SLA" dataKey="slaBreaches" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
                                <Line yAxisId="left" type="monotone" name="Respuesta(min)" dataKey="medianResponseTime" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} />
                                <Line yAxisId="right" type="monotone" name="SLA %" dataKey="slaCompliance" stroke="#14b8a6" strokeWidth={2} strokeDasharray="5 5" />
                                <ReferenceLine y={15} yAxisId="left" label={{ value: 'Meta Rpta 15m', fontSize: 10, fill: '#8b5cf6' }} stroke="#8b5cf6" strokeDasharray="3 3" strokeOpacity={0.5} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Detail Table */}
            <Card className="border-none shadow-sm overflow-hidden bg-white">
                <CardHeader className="border-b border-slate-50">
                    <CardTitle className="text-sm font-bold">Detalle de series históricas</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                            <thead className="bg-slate-50/50 text-slate-400 font-bold uppercase tracking-widest border-b border-slate-50">
                                <tr>
                                    <th className="px-6 py-4">Periodo</th>
                                    <th className="px-6 py-4">Leads</th>
                                    <th className="px-6 py-4">Ventas</th>
                                    <th className="px-6 py-4">Contact %</th>
                                    <th className="px-6 py-4">Mediana Rpta</th>
                                    <th className="px-6 py-4 text-center">SLA %</th>
                                    <th className="px-6 py-4 text-right">Tasa Conversión</th>
                                </tr>
                            </thead>
                            <tbody>
                                {aggregatedData.map(r => (
                                    <tr key={r.date} className="border-b border-slate-50 hover:bg-indigo-50/20 transition-colors">
                                        <td className="px-6 py-4 font-bold text-slate-700">{r.date}</td>
                                        <td className="px-6 py-4">{r.leads}</td>
                                        <td className="px-6 py-4 text-emerald-600 font-semibold">{r.appointments}</td>
                                        <td className="px-6 py-4 font-semibold text-indigo-600">{r.contactRate}%</td>
                                        <td className="px-6 py-4 text-slate-500">{r.medianResponseTime} min</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${r.slaCompliance > 80 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                                {r.slaCompliance}%
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-black text-slate-800">{r.conversionRate}%</td>
                                    </tr>
                                ))}
                                {aggregatedData.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">Sin datos conciliados</td>
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
