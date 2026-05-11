import React from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartCard, EmptyState } from "./ScoringShared";
import type { ScoreDimension } from "../model/leadScoringModel";

interface ScoringChartsProps {
    filteredLeads: any[];
    bucketDistribution: any[];
    averageByChannel: any[];
    averageByDimension: any[];
    conversionByBucket: any[];
    scoreDomain: [number, number];
    scoreDimension: ScoreDimension;
    setScoreDimension: (dimension: ScoreDimension) => void;
    activeAppointmentLabels: string[];
}

const getTooltipPayloadNumber = (item: unknown, key: string) => {
    const payload = (item as { payload?: Record<string, unknown> })?.payload;
    const value = Number(payload?.[key] || 0);
    return Number.isFinite(value) ? value : 0;
};

export const ScoringCharts: React.FC<ScoringChartsProps> = ({
    filteredLeads, bucketDistribution, averageByChannel,
    averageByDimension, conversionByBucket, scoreDomain,
    scoreDimension, setScoreDimension, activeAppointmentLabels
}) => {
    return (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ChartCard title="Distribución por nivel de puntaje" description="Reparte los leads entre Caliente, Tibio y Frío. Los sin puntaje entran en Frío.">
                {filteredLeads.length === 0 ? (
                    <EmptyState text="No hay leads con estos filtros." />
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={bucketDistribution} margin={{ top: 20, right: 24, left: 0, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.12} />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} />
                            <YAxis allowDecimals={false} />
                            <Tooltip cursor={{ fill: "transparent" }} formatter={(value: number) => [`${value} leads`, "Nivel"]} />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                {bucketDistribution.map(row => <Cell key={row.bucket} fill={row.fill} />)}
                                <LabelList dataKey="value" position="top" style={{ fontWeight: 700 }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </ChartCard>

            <ChartCard title="Puntaje promedio por canal" description="Compara qué red social trae mejor calidad promedio.">
                {averageByChannel.length === 0 ? (
                    <EmptyState text="No hay canales con puntaje para mostrar." />
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={averageByChannel.slice(0, 8)} layout="vertical" margin={{ top: 12, right: 30, left: 28, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} strokeOpacity={0.12} />
                            <XAxis type="number" domain={scoreDomain} />
                            <YAxis dataKey="name" type="category" width={108} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(value: number, _name: string, item: unknown) => [`${value}`, `${getTooltipPayloadNumber(item, "leads")} leads`]} />
                            <Bar dataKey="score" fill="#243d90" radius={[0, 6, 6, 0]}>
                                <LabelList dataKey="score" position="right" style={{ fontWeight: 700 }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </ChartCard>

            <ChartCard
                title={scoreDimension === "campaign" ? "Puntaje promedio por campaña" : "Puntaje promedio por estado del lead"}
                description={scoreDimension === "campaign" ? "Agrupa los leads por campaña y muestra el puntaje promedio en cada una." : "Agrupa los leads por estado y muestra el puntaje promedio en cada uno."}
                action={(
                    <Select value={scoreDimension} onValueChange={(value: ScoreDimension) => setScoreDimension(value)}>
                        <SelectTrigger className="h-8 w-[132px] text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="label">Estado del lead</SelectItem>
                            <SelectItem value="campaign">Campaña</SelectItem>
                        </SelectContent>
                    </Select>
                )}
            >
                {averageByDimension.length === 0 ? (
                    <EmptyState text={scoreDimension === "campaign"
                        ? "No hay leads con puntaje y con campaña para esta vista."
                        : "No hay leads con puntaje para esta vista y estos filtros."} />
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={averageByDimension} layout="vertical" margin={{ top: 12, right: 30, left: 48, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} strokeOpacity={0.12} />
                            <XAxis type="number" domain={scoreDomain} />
                            <YAxis dataKey="name" type="category" width={128} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(value: number, _name: string, item: unknown) => [`${value}`, `${getTooltipPayloadNumber(item, "leads")} leads`]} />
                            <Bar dataKey="score" fill="#0f9d76" radius={[0, 6, 6, 0]}>
                                <LabelList dataKey="score" position="right" style={{ fontWeight: 700 }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </ChartCard>

            <ChartCard
                title="Leads con cita según nivel de puntaje"
                description="Muestra qué porcentaje de leads por nivel ya llegó a los estados de cita configurados."
            >
                {activeAppointmentLabels.length === 0 ? (
                    <EmptyState text="Primero configura qué estados cuentan como cita." />
                ) : filteredLeads.length === 0 ? (
                    <EmptyState text="No hay leads para esta vista y estos filtros." />
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={conversionByBucket} margin={{ top: 20, right: 24, left: 0, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.12} />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} />
                            <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                            <Tooltip formatter={(value: number, _name: string, item: unknown) => [`${value}%`, `${getTooltipPayloadNumber(item, "converted")} de ${getTooltipPayloadNumber(item, "total")}`]} />
                            <Bar dataKey="conversion" radius={[6, 6, 0, 0]}>
                                {conversionByBucket.map(row => <Cell key={row.bucket} fill={row.fill} />)}
                                <LabelList dataKey="conversion" position="top" formatter={(value: number) => `${value}%`} style={{ fontWeight: 700 }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </ChartCard>
        </div>
    );
};
