import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Loader2, Activity, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { chatwootService } from '@/services/ChatwootService';
import { HybridDashboardService } from '@/services/HybridDashboardService';
import { mapMinifiedToChatwootConversation } from '@/services/ConversationMapper';
import { dateStringIncludesToday, guayaquilEndOfDayIso, guayaquilStartOfDayIso } from '@/lib/guayaquilTime';
import { config } from '@/config';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { getInboxChannelName, getLeadChannelName } from '@/lib/leadDisplay';

const ReportsPage = () => {
    const [isExporting, setIsExporting] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState<string>((new Date().getMonth()).toString());
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [customStartDate, setCustomStartDate] = useState<string>("");
    const [customEndDate, setCustomEndDate] = useState<string>("");

    const [inboxes, setInboxes] = useState<any[]>([]);

    useEffect(() => {
        const loadInboxes = async () => {
            try {
                const data = await chatwootService.getInboxes();
                setInboxes(data);
            } catch (error) {
                console.error("Error loading inboxes", error);
            }
        };
        loadInboxes();
    }, []);

    const labels = [
        'interesado', 'crear_confianza', 'crear_urgencia', 'desinteresado', 'cita_agendada', 'venta_exitosa'
    ];

    const fetchAllConversations = async (startDate: string, endDate: string, inboxId: string) => {
        const hybridConversations = await HybridDashboardService.fetchHybridReportConversations(startDate, endDate);
        let allConvs = hybridConversations.map(mapMinifiedToChatwootConversation);

        if (inboxId !== 'all') {
            allConvs = allConvs.filter(conv => conv.inbox_id?.toString() === inboxId);
        }

        return allConvs;
    };

    const generateExcel = (filteredConvs: any[], createdConvs: any[], labelTitle: string, filename: string, startDate: string, endDate: string, isPreliminary = false) => {
        const labelCounts: Record<string, any> = {};
        const labelCountsUnicas: Record<string, any> = {};

        labels.forEach(l => {
            labelCounts[l] = { total: 0 };
            labelCountsUnicas[l] = { total: 0 };
            inboxes.forEach(inbox => {
                labelCounts[l][inbox.id] = 0;
                labelCountsUnicas[l][inbox.id] = 0;
            });
        });

        filteredConvs.forEach(conv => {
            if (conv.labels) {
                conv.labels.forEach((l: string) => {
                    if (labelCounts[l]) {
                        labelCounts[l].total++;
                        if (labelCounts[l][conv.inbox_id] !== undefined) {
                            labelCounts[l][conv.inbox_id]++;
                        } else {
                            labelCounts[l][conv.inbox_id] = 1;
                        }
                    }
                });
            }
        });

        createdConvs.forEach(conv => {
            if (conv.labels) {
                conv.labels.forEach((l: string) => {
                    if (labelCountsUnicas[l]) {
                        labelCountsUnicas[l].total++;
                        if (labelCountsUnicas[l][conv.inbox_id] !== undefined) {
                            labelCountsUnicas[l][conv.inbox_id]++;
                        } else {
                            labelCountsUnicas[l][conv.inbox_id] = 1;
                        }
                    }
                });
            }
        });

        // --- SECCIÓN 1: RESUMEN DE ACTIVIDADES ---
        const resumenData: any[][] = [];
        resumenData.push([`Fecha Inicio`, startDate]);
        resumenData.push([`Fecha Fin`, endDate]);
        if (isPreliminary) {
            resumenData.push([`Nota`, `Incluye datos live/preliminares de Chatwoot para hoy en horario Guayaquil.`]);
        }
        resumenData.push([]);

        const headerRow1 = ["Etiqueta", "Total"];
        inboxes.forEach(inbox => {
            headerRow1.push(getInboxChannelName(inbox));
        });
        resumenData.push(headerRow1);

        Object.keys(labelCounts).forEach(label => {
            let row = [label, labelCounts[label].total];
            inboxes.forEach(inbox => {
                row.push(labelCounts[label][inbox.id] || 0);
            });
            resumenData.push(row);
        });

        let totalSum = 0;
        const sumPerInbox: Record<number, number> = {};
        inboxes.forEach(inbox => sumPerInbox[inbox.id] = 0);

        Object.keys(labelCounts).forEach(label => {
            totalSum += labelCounts[label].total;
            inboxes.forEach(inbox => {
                sumPerInbox[inbox.id] += (labelCounts[label][inbox.id] || 0);
            });
        });

        let footerRow = [labelTitle.replace('Total Leads', 'Total Etiquetas Asignadas'), totalSum];
        inboxes.forEach(inbox => {
            footerRow.push(sumPerInbox[inbox.id]);
        });
        resumenData.push(footerRow);

        resumenData.push([]);
        resumenData.push([`Total Leads de Actividades`, filteredConvs.length]);

        // --- SECCIÓN 2: DETALLE DE LEADS DE ACTIVIDADES ---
        const getDetalleRows = (convs: any[]) => {
            const rows: any[][] = [];
            const headers = [
                "ID Conversacion",
                "Nombre del Lead",
                "Telefono/Celular",
                "Canal",
                "Etiquetas",
                "Responsable (Persona)",
                "Agente (Chatwoot)",
                "Nombre Completo (Attr)",
                "Correo",
                "Ciudad",
                "Campana",
                "Edad",
                "Fecha Visita",
                "Hora Visita",
                "Agencia",
                "Score Interes",
                "Monto Operacion",
                "Fecha Monto Operacion",
                "Enlace Chatwoot",
                "Fecha Ingreso",
                "Ultima Interaccion"
            ];
            rows.push(headers);

            convs.forEach(conv => {
                const cA = conv.meta?.sender?.custom_attributes || {};
                const vA = conv.custom_attributes || {};

                const inbox = inboxes.find(i => i.id === conv.inbox_id);
                const canal = getLeadChannelName(conv, inbox);

                let telefonoPrincipal = "";
                if (canal.toLowerCase().includes('whatsapp')) {
                    telefonoPrincipal = conv.meta?.sender?.phone_number || cA.celular || vA.celular || "";
                } else {
                    telefonoPrincipal = cA.celular || vA.celular || "";
                }

                const createdAt = conv.created_at ? new Date(conv.created_at * 1000) : null;
                const lastActivity = conv.timestamp ? new Date(conv.timestamp * 1000) : null;

                const rowData = [
                    conv.id,
                    conv.meta?.sender?.name || 'Sin Nombre',
                    telefonoPrincipal,
                    canal,
                    (conv.labels || []).join(' | '),
                    cA.responsable || vA.responsable || "",
                    conv.meta?.assignee?.name || (cA.agente === true || vA.agente === true ? "Asignado" : "Sin Asignar"),
                    cA.nombre_completo || vA.nombre_completo || "",
                    cA.correo || vA.correo || conv.meta?.sender?.email || "",
                    cA.ciudad || vA.ciudad || "",
                    cA.campana || vA.campana || "",
                    cA.edad || vA.edad || "",
                    cA.fecha_visita || vA.fecha_visita || "",
                    cA.hora_visita || vA.hora_visita || "",
                    cA.agencia || vA.agencia || "",
                    cA.score_interes || vA.score_interes || "",
                    cA.monto_operacion || vA.monto_operacion || "",
                    cA.fecha_monto_operacion || vA.fecha_monto_operacion || "",
                    `${config.chatwoot.publicUrl}/app/accounts/${config.chatwoot.accountId}/conversations/${conv.id}`,
                    createdAt ? format(createdAt, "yyyy-MM-dd HH:mm:ss") : "",
                    lastActivity ? format(lastActivity, "yyyy-MM-dd HH:mm:ss") : ""
                ];

                rows.push(rowData);
            });
            return rows;
        };

        const detalleDataActividades = getDetalleRows(filteredConvs);

        // --- SECCIÓN 3: RESUMEN DE ETIQUETAS ÚNICAS ---
        const resumenUnicasData: any[][] = [];
        resumenUnicasData.push([`Fecha Inicio`, startDate]);
        resumenUnicasData.push([`Fecha Fin`, endDate]);
        if (isPreliminary) {
            resumenUnicasData.push([`Nota`, `Incluye datos live/preliminares de Chatwoot para hoy en horario Guayaquil.`]);
        }
        resumenUnicasData.push([]);

        resumenUnicasData.push(headerRow1);

        Object.keys(labelCountsUnicas).forEach(label => {
            let row = [label, labelCountsUnicas[label].total];
            inboxes.forEach(inbox => {
                row.push(labelCountsUnicas[label][inbox.id] || 0);
            });
            resumenUnicasData.push(row);
        });

        let totalSumUnicas = 0;
        const sumPerInboxUnicas: Record<number, number> = {};
        inboxes.forEach(inbox => sumPerInboxUnicas[inbox.id] = 0);

        Object.keys(labelCountsUnicas).forEach(label => {
            totalSumUnicas += labelCountsUnicas[label].total;
            inboxes.forEach(inbox => {
                sumPerInboxUnicas[inbox.id] += (labelCountsUnicas[label][inbox.id] || 0);
            });
        });

        let footerRowUnicas = ["Total Etiquetas Asignadas", totalSumUnicas];
        inboxes.forEach(inbox => {
            footerRowUnicas.push(sumPerInboxUnicas[inbox.id]);
        });
        resumenUnicasData.push(footerRowUnicas);

        resumenUnicasData.push([]);
        resumenUnicasData.push([`Total Leads Unicos`, createdConvs.length]);

        // --- SECCIÓN 4: CONVERSACIONES ÚNICAS ---
        const detalleDataUnicas = getDetalleRows(createdConvs);

        const wb = XLSX.utils.book_new();
        const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
        if (wsResumen['!ref']) wsResumen['!autofilter'] = { ref: wsResumen['!ref'] };

        const wsDetalle = XLSX.utils.aoa_to_sheet(detalleDataActividades);
        if (wsDetalle['!ref']) wsDetalle['!autofilter'] = { ref: wsDetalle['!ref'] };

        const wsResumenUnicas = XLSX.utils.aoa_to_sheet(resumenUnicasData);
        if (wsResumenUnicas['!ref']) wsResumenUnicas['!autofilter'] = { ref: wsResumenUnicas['!ref'] };

        const wsNuevas = XLSX.utils.aoa_to_sheet(detalleDataUnicas);
        if (wsNuevas['!ref']) wsNuevas['!autofilter'] = { ref: wsNuevas['!ref'] };

        XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen Etiquetas Actividades");
        XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle Leads Actividades");
        XLSX.utils.book_append_sheet(wb, wsResumenUnicas, "Resumen Etiquetas Unicas");
        XLSX.utils.book_append_sheet(wb, wsNuevas, "Detalle Leads Unicas");

        XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const downloadReport = async (start: string, end: string, type: 'hoy' | 'mes' | 'rango') => {
        setIsExporting(true);
        const isPreliminary = dateStringIncludesToday(start, end);
        const toastId = toast.loading(`Descargando reporte de ${type}${isPreliminary ? ' con datos live' : ''}...`);
        try {
            const allConvs = await fetchAllConversations(start, end, 'all');
            const startTimestamp = new Date(guayaquilStartOfDayIso(start)).getTime();
            const endTimestamp = new Date(guayaquilEndOfDayIso(end)).getTime();

            const filteredConvs = allConvs.filter(conv => {
                const convTime = conv.timestamp * 1000;
                return convTime >= startTimestamp && convTime <= endTimestamp;
            });

            const createdConvs = allConvs.filter(conv => {
                const creationTime = (conv.created_at || conv.timestamp) * 1000;
                return creationTime >= startTimestamp && creationTime <= endTimestamp;
            });

            generateExcel(filteredConvs, createdConvs, `Total Leads con Actividad (${type})`, `reporte_avance_${type}`, start, end, isPreliminary);
            toast.success('Reporte exportado correctamente', { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error('Error al exportar el reporte', { id: toastId });
        } finally {
            setIsExporting(false);
        }
    };

    const handleDownloadToday = () => {
        const todayStr = new Date().toLocaleString('sv-SE', { timeZone: 'America/Guayaquil' }).split(' ')[0];
        downloadReport(todayStr, todayStr, 'hoy');
    };

    const handleDownloadMonth = () => {
        const year = parseInt(selectedYear);
        const month = parseInt(selectedMonth);

        const lastDay = new Date(year, month + 1, 0);

        const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

        downloadReport(startStr, endStr, 'mes');
    };

    const handleDownloadCustomDate = () => {
        if (!customStartDate || !customEndDate) {
            toast.error("Selecciona fecha de inicio y fin");
            return;
        }
        if (new Date(customStartDate) > new Date(customEndDate)) {
            toast.error("La fecha de inicio debe ser menor o igual a la de fin");
            return;
        }
        downloadReport(customStartDate, customEndDate, 'rango');
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
                <Card className="border-border bg-card">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2 text-green-600">
                            <Activity className="w-5 h-5" />
                            Reporte de Interacciones
                        </CardTitle>
                        <CardDescription>
                            Filtra prospectos activos en este rango, incluyendo aquellos creados en el pasado pero que tuvieron actividad u otra etiqueta hoy.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col gap-8">
                            <div className="space-y-3 bg-slate-50/50 p-5 rounded-lg border border-border">
                                <div>
                                    <h3 className="font-medium text-foreground flex items-center gap-2">
                                        <Activity className="w-4 h-4 text-primary" />
                                        Reporte Diario
                                    </h3>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Descarga el reporte de interacciones para el día de hoy.
                                    </p>
                                </div>
                                <Button
                                    className="w-full sm:w-auto gap-2 bg-green-600 hover:bg-green-700 text-white"
                                    disabled={isExporting}
                                    onClick={handleDownloadToday}
                                >
                                    {isExporting ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</> : <><Download className="w-4 h-4" /> Generar reporte de hoy</>}
                                </Button>
                            </div>

                            <div className="space-y-4 bg-slate-50/50 p-5 rounded-lg border border-border">
                                <div>
                                    <h3 className="font-medium text-foreground flex items-center gap-2">
                                        <CalendarDays className="w-4 h-4 text-primary" />
                                        Reporte Mensual
                                    </h3>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Genera un resumen acumulado de todo un mes.
                                    </p>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-4 items-end">
                                    <div className="space-y-1 w-full sm:w-auto">
                                        <label className="text-sm font-medium text-muted-foreground">Mes</label>
                                        <Select value={selectedMonth} onValueChange={setSelectedMonth} disabled={isExporting}>
                                            <SelectTrigger className="w-full sm:w-[150px]">
                                                <SelectValue placeholder="Mes" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {[
                                                    { v: "0", l: "Enero" }, { v: "1", l: "Febrero" },
                                                    { v: "2", l: "Marzo" }, { v: "3", l: "Abril" },
                                                    { v: "4", l: "Mayo" }, { v: "5", l: "Junio" },
                                                    { v: "6", l: "Julio" }, { v: "7", l: "Agosto" },
                                                    { v: "8", l: "Septiembre" }, { v: "9", l: "Octubre" },
                                                    { v: "10", l: "Noviembre" }, { v: "11", l: "Diciembre" }
                                                ].map(m => (
                                                    <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1 w-full sm:w-auto">
                                        <label className="text-sm font-medium text-muted-foreground">Año</label>
                                        <Select value={selectedYear} onValueChange={setSelectedYear} disabled={isExporting}>
                                            <SelectTrigger className="w-full sm:w-[120px]">
                                                <SelectValue placeholder="Año" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {[2024, 2025, 2026, 2027].map(y => (
                                                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button
                                        className="w-full sm:w-auto gap-2 bg-green-600 hover:bg-green-700 text-white"
                                        disabled={isExporting}
                                        onClick={handleDownloadMonth}
                                    >
                                        {isExporting ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</> : <><Download className="w-4 h-4" /> Generar reporte del mes</>}
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-4 bg-slate-50/50 p-5 rounded-lg border border-border">
                                <div>
                                    <h3 className="font-medium text-foreground flex items-center gap-2">
                                        <CalendarDays className="w-4 h-4 text-primary" />
                                        Reporte por Fechas
                                    </h3>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Genera un resumen para un rango de fechas específico.
                                    </p>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-4 items-end">
                                    <div className="space-y-1 w-full sm:w-auto">
                                        <label className="text-sm font-medium text-muted-foreground">Fecha Inicio</label>
                                        <input
                                            type="date"
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            value={customStartDate}
                                            onChange={(e) => setCustomStartDate(e.target.value)}
                                            disabled={isExporting}
                                        />
                                    </div>
                                    <div className="space-y-1 w-full sm:w-auto">
                                        <label className="text-sm font-medium text-muted-foreground">Fecha Fin</label>
                                        <input
                                            type="date"
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            value={customEndDate}
                                            onChange={(e) => setCustomEndDate(e.target.value)}
                                            disabled={isExporting}
                                        />
                                    </div>
                                    <Button
                                        className="w-full sm:w-auto gap-2 bg-green-600 hover:bg-green-700 text-white"
                                        disabled={isExporting}
                                        onClick={handleDownloadCustomDate}
                                    >
                                        {isExporting ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</> : <><Download className="w-4 h-4" /> Generar reporte</>}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default ReportsPage;
