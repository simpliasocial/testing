import { Users, Target, Calendar, CheckSquare, TrendingUp, Percent, DollarSign, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { KPICard } from "@/components/dashboard/KPICard";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Loader2 } from "lucide-react";
import { ExportToExcel } from "@/components/dashboard/ExportToExcel";

const ALL_TIME_VALUE = "-1";

const ExecutiveOverview = () => {
    const [selectedMonth, setSelectedMonth] = useState<Date | null>(new Date());
    const { loading, error, data, refetch } = useDashboardData(selectedMonth);

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

    // Additional specific KPIs for Executive Overview as per architecture
    // Formulas:
    // Win Rate = (venta_exitosa / sqls) * 100
    // Conversion = (cita_agendada / totalLeads) * 100
    const winRate = kpis.interestedLeads > 0
        ? Math.round((kpis.scheduledAppointments / kpis.interestedLeads) * 100)
        : 0;

    const periodLabel = selectedMonth
        ? selectedMonth.toLocaleString('es-ES', { month: 'long', year: 'numeric' })
        : "Histórico (2024-Presente)";

    return (
        <div className="space-y-6">
            {/* Context bar */}
            <div className="flex justify-between items-center bg-card p-4 rounded-lg border">
                <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold">Resumen de Negocio</h3>
                    <span className="text-sm text-muted-foreground bg-secondary px-2 py-1 rounded">
                        {periodLabel}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <ExportToExcel />
                    <Button variant="outline" size="icon" onClick={refetch}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Select
                        value={selectedMonth ? selectedMonth.getMonth().toString() : ALL_TIME_VALUE}
                        onValueChange={(value) => {
                            if (value === ALL_TIME_VALUE) {
                                setSelectedMonth(null);
                            } else {
                                const newDate = new Date();
                                newDate.setMonth(parseInt(value));
                                setSelectedMonth(newDate);
                            }
                        }}
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Periodo" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL_TIME_VALUE}>Todo el Historial</SelectItem>
                            {[
                                "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                                "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
                            ].map((month, idx) => (
                                <SelectItem key={idx} value={idx.toString()}>
                                    {month}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Matrix of Strategic KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KPICard
                    title="Total Leads"
                    value={kpis.totalLeads.toLocaleString()}
                    subtitle="Prospectos entrantes"
                    icon={Users}
                    variant="primary"
                />
                <KPICard
                    title="SQLs"
                    value={kpis.interestedLeads.toLocaleString()}
                    subtitle="Leads calificados"
                    icon={Target}
                    variant="accent"
                />
                <KPICard
                    title="Citas Agendadas"
                    value={kpis.scheduledAppointments.toLocaleString()}
                    subtitle="Citas en el periodo"
                    icon={Calendar}
                    variant="accent"
                />
                <KPICard
                    title="Cierre / Ventas"
                    value={kpis.closedSales?.toLocaleString() || "0"}
                    subtitle="Ventas registradas"
                    icon={CheckSquare}
                    variant="success"
                />
            </div>

            {/* Efficiency Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KPICard
                    title="Win Rate (Citas/SQL)"
                    value={`${winRate}%`}
                    subtitle="Eficiencia de conversión"
                    icon={Percent}
                    variant="primary"
                />
                <KPICard
                    title="Costo por Lead"
                    value="$0.00"
                    subtitle="Pendiente inversión"
                    icon={DollarSign}
                />
                <KPICard
                    title="Ingresos Estimados"
                    value={new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }).format(kpis.monthlyProfit)}
                    subtitle="Basado en monto_operacion"
                    icon={TrendingUp}
                    variant="success"
                />
            </div>

            {/* Note on Strategy */}
            <div className="p-6 bg-primary/5 border border-primary/10 rounded-xl">
                <h4 className="font-bold text-primary mb-2">Análisis Estratégico</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    Este layer permite a la dirección entender si el volumen de leads ({kpis.totalLeads}) está resultando
                    en una tasa de calificación ({kpis.interestedLeads > 0 ? (kpis.interestedLeads / kpis.totalLeads * 100).toFixed(1) : 0}%)
                    alineada con los objetivos. El foco principal es subir el Win Rate de SQL a Cita, actualmente en un {winRate}%.
                </p>
            </div>
        </div>
    );
};

export default ExecutiveOverview;
