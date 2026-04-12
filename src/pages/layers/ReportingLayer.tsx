import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import {
    Loader2,
    Download,
    Mail,
    Settings,
    PlayCircle,
    CheckCircle2,
    Clock,
    Plus,
    Trash2
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

interface ScheduledReport {
    id: string;
    name: string;
    freq: string;
    to: string;
    status: 'Activo' | 'Pausado';
}

const ReportingLayer = () => {
    const [view, setView] = useState<'exports' | 'scheduled'>('exports');
    const { loading } = useDashboardData();

    const [reports, setReports] = useState<ScheduledReport[]>([
        { id: '1', name: "Resumen Ejecutivo Semanal", freq: "Semanal", to: "gerencia@corp.com", status: "Activo" },
        { id: '2', name: "Reporte de Cierre Mensual", freq: "Mensual", to: "ventas@corp.com", status: "Activo" },
        { id: '3', name: "Alerta de SLA Vencido", freq: "Diario", to: "ops@corp.com", status: "Pausado" },
    ]);

    // Dialog state
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingReport, setEditingReport] = useState<ScheduledReport | null>(null);
    const [formData, setFormData] = useState<Partial<ScheduledReport>>({
        name: '',
        freq: 'Semanal',
        to: '',
        status: 'Activo'
    });

    const openCreateDialog = () => {
        setEditingReport(null);
        setFormData({ name: '', freq: 'Semanal', to: '', status: 'Activo' });
        setIsDialogOpen(true);
    };

    const openEditDialog = (report: ScheduledReport) => {
        setEditingReport(report);
        setFormData({ ...report });
        setIsDialogOpen(true);
    };

    const handleSaveReport = () => {
        if (!formData.name || !formData.to) {
            toast.error("Por favor completa todos los campos");
            return;
        }

        if (editingReport) {
            // Update
            setReports(reports.map(r => r.id === editingReport.id ? { ...r, ...formData } as ScheduledReport : r));
            toast.success("Reporte actualizado");
        } else {
            // Create
            const report: ScheduledReport = {
                id: Math.random().toString(36).substr(2, 9),
                name: formData.name!,
                freq: formData.freq!,
                to: formData.to!,
                status: 'Activo'
            };
            setReports([...reports, report]);
            toast.success("Reporte programado con éxito");
        }
        setIsDialogOpen(false);
    };

    const toggleStatus = (id: string) => {
        setReports(reports.map(r =>
            r.id === id ? { ...r, status: r.status === 'Activo' ? 'Pausado' : 'Activo' } : r
        ));
        toast.info("Estado del reporte actualizado");
    };

    const deleteReport = (id: string) => {
        setReports(reports.filter(r => r.id !== id));
        toast.error("Reporte eliminado");
    };

    if (loading) {
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
            </div>

            {view === 'exports' ? (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <ReportsPage />
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
                                            <th className="px-6 py-4">Frecuencia</th>
                                            <th className="px-6 py-4">Destinatarios</th>
                                            <th className="px-6 py-4">Estado</th>
                                            <th className="px-6 py-4 text-right">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reports.map((report) => (
                                            <tr key={report.id} className="border-b hover:bg-muted/30 transition-colors group">
                                                <td className="px-6 py-4 font-medium">{report.name}</td>
                                                <td className="px-6 py-4 text-xs font-mono">{report.freq}</td>
                                                <td className="px-6 py-4 text-xs text-muted-foreground">{report.to}</td>
                                                <td className="px-6 py-4">
                                                    <Badge
                                                        variant={report.status === 'Activo' ? 'default' : 'outline'}
                                                        className={`cursor-pointer transition-all ${report.status === 'Activo' ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200' : ''}`}
                                                        onClick={() => toggleStatus(report.id)}
                                                    >
                                                        {report.status}
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
            )}

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
                            <Select
                                value={formData.freq}
                                onValueChange={(val) => setFormData({ ...formData, freq: val })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar frecuencia" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Diario">Diario (08:00 AM)</SelectItem>
                                    <SelectItem value="Semanal">Semanal (Lunes)</SelectItem>
                                    <SelectItem value="Mensual">Mensual (Día 1)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Email de Destino</label>
                            <Input
                                placeholder="ejemplo@simplia.com"
                                value={formData.to}
                                onChange={(e) => setFormData({ ...formData, to: e.target.value })}
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
        </div>
    );
};

export default ReportingLayer;
