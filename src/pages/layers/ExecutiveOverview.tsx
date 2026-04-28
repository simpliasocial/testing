import { Users, Target, Calendar as CalendarIcon, CheckSquare, TrendingUp, Percent, DollarSign, Layers } from "lucide-react";
import { useMemo } from "react";
import { KPICard } from "@/components/dashboard/KPICard";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useDashboardContext } from "@/context/DashboardDataContext";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const ExecutiveOverview = () => {
    const { tagSettings, globalFilters } = useDashboardContext();

    const filters = useMemo(() => ({
        startDate: globalFilters.startDate,
        endDate: globalFilters.endDate,
        selectedInboxes: globalFilters.selectedInboxes,
        ...tagSettings
    }), [globalFilters, tagSettings]);

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

    const winRate = kpis.interestedLeads > 0
        ? Math.round((kpis.scheduledAppointments / kpis.interestedLeads) * 100)
        : 0;

    const periodLabel = globalFilters.startDate && globalFilters.endDate
        ? `${format(globalFilters.startDate, "dd/MM/yy")} - ${format(globalFilters.endDate, "dd/MM/yy")}`
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
                    title="Leads calificados"
                    value={kpis.interestedLeads.toLocaleString()}
                    subtitle="Según los estados comerciales configurados"
                    icon={Target}
                    variant="primary"
                />
                <KPICard
                    title="Citas Agendadas"
                    value={kpis.scheduledAppointments.toLocaleString()}
                    subtitle="Leads marcados como cita"
                    icon={CalendarIcon}
                    variant="success"
                />
                <KPICard
                    title="Cierre / Ventas"
                    value={kpis.closedSales?.toLocaleString() || "0"}
                    subtitle="Leads marcados como venta"
                    icon={CheckSquare}
                    variant="success"
                />
            </div>

            {/* Efficiency and Revenue Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KPICard
                    title="Conversión a cita"
                    value={`${winRate}%`}
                    subtitle="Eficiencia de conversión seleccionada"
                    icon={Percent}
                    variant="primary"
                />
                <KPICard
                    title="Ganancia Mensual"
                    value={new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }).format(kpis.monthlyProfit)}
                    subtitle="Basado en la fecha en que se registró el monto"
                    icon={DollarSign}
                    variant="success"
                />
                <KPICard
                    title="Ganancia Total"
                    value={new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }).format(kpis.totalProfit)}
                    subtitle="Suma de los montos registrados"
                    icon={TrendingUp}
                    variant="success"
                />
            </div>

        </div>
    );
};

export default ExecutiveOverview;
