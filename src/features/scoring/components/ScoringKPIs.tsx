import React from "react";
import { Activity, BadgeCheck, Gauge, TrendingUp } from "lucide-react";
import { KPICard } from "@/shared/ui/dashboard/KPICard";

interface ScoringKPIsProps {
    kpis: {
        averageScore: number;
        hotPercentage: number;
        hotAppointmentConversion: number;
        coldPercentage: number;
    };
    scoredLeadCount: number;
    filteredMissingScoreCount: number;
    hotLeads: any[];
    coldLeads: any[];
    hotAppointments: number;
    activeAppointmentLabels: string[];
}

export const ScoringKPIs: React.FC<ScoringKPIsProps> = ({
    kpis, scoredLeadCount, filteredMissingScoreCount,
    hotLeads, coldLeads, hotAppointments, activeAppointmentLabels
}) => {
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KPICard
                icon={Gauge}
                title="Puntaje promedio"
                value={`${kpis.averageScore}`}
                subtitle={`${scoredLeadCount} con puntaje - ${filteredMissingScoreCount} sin puntaje`}
                variant="primary"
            />
            <KPICard
                icon={BadgeCheck}
                title="% leads calientes"
                value={`${kpis.hotPercentage}%`}
                subtitle={`${hotLeads.length} leads en nivel Caliente`}
                variant="success"
            />
            <KPICard
                icon={TrendingUp}
                title="Calientes que llegan a cita"
                value={`${kpis.hotAppointmentConversion}%`}
                subtitle={activeAppointmentLabels.length === 0
                    ? "Primero configura qué estados cuentan como cita."
                    : `${hotAppointments} de ${hotLeads.length} leads calientes ya llegaron a cita`}
                variant="success"
            />
            <KPICard
                icon={Activity}
                title="% leads fríos"
                value={`${kpis.coldPercentage}%`}
                subtitle={`${coldLeads.length} leads en nivel Frío, incluidos los sin puntaje`}
                variant="default"
            />
        </div>
    );
};
