import { Users, Target, Calendar as CalendarIcon, CheckSquare, TrendingUp, Percent, DollarSign, RefreshCw, Layers } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { KPICard } from "@/components/dashboard/KPICard";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useDashboardContext } from "@/context/DashboardDataContext";
import { Loader2 } from "lucide-react";
import { ExportToExcel } from "@/components/dashboard/ExportToExcel";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { ChannelSelector } from "@/components/dashboard/ChannelSelector";
import { TagConfigDialog } from "@/components/dashboard/TagConfigDialog";
import { DateRange } from "react-day-picker";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { es } from "date-fns/locale";

const ExecutiveOverview = () => {
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date())
    });

    const [selectedInboxes, setSelectedInboxes] = useState<number[]>([]);
    const { tagSettings, updateTagSettings } = useDashboardContext();

    const filters = useMemo(() => ({
        startDate: dateRange?.from,
        endDate: dateRange?.to,
        selectedInboxes,
        ...tagSettings
    }), [dateRange, selectedInboxes, tagSettings]);

    const { loading, error, data, refetch } = useDashboardData(filters);

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

    const { kpis, allLabels = [] } = data;

    // Formulas:
    // Win Rate (Eficiencia de conversión principal) = Comparación de etiquetas SQL vs Citas (o configurable)
    // El usuario pidió: SQLs vs Citas
    const winRate = kpis.interestedLeads > 0
        ? Math.round((kpis.scheduledAppointments / kpis.interestedLeads) * 100)
        : 0;

    const periodLabel = dateRange?.from && dateRange?.to
        ? `${format(dateRange.from, "dd/MM/yy")} - ${format(dateRange.to, "dd/MM/yy")}`
        : "Todo el historial";

    return (
        <div className="space-y-6">
            {/* dynamic context and filter bar */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-xl border shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Layers className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold">Resumen de Negocio</h3>
                        <p className="text-xs text-muted-foreground uppercase">{periodLabel}</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <ChannelSelector
                        selectedInboxes={selectedInboxes}
                        onChange={setSelectedInboxes}
                    />

                    <DateRangePicker
                        value={dateRange}
                        onChange={setDateRange}
                    />

                    <div className="h-8 w-px bg-border mx-1 hidden lg:block" />

                    <TagConfigDialog
                        availableLabels={allLabels}
                        config={tagSettings}
                        onSave={updateTagSettings}
                    />

                    <div className="flex items-center gap-2 ml-auto">
                        <ExportToExcel />
                        <Button variant="outline" size="icon" onClick={() => refetch()} title="Actualizar datos">
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Matrix of Strategic KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KPICard
                    title="Total Leads"
                    value={kpis.totalLeads.toLocaleString()}
                    subtitle="Prospectos entrantes en periodo"
                    icon={Users}
                    variant="primary"
                />
                <KPICard
                    title="SQLs"
                    value={kpis.interestedLeads.toLocaleString()}
                    subtitle="Vía etiquetas seleccionadas"
                    icon={Target}
                    variant="accent"
                />
                <KPICard
                    title="Citas Agendadas"
                    value={kpis.scheduledAppointments.toLocaleString()}
                    subtitle="Suma de etiquetas de cita"
                    icon={CalendarIcon}
                    variant="accent"
                />
                <KPICard
                    title="Cierre / Ventas"
                    value={kpis.closedSales?.toLocaleString() || "0"}
                    subtitle="Ventas según etiquetas"
                    icon={CheckSquare}
                    variant="success"
                />
            </div>

            {/* Efficiency and Revenue Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KPICard
                    title="Win Rate (Citas/SQL)"
                    value={`${winRate}%`}
                    subtitle="Eficiencia de conversión seleccionada"
                    icon={Percent}
                    variant="primary"
                />
                <KPICard
                    title="Ganancia Mensual"
                    value={new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }).format(kpis.monthlyProfit)}
                    subtitle="Basado en fecha_monto_operacion"
                    icon={DollarSign}
                    variant="success"
                />
                <KPICard
                    title="Ganancia Total"
                    value={new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }).format(kpis.totalProfit)}
                    subtitle="Suma de todo monto_operacion"
                    icon={TrendingUp}
                    variant="success"
                />
            </div>

        </div>
    );
};

export default ExecutiveOverview;
