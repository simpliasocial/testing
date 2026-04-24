import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useDashboardContext, DEFAULT_TAG_CONFIG } from "@/context/DashboardDataContext";
import {
    Loader2,
    Download,
    Mail,
    Settings,
    PlayCircle,
    CheckCircle2,
    Clock,
    Plus,
    Trash2,
    FileSpreadsheet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import ReportsPage from "@/pages/ReportsPage";
import { useAuth } from "@/context/AuthContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import { supabase } from "@/lib/supabase";

interface ScheduledReport {
    id: string;
    name: string;
    frequency: 'weekly' | 'monthly';
    schedule_days: string[];
    schedule_month_day: number | null;
    schedule_time: string;
    recipients: string;
    is_active: boolean;
    last_run_at?: string;
    created_at?: string;
}

const DAY_OPTIONS = [
    { label: 'LU', value: '1' },
    { label: 'MA', value: '2' },
    { label: 'MI', value: '3' },
    { label: 'JU', value: '4' },
    { label: 'VI', value: '5' },
    { label: 'SA', value: '6' },
    { label: 'DO', value: '0' },
];

const ReportingLayer = () => {
    const [view, setView] = useState<'exports' | 'scheduled' | 'config'>('exports');
    const { loading: contextLoading, tagSettings, updateTagSettings, contactAttributeDefinitions, labels } = useDashboardContext();
    const { role } = useAuth();
    const [isLoading, setIsLoading] = useState(false);

    const [reports, setReports] = useState<ScheduledReport[]>([]);

    // Dialog state
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingReport, setEditingReport] = useState<ScheduledReport | null>(null);
    const [formData, setFormData] = useState<Partial<ScheduledReport>>({
        name: '',
        frequency: 'weekly',
        schedule_days: ['1', '2', '3', '4', '5'],
        schedule_month_day: 1,
        schedule_time: '08:00',
        recipients: '',
        is_active: true
    });

    const fetchReports = async () => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase
                .schema('cw')
                .from('automated_reports')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setReports(data || []);
        } catch (error) {
            console.error("Error fetching reports:", error);
            // toast.error("Error al cargar automatizaciones");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, []);

    const openCreateDialog = () => {
        setEditingReport(null);
        setFormData({
            name: '',
            frequency: 'weekly',
            schedule_days: ['1', '2', '3', '4', '5'],
            schedule_month_day: 1,
            schedule_time: '08:00',
            recipients: '',
            is_active: true
        });
        setIsDialogOpen(true);
    };

    const openEditDialog = (report: ScheduledReport) => {
        setEditingReport(report);
        setFormData({ ...report });
        setIsDialogOpen(true);
    };

    const handleSaveReport = async () => {
        if (!formData.name || !formData.recipients) {
            toast.error("Por favor completa el nombre y destinatarios");
            return;
        }

        try {
            setIsLoading(true);
            const reportData = {
                name: formData.name,
                frequency: formData.frequency || 'weekly',
                schedule_days: formData.frequency === 'weekly' ? formData.schedule_days : [],
                schedule_month_day: formData.frequency === 'monthly' ? formData.schedule_month_day : null,
                schedule_time: formData.schedule_time,
                recipients: formData.recipients,
                is_active: formData.is_active ?? true,
                updated_at: new Date().toISOString()
            };

            if (editingReport) {
                const { error } = await supabase
                    .schema('cw')
                    .from('automated_reports')
                    .update(reportData)
                    .eq('id', editingReport.id);
                if (error) throw error;
                toast.success("Reporte actualizado");
            } else {
                const { error } = await supabase
                    .schema('cw')
                    .from('automated_reports')
                    .insert([{ ...reportData, created_at: new Date().toISOString() }]);
                if (error) throw error;
                toast.success("Reporte programado con éxito");
            }
            setIsDialogOpen(false);
            fetchReports();
        } catch (error) {
            console.error("Error saving report:", error);
            toast.error("Error al guardar la configuración");
        } finally {
            setIsLoading(false);
        }
    };

    const toggleStatus = async (report: ScheduledReport) => {
        try {
            const newStatus = !report.is_active;
            const { error } = await supabase
                .schema('cw')
                .from('automated_reports')
                .update({ is_active: newStatus })
                .eq('id', report.id);

            if (error) throw error;
            setReports(reports.map(r => r.id === report.id ? { ...r, is_active: newStatus } : r));
            toast.info(`Reporte ${newStatus ? 'activado' : 'pausado'}`);
        } catch (error) {
            console.error("Error toggling status:", error);
        }
    };

    const deleteReport = async (id: string) => {
        if (!confirm("¿Estás seguro de eliminar esta programación?")) return;
        try {
            const { error } = await supabase
                .schema('cw')
                .from('automated_reports')
                .delete()
                .eq('id', id);

            if (error) throw error;
            setReports(reports.filter(r => r.id !== id));
            toast.error("Reporte eliminado");
        } catch (error) {
            console.error("Error deleting report:", error);
        }
    };

    if (contextLoading || isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex gap-2 p-1 bg-muted w-fit rounded-lg">
                <Button
                    variant={view === 'exports' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setView('exports')}
                    className="gap-2"
                >
                    <Download className="w-4 h-4" />
                    Exportación Manual
                </Button>
                <Button
                    variant={view === 'scheduled' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setView('scheduled')}
                    className="gap-2"
                >
                    <Mail className="w-4 h-4" />
                    Reportes Programados
                </Button>
                {role === 'admin' && (
                    <Button
                        variant={view === 'config' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setView('config')}
                        className="gap-2"
                    >
                        <Settings className="w-4 h-4" />
                        Configuración Excel
                    </Button>
                )}
            </div>

            {view === 'exports' ? (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <ReportsPage />
                </div>
            ) : view === 'config' ? (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileSpreadsheet className="w-5 h-5 text-primary" />
                                Configuración de Columnas Excel
                            </CardTitle>
                            <CardDescription>
                                Selecciona qué campos se incluirán en las exportaciones manuales y automáticas.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div className="space-y-4">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Campos Base</h3>
                                    <div className="space-y-2">
                                        {["ID", "Nombre", "Telefono", "Canal", "Etiquetas", "Correo", "Enlace Chatwoot", "Fecha Ingreso", "Ultima Interaccion"].map(field => (
                                            <div key={field} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`field-${field}`}
                                                    checked={tagSettings?.excelExportFields?.includes(field) || false}
                                                    onCheckedChange={(checked) => {
                                                        const current = tagSettings?.excelExportFields || [];
                                                        const next = checked
                                                            ? [...current, field]
                                                            : current.filter(f => f !== field);
                                                        updateTagSettings({ ...(tagSettings || DEFAULT_TAG_CONFIG), excelExportFields: next });
                                                    }}
                                                />
                                                <Label htmlFor={`field-${field}`}>{field}</Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Métricas Operativas</h3>
                                    <div className="space-y-2">
                                        {["Monto", "Fecha Monto", "Agencia", "Check-in", "Check-out", "Campana", "Ciudad", "Responsable", "URL Red Social"].map(field => (
                                            <div key={field} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`field-${field}`}
                                                    checked={tagSettings?.excelExportFields?.includes(field) || false}
                                                    onCheckedChange={(checked) => {
                                                        const current = tagSettings?.excelExportFields || [];
                                                        const next = checked
                                                            ? [...current, field]
                                                            : current.filter(f => f !== field);
                                                        updateTagSettings({ ...(tagSettings || DEFAULT_TAG_CONFIG), excelExportFields: next });
                                                    }}
                                                />
                                                <Label htmlFor={`field-${field}`}>{field}</Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Atributos Técnicos (IDs)</h3>
                                    <div className="space-y-2">
                                        {["ID Contacto", "ID Inbox", "ID Cuenta", "Origen Dato"].map(field => (
                                            <div key={field} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`field-${field}`}
                                                    checked={tagSettings?.excelExportFields?.includes(field) || false}
                                                    onCheckedChange={(checked) => {
                                                        const current = tagSettings?.excelExportFields || [];
                                                        const next = checked
                                                            ? [...current, field]
                                                            : current.filter(f => f !== field);
                                                        updateTagSettings({ ...(tagSettings || DEFAULT_TAG_CONFIG), excelExportFields: next });
                                                    }}
                                                />
                                                <Label htmlFor={`field-${field}`}>{field}</Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 border-t">
                                <p className="text-xs text-muted-foreground italic">
                                    Los cambios se guardan automáticamente y afectan a todas las exportaciones del sistema.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="w-5 h-5 text-primary" />
                                Automatizaciones Activas
                            </CardTitle>
                            <CardDescription>Gestión de envíos automáticos a gerencia y stakeholders</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-xl overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-muted/50 text-muted-foreground font-medium border-b text-[10px] uppercase">
                                        <tr>
                                            <th className="px-6 py-4">Reporte</th>
                                            <th className="px-6 py-4">Horario</th>
                                            <th className="px-6 py-4">Destinatarios</th>
                                            <th className="px-6 py-4">Estado</th>
                                            <th className="px-6 py-4 text-right">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reports.map((report) => (
                                            <tr key={report.id} className="border-b hover:bg-muted/30 transition-colors group">
                                                <td className="px-6 py-4 font-medium">{report.name}</td>
                                                <td className="px-6 py-4 text-xs font-mono">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="font-bold text-primary">{report.schedule_time}</span>
                                                        {report.frequency === 'weekly' ? (
                                                            <div className="flex gap-1">
                                                                {DAY_OPTIONS.map(d => (
                                                                    <span
                                                                        key={d.value}
                                                                        className={`text-[9px] px-1 rounded ${report.schedule_days.includes(d.value) ? 'bg-primary/10 text-primary font-bold' : 'text-slate-300'}`}
                                                                    >
                                                                        {d.label}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border italic">
                                                                Día {report.schedule_month_day} de cada mes
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-xs text-muted-foreground max-w-[200px] truncate">{report.recipients}</td>
                                                <td className="px-6 py-4">
                                                    <Badge
                                                        variant={report.is_active ? 'default' : 'outline'}
                                                        className={`cursor-pointer transition-all ${report.is_active ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : ''}`}
                                                        onClick={() => toggleStatus(report)}
                                                    >
                                                        {report.is_active ? 'Activo' : 'Pausado'}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                                            onClick={() => openEditDialog(report)}
                                                        >
                                                            <Settings className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-destructive/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                            onClick={() => deleteReport(report.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-6">
                        <Card className="bg-primary/5 border-primary/10">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                    <PlayCircle className="w-4 h-4 text-primary" />
                                    Registro de Envío
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {[
                                        { time: "Hoy, 08:00 AM", res: "Exitoso", detail: "3 destinatarios" },
                                        { time: "Ayer, 08:00 AM", res: "Exitoso", detail: "3 destinatarios" },
                                        { time: "07 Abr, 08:00 AM", res: "Error", detail: "SMTP Timeout" },
                                    ].map((log, i) => (
                                        <div key={i} className="flex gap-3 border-l-2 border-primary/20 pl-4 py-1">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-bold">{log.time}</span>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <CheckCircle2 className={`w-3 h-3 ${log.res === 'Exitoso' ? 'text-green-500' : 'text-red-500'}`} />
                                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{log.res}: {log.detail}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Button
                            className="w-full gap-2 py-6 text-md font-bold rounded-2xl shadow-lg border-b-4 border-primary/20 hover:translate-y-[1px] active:translate-y-[2px] transition-all"
                            onClick={openCreateDialog}
                        >
                            <Plus className="w-5 h-5" />
                            Configurar Nuevo Reporte
                        </Button>
                    </div>
                </div>
            )
            }

            {/* SHARED DIALOG FOR CREATE/EDIT */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{editingReport ? 'Editar Programación' : 'Programar Nuevo Reporte'}</DialogTitle>
                        <DialogDescription>
                            {editingReport ? 'Modifica los parámetros del reporte seleccionado.' : 'Configura un envío automático de métricas por correo.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Nombre del Reporte</label>
                            <Input
                                placeholder="Ej: Resumen Comercial"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Frecuencia</label>
                            <div className="flex gap-2 p-1 bg-muted rounded-md border shadow-sm">
                                <Button
                                    type="button"
                                    variant={formData.frequency === 'weekly' ? 'secondary' : 'ghost'}
                                    className={`flex-1 text-xs font-semibold h-7 transition-all ${formData.frequency === 'weekly' ? 'bg-white shadow-sm' : ''}`}
                                    onClick={() => setFormData({ ...formData, frequency: 'weekly' })}
                                >
                                    Semanal
                                </Button>
                                <Button
                                    type="button"
                                    variant={formData.frequency === 'monthly' ? 'secondary' : 'ghost'}
                                    className={`flex-1 text-xs font-semibold h-7 transition-all ${formData.frequency === 'monthly' ? 'bg-white shadow-sm' : ''}`}
                                    onClick={() => setFormData({ ...formData, frequency: 'monthly' })}
                                >
                                    Mensual
                                </Button>
                            </div>
                        </div>

                        {formData.frequency === 'weekly' ? (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                <label className="text-sm font-medium">Días de Envío</label>
                                <div className="flex flex-wrap gap-2">
                                    {DAY_OPTIONS.map((day) => {
                                        const isSelected = formData.schedule_days?.includes(day.value);
                                        return (
                                            <Button
                                                key={day.value}
                                                type="button"
                                                variant={isSelected ? "default" : "outline"}
                                                size="sm"
                                                className={`h-8 w-10 p-0 text-[10px] ${isSelected ? 'bg-primary' : ''}`}
                                                onClick={() => {
                                                    const current = formData.schedule_days || [];
                                                    const next = isSelected
                                                        ? current.filter(d => d !== day.value)
                                                        : [...current, day.value];
                                                    setFormData({ ...formData, schedule_days: next });
                                                }}
                                            >
                                                {day.label}
                                            </Button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                <label className="text-sm font-medium">Día del Mes (1-31)</label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={31}
                                    value={formData.schedule_month_day || 1}
                                    onChange={(e) => setFormData({ ...formData, schedule_month_day: parseInt(e.target.value) })}
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Hora de Envío</label>
                                <Input
                                    type="time"
                                    value={formData.schedule_time}
                                    onChange={(e) => setFormData({ ...formData, schedule_time: e.target.value })}
                                />
                            </div>
                            <div className="flex items-end">
                                <div className="p-3 bg-blue-50 text-blue-700 rounded-lg text-[10px] italic border border-blue-100 w-full flex items-center gap-2">
                                    <FileSpreadsheet className="h-4 w-4 shrink-0" />
                                    <span>Se enviará el reporte estándar de Excel</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Emails de Destino (separados por coma)</label>
                            <Input
                                placeholder="ejemplo@simplia.com, gerente@simplia.com"
                                value={formData.recipients}
                                onChange={(e) => setFormData({ ...formData, recipients: e.target.value })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveReport}>
                            {editingReport ? 'Actualizar' : 'Confirmar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
};

export default ReportingLayer;
