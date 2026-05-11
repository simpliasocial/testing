import { CheckCircle2, FileSpreadsheet, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_TAG_CONFIG, type TagConfig } from "@/domain/dashboard";
import { formatFieldLabel } from "@/lib/displayCopy";
import { money } from "@/lib/leadDisplay";

type SalesExportFieldGroup = {
    title: string;
    fields: string[];
};

type SalesReportPanelProps = {
    salesCount: number;
    salesTotal: number;
    salesStartDate: string;
    salesEndDate: string;
    salesSearch: string;
    canConfigureColumns: boolean;
    tagSettings: TagConfig;
    onSalesStartDateChange: (value: string) => void;
    onSalesEndDateChange: (value: string) => void;
    onSalesSearchChange: (value: string) => void;
    onExportSalesReport: () => void;
    updateTagSettings: (config: TagConfig) => Promise<void>;
};

const SALES_EXPORT_FIELD_GROUPS: SalesExportFieldGroup[] = [
    {
        title: "Campos Base",
        fields: [
            "ID",
            "Nombre",
            "Telefono",
            "Canal",
            "Estados",
            "Correo",
            "Enlace de conversación",
            "Fecha Ingreso",
            "Ultima Interaccion",
        ],
    },
    {
        title: "Métricas Operativas",
        fields: [
            "Monto",
            "Fecha Monto",
            "Agencia",
            "Check-in",
            "Check-out",
            "Campana",
            "Ciudad",
            "Responsable",
            "URL Red Social",
        ],
    },
    {
        title: "Datos de referencia",
        fields: [
            "ID Contacto",
            "ID Inbox",
            "ID Cuenta",
            "Origen Dato",
        ],
    },
];

export const SalesReportPanel = ({
    salesCount,
    salesTotal,
    salesStartDate,
    salesEndDate,
    salesSearch,
    canConfigureColumns,
    tagSettings,
    onSalesStartDateChange,
    onSalesEndDateChange,
    onSalesSearchChange,
    onExportSalesReport,
    updateTagSettings,
}: SalesReportPanelProps) => {
    const updateExportField = (field: string, checked: boolean) => {
        const current = tagSettings.excelExportFields || [];
        const next = checked
            ? Array.from(new Set([...current, field]))
            : current.filter((configuredField) => configuredField !== field);

        void updateTagSettings({
            ...DEFAULT_TAG_CONFIG,
            ...tagSettings,
            excelExportFields: next,
        });
    };

    return (
        <Card className="mx-auto w-full max-w-4xl border-primary/20 shadow-sm">
            <CardHeader>
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <FileSpreadsheet className="h-6 w-6 text-primary" />
                            Reporte de ventas exitosas
                        </CardTitle>
                        <CardDescription>
                            Filtra y exporta las ventas y operaciones que han sido marcadas como exitosas.
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border bg-primary/10 px-3 py-2 text-sm text-primary">
                        <CheckCircle2 className="h-4 w-4" />
                        {salesCount} ventas filtradas - {money(salesTotal)}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Desde</label>
                        <Input
                            type="date"
                            value={salesStartDate}
                            onChange={(event) => onSalesStartDateChange(event.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Hasta</label>
                        <Input
                            type="date"
                            value={salesEndDate}
                            onChange={(event) => onSalesEndDateChange(event.target.value)}
                        />
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Buscar en ventas</label>
                    <Input
                        placeholder="Nombre, telefono, ID o canal"
                        value={salesSearch}
                        onChange={(event) => onSalesSearchChange(event.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        className="flex-1 gap-2 border-primary text-primary hover:bg-primary/5"
                        onClick={onExportSalesReport}
                    >
                        <FileSpreadsheet className="h-4 w-4" />
                        Exportar Excel completo
                    </Button>
                    {canConfigureColumns && (
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="gap-2 border-primary text-primary hover:bg-primary/5"
                                    title="Configurar Columnas"
                                >
                                    <Settings2 className="h-4 w-4" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-3xl">
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                        <FileSpreadsheet className="h-5 w-5 text-primary" />
                                        Configuración de Columnas Excel
                                    </DialogTitle>
                                    <DialogDescription>
                                        Selecciona qué campos se incluirán en la exportación de ventas.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="max-h-[60vh] space-y-6 overflow-y-auto pr-2 pt-4">
                                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                        {SALES_EXPORT_FIELD_GROUPS.map((group) => (
                                            <div key={group.title} className="space-y-4">
                                                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                                                    {group.title}
                                                </h3>
                                                <div className="space-y-2">
                                                    {group.fields.map((field) => (
                                                        <div key={`ventas-field-${field}`} className="flex items-center space-x-2">
                                                            <Checkbox
                                                                id={`ventas-field-${field}`}
                                                                checked={tagSettings.excelExportFields?.includes(field) || false}
                                                                onCheckedChange={(checked) => updateExportField(field, checked === true)}
                                                            />
                                                            <Label htmlFor={`ventas-field-${field}`}>{formatFieldLabel(field)}</Label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <DialogFooter className="mt-4">
                                    <DialogTrigger asChild>
                                        <Button variant="outline">Cerrar</Button>
                                    </DialogTrigger>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
