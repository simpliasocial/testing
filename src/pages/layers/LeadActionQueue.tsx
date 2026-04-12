import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import {
    Loader2,
    ListTodo,
    AlertCircle,
    ExternalLink,
    Clock,
    User,
    Filter,
    ArrowUpCircle,
    ArrowRightCircle,
    RotateCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { config } from "@/config";

const LeadActionQueue = () => {
    const [selectedMonth, setSelectedMonth] = useState<Date | null>(null);
    const { loading, error, data } = useDashboardData(selectedMonth);

    const actionQueue = useMemo(() => {
        if (!data || !data.operationalMetrics?.activeLeads) return [];

        // Priority logic: 
        // Alta if no owner or status is new. 
        // Media if owner exists but no response.
        // Baja otherwise.
        return data.operationalMetrics.activeLeads.map((lead: any) => {
            let priority = "Baja";
            let reason = "Seguimiento";
            let suggested = "Chequear historial";

            if (!lead.owner || lead.owner === "Sin Asignar") {
                priority = "Alta";
                reason = "Sin Asignar";
                suggested = "Asignar a un agente";
            } else if (lead.status === 'new') {
                priority = "Alta";
                reason = "Lead Nuevo";
                suggested = "Primer contacto";
            } else {
                priority = "Media";
                reason = "En proceso";
                suggested = "Mover a cita";
            }

            return {
                ...lead,
                priority,
                reason,
                suggested
            };
        });
    }, [data]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const priorityColors = {
        "Alta": "bg-red-100 text-red-700 border-red-200",
        "Media": "bg-amber-100 text-amber-700 border-amber-200",
        "Baja": "bg-blue-100 text-blue-700 border-blue-200"
    };

    const stats = {
        criticas: actionQueue.filter(l => l.priority === 'Alta').length,
        sinCita: data.kpis.interestedLeads - data.kpis.scheduledAppointments,
        reactivables: actionQueue.length
    };

    return (
        <div className="space-y-6">
            {/* Action Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-red-50/50 border-red-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-700">
                            <AlertCircle className="w-4 h-4" />
                            Acciones Críticas
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-900">{stats.criticas}</div>
                        <p className="text-xs text-red-600 mt-1">Leads con SLA vencido o alta prioridad</p>
                    </CardContent>
                </Card>

                <Card className="bg-amber-50/50 border-amber-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-700">
                            <ArrowUpCircle className="w-4 h-4" />
                            Interesados sin Cita
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-900">{Math.max(0, stats.sinCita)}</div>
                        <p className="text-xs text-amber-600 mt-1">Leads calientes esperando agendamiento</p>
                    </CardContent>
                </Card>

                <Card className="bg-blue-50/50 border-blue-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 text-blue-700">
                            <RotateCw className="w-4 h-4" />
                            Leads en Cola
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-900">{stats.reactivables}</div>
                        <p className="text-xs text-blue-600 mt-1">Cola total de gestión activa</p>
                    </CardContent>
                </Card>
            </div>

            {/* Main Action Table */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <ListTodo className="h-5 w-5 text-primary" />
                            Cola de Trabajo Diaria
                        </CardTitle>
                        <CardDescription>Prioridad calculada dinámicamente basada en actividad y etiquetas</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="gap-2">
                            <Filter className="h-4 w-4" />
                            Filtrar
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="relative overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Prioridad</th>
                                    <th className="px-4 py-3 font-semibold">Lead / Canal</th>
                                    <th className="px-4 py-3 font-semibold">Status / Owner</th>
                                    <th className="px-4 py-3 font-semibold">Motivo</th>
                                    <th className="px-4 py-3 font-semibold text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {actionQueue.map((lead) => (
                                    <tr key={lead.id} className="bg-background border-b hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-4">
                                            <Badge variant="outline" className={priorityColors[lead.priority as keyof typeof priorityColors]}>
                                                {lead.priority}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-foreground">{lead.name}</span>
                                                <span className="text-[10px] text-muted-foreground uppercase">{lead.channel}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex flex-col text-xs">
                                                <span className="font-semibold text-primary">{lead.status}</span>
                                                <span className="text-muted-foreground">{lead.owner}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 w-fit">
                                                    {lead.reason}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground italic">"{lead.suggested}"</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <a
                                                href={`${config.chatwoot.publicUrl}/app/accounts/${config.chatwoot.accountId}/conversations/${lead.id}`}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                <Button size="sm" variant="ghost" className="h-8 gap-2 text-primary hover:text-primary hover:bg-primary/10">
                                                    <ExternalLink className="h-3 w-3" />
                                                    Chat
                                                </Button>
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                                {actionQueue.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground italic">
                                            No hay leads pendientes en la cola de acción.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Empty State Helper */}
            <div className="p-8 text-center border-2 border-dashed rounded-xl opacity-60">
                <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                    <User className="text-primary w-6 h-6" />
                </div>
                <h4 className="font-semibold">¿Quieres ver más leads?</h4>
                <p className="text-sm text-muted-foreground">Sincroniza los últimos datos de Chatwoot o ajusta los filtros de prioridad.</p>
            </div>
        </div>
    );
};

export default LeadActionQueue;
