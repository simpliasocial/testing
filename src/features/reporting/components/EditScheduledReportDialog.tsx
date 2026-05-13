import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    CRITICAL_REPORT_PROFILES,
    REPORT_FORMATS,
    WEEKDAY_OPTIONS,
    type ScheduledReport,
    type ReportFileFormat,
    type ReportFrequency,
} from "../domain/reportCatalog";

interface EditScheduledReportDialogProps {
    report: ScheduledReport | null;
    onClose: () => void;
    onSave: (reportId: string, updates: Partial<ScheduledReport>) => Promise<boolean>;
}

const normalizeEmailList = (value: string) => value
    .split(/[;,\n]/)
    .map((email) => email.trim())
    .filter(Boolean)
    .join(", ");

export function EditScheduledReportDialog({
    report,
    onClose,
    onSave,
}: EditScheduledReportDialogProps) {
    const [scheduleName, setScheduleName] = useState("");
    const [frequency, setFrequency] = useState<ReportFrequency>("weekly");
    const [weekday, setWeekday] = useState("1");
    const [monthDay, setMonthDay] = useState("1");
    const [scheduleTime, setScheduleTime] = useState("08:00");
    const [recipients, setRecipients] = useState("");
    const [selectedFormats, setSelectedFormats] = useState<ReportFileFormat[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const availableFormats = report?.critical_profile_key
        ? REPORT_FORMATS.filter((formatOption) => CRITICAL_REPORT_PROFILES[report.critical_profile_key!]?.fileFormats.includes(formatOption.id))
        : REPORT_FORMATS;

    useEffect(() => {
        if (report) {
            const profileFormats = report.critical_profile_key
                ? CRITICAL_REPORT_PROFILES[report.critical_profile_key]?.fileFormats || []
                : [];
            const storedFormats = report.file_formats || [];
            const storedAllowedFormats = profileFormats.length > 0
                ? storedFormats.filter((formatId) => profileFormats.includes(formatId))
                : storedFormats;
            setScheduleName(report.name || "");
            setFrequency(report.frequency || "weekly");
            setWeekday(report.schedule_days?.[0] || "1");
            setMonthDay(report.schedule_month_day?.toString() || "1");
            setScheduleTime(report.schedule_time?.slice(0, 5) || "08:00");
            setRecipients(report.recipients || "");
            setSelectedFormats(storedAllowedFormats.length > 0 ? storedAllowedFormats : profileFormats.length > 0 ? profileFormats : ["excel"]);
        }
    }, [report]);

    const toggleFormat = (formatId: ReportFileFormat, checked: boolean | string) => {
        setSelectedFormats((current) => {
            const isChecked = checked === true;
            const next = isChecked
                ? Array.from(new Set([...current, formatId]))
                : current.filter((item) => item !== formatId);
            return next.length > 0 ? next : current;
        });
    };

    const handleUpdate = async () => {
        if (!report) return;

        const cleanName = scheduleName.trim();
        const cleanRecipients = normalizeEmailList(recipients);
        const dayNumber = Math.min(31, Math.max(1, Number.parseInt(monthDay || "1", 10) || 1));

        if (!cleanName) {
            toast.error("Escribe un nombre para el reporte");
            return;
        }
        if (!cleanRecipients) {
            toast.error("Agrega al menos un correo destino");
            return;
        }
        const allowedSelectedFormats = report.critical_profile_key
            ? selectedFormats.filter((formatId) => CRITICAL_REPORT_PROFILES[report.critical_profile_key!]?.fileFormats.includes(formatId))
            : selectedFormats;

        if (allowedSelectedFormats.length === 0) {
            toast.error("Selecciona al menos un formato");
            return;
        }

        setIsSaving(true);
        const success = await onSave(report.id, {
            name: cleanName,
            frequency,
            schedule_days: frequency === "weekly" ? [weekday] : [],
            schedule_month_day: frequency === "monthly" ? dayNumber : null,
            schedule_time: scheduleTime,
            recipients: cleanRecipients,
            file_formats: allowedSelectedFormats,
        });
        
        setIsSaving(false);
        if (success) {
            toast.success("Reporte automático actualizado");
            onClose();
        }
    };

    return (
        <Dialog open={Boolean(report)} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle>Editar reporte automático</DialogTitle>
                    <DialogDescription>
                        Modifica la configuración de envío por correo para este reporte.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-2">
                    <div className="space-y-2">
                        <Label>Nombre</Label>
                        <Input value={scheduleName} onChange={(event) => setScheduleName(event.target.value)} />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Frecuencia</Label>
                            <Select value={frequency} onValueChange={(value: ReportFrequency) => setFrequency(value)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="daily">Diario</SelectItem>
                                    <SelectItem value="weekly">Semanal</SelectItem>
                                    <SelectItem value="monthly">Mensual</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {frequency === "weekly" && (
                            <div className="space-y-2">
                                <Label>Día de la semana</Label>
                                <Select value={weekday} onValueChange={setWeekday}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {WEEKDAY_OPTIONS.map((day) => (
                                            <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        
                        {frequency === "monthly" && (
                            <div className="space-y-2">
                                <Label>Día del mes</Label>
                                <Input type="number" min={1} max={31} value={monthDay} onChange={(event) => setMonthDay(event.target.value)} />
                                <p className="text-[11px] text-muted-foreground">Si el mes no tiene ese día, se enviará el último día del mes.</p>
                            </div>
                        )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Hora de envío</Label>
                            <Input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Formatos</Label>
                            <div className="flex flex-wrap gap-3 rounded-lg border p-3">
                                {availableFormats.map((formatOption) => (
                                    <label key={formatOption.id} className="flex items-center gap-2 text-sm">
                                        <Checkbox
                                            checked={selectedFormats.includes(formatOption.id)}
                                            onCheckedChange={(checked) => toggleFormat(formatOption.id, checked)}
                                        />
                                        {formatOption.label}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Correos destino</Label>
                        <Input
                            placeholder="gerencia@simplia.com, operaciones@simplia.com"
                            value={recipients}
                            onChange={(event) => setRecipients(event.target.value)}
                        />
                        <p className="text-[11px] text-muted-foreground">Puedes separar varios correos con coma, punto y coma o salto de línea.</p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                    <Button onClick={handleUpdate} disabled={isSaving} className="gap-2">
                        {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Guardar cambios
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
