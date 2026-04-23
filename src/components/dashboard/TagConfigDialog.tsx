import * as React from "react";
import { Settings2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TagConfig } from "@/context/DashboardDataContext";

interface TagConfigDialogProps {
    availableLabels: string[];
    config: TagConfig;
    onSave: (config: TagConfig) => void;
}

export function TagConfigDialog({
    availableLabels,
    config,
    onSave,
}: TagConfigDialogProps) {
    const [open, setOpen] = React.useState(false);
    const [tempConfig, setTempConfig] = React.useState<TagConfig>(config);

    // Sync temp state with prop when dialog opens
    React.useEffect(() => {
        if (open) {
            setTempConfig(config);
        }
    }, [open, config]);

    const toggleTag = (category: keyof TagConfig, tag: string) => {
        setTempConfig((prev) => ({
            ...prev,
            [category]: prev[category].includes(tag)
                ? prev[category].filter((t) => t !== tag)
                : [...prev[category], tag],
        }));
    };

    const handleSave = () => {
        onSave(tempConfig);
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Settings2 className="h-4 w-4" />
                    Configurar Funnel
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Configurar Etiquetas del Funnel</DialogTitle>
                    <DialogDescription>
                        Selecciona qué etiquetas de Chatwoot corresponden a cada etapa de tu proceso comercial.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="sql" className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="sql">SQLs</TabsTrigger>
                        <TabsTrigger value="appointments">Citas</TabsTrigger>
                        <TabsTrigger value="sales">Ventas</TabsTrigger>
                        <TabsTrigger value="unqualified">No Aplica</TabsTrigger>
                    </TabsList>

                    {(['sqlTags', 'appointmentTags', 'saleTags', 'unqualifiedTags'] as const).map((category) => (
                        <TabsContent
                            key={category}
                            value={
                                category === 'sqlTags' ? 'sql' :
                                    category === 'appointmentTags' ? 'appointments' :
                                        category === 'saleTags' ? 'sales' : 'unqualified'
                            }
                        >
                            <ScrollArea className="h-[300px] border rounded-md p-4 mt-2">
                                <div className="grid grid-cols-2 gap-4">
                                    {availableLabels.length === 0 ? (
                                        <div className="col-span-2 text-center py-8 text-muted-foreground italic text-sm">
                                            No se detectaron etiquetas en Chatwoot todavía.
                                        </div>
                                    ) : (
                                        availableLabels.map((label) => (
                                            <div key={label} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`${category}-${label}`}
                                                    checked={tempConfig[category].includes(label)}
                                                    onCheckedChange={() => toggleTag(category, label)}
                                                />
                                                <Label
                                                    htmlFor={`${category}-${label}`}
                                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 whitespace-nowrap overflow-hidden text-ellipsis"
                                                >
                                                    {label}
                                                </Label>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </ScrollArea>
                        </TabsContent>
                    ))}
                </Tabs>

                <DialogFooter>
                    <Button onClick={handleSave}>Aplicar Cambios</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
