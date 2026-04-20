import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import {
    Loader2,
    ListTodo,
    ExternalLink,
    Clock,
    User,
    MessageSquare,
    RefreshCw,
    Phone,
    UserCircle,
    CheckCircle2,
    AlertTriangle,
    Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { config } from "@/config";
import { useDashboardContext } from "@/context/DashboardDataContext";
import { chatwootService } from "@/services/ChatwootService";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

const LeadActionQueue = () => {
    const { globalFilters, tagSettings, labels: allAvailableLabels } = useDashboardContext();
    const { loading, error, data, refetch } = useDashboardData({
        ...globalFilters,
        ...tagSettings
    });

    const [selectedLead, setSelectedLead] = useState<any>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
    const [historyMessages, setHistoryMessages] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [newTag, setNewTag] = useState<string>("");

    const queue = useMemo(() => {
        return data.operationalMetrics?.followUpQueue || [];
    }, [data]);

    const handleViewHistory = async (lead: any) => {
        setSelectedLead(lead);
        setIsHistoryOpen(true);
        setLoadingHistory(true);
        try {
            const messages = await chatwootService.getMessages(lead.id);
            setHistoryMessages(messages);
        } catch (err) {
            console.error("Error fetching history:", err);
            toast.error("No se pudo cargar el historial");
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleOpenTagChange = (lead: any) => {
        setSelectedLead(lead);
        setIsTagDialogOpen(true);
    };

    const handleConfirmTagChange = () => {
        if (!newTag) return;
        setIsConfirmOpen(true);
    };

    const executeTagChange = async () => {
        if (!selectedLead || !newTag) return;

        try {
            // Chatwoot POST /labels replaces all labels
            await chatwootService.updateConversationLabels(selectedLead.id, [newTag]);
            toast.success(`Estado cambiado a: ${newTag}`);
            setIsTagDialogOpen(false);
            setIsConfirmOpen(false);
            // Local refetch or manual removal from list
            if (refetch) refetch();
        } catch (err) {
            console.error("Error changing tag:", err);
            toast.error("Error al cambiar la etiqueta en Chatwoot");
        }
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
            <Card className="border-primary/20 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-4">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <ListTodo className="h-6 w-6 text-primary" />
                            Cola de Trabajo Diaria
                        </CardTitle>
                        <CardDescription>
                            Mostrando leads con etiqueta <Badge variant="outline">seguimiento_humano</Badge>
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="relative overflow-x-auto border rounded-xl overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="text-[10px] text-muted-foreground uppercase bg-muted/30 border-b font-bold tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">Lead</th>
                                    <th className="px-6 py-4 text-center">Canal</th>
                                    <th className="px-6 py-4">Número / Contacto</th>
                                    <th className="px-6 py-4">Última Interacción</th>
                                    <th className="px-6 py-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-muted/20">
                                {queue.map((lead: any) => {
                                    const contactAttrs = lead.meta?.sender?.custom_attributes || {};
                                    const displayName = contactAttrs.nombre_completo || lead.name;
                                    const phoneDisplay = contactAttrs.celular || (lead.channel_type?.includes('whatsapp') ? lead.meta?.sender?.phone_number : "N/A");

                                    return (
                                        <tr key={lead.id} className="bg-background hover:bg-muted/10 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs uppercase">
                                                        {displayName.substring(0, 2)}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-foreground">{displayName}</span>
                                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                            <UserCircle className="w-3 h-3" />
                                                            {lead.owner}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex flex-col items-center">
                                                    <Badge variant="secondary" className="px-2 py-0 text-[10px] uppercase font-bold">
                                                        {lead.channel}
                                                    </Badge>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col text-xs gap-1">
                                                    <span className="flex items-center gap-1.5 text-muted-foreground font-medium italic">
                                                        <Phone className="w-3 h-3" />
                                                        {phoneDisplay}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col max-w-[200px]">
                                                    <span className="text-xs truncate text-foreground font-medium">
                                                        {lead.last_message?.content || "Sin mensajes"}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                                                        <Clock className="w-3 h-3" />
                                                        {new Date(lead.timestamp * 1000).toLocaleString()}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 w-8 p-0"
                                                        onClick={() => handleViewHistory(lead)}
                                                        title="Ver Historial"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 gap-2 text-xs border-primary/30 text-primary hover:bg-primary/5"
                                                        onClick={() => handleOpenTagChange(lead)}
                                                    >
                                                        <RefreshCw className="h-3.5 w-3.5" />
                                                        Estado
                                                    </Button>
                                                    <a
                                                        href={`${config.chatwoot.publicUrl}/app/accounts/${config.chatwoot.accountId}/conversations/${lead.id}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-primary">
                                                            <ExternalLink className="h-4 w-4" />
                                                        </Button>
                                                    </a>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {queue.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center gap-2 opacity-40">
                                                <CheckCircle2 className="h-12 w-12 text-muted-foreground" />
                                                <span className="text-sm italic font-medium">No hay leads en seguimiento humano. ¡Todo al día!</span>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* MESSAGE HISTORY DIALOG */}
            <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <DialogContent className="max-w-2xl sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5 text-primary" />
                            Historial de: {selectedLead?.name}
                        </DialogTitle>
                        <DialogDescription>
                            Mostrando últimos mensajes de la conversación en Chatwoot
                        </DialogDescription>
                    </DialogHeader>

                    <ScrollArea className="h-[500px] mt-4 pr-4">
                        {loadingHistory ? (
                            <div className="flex flex-col items-center justify-center h-full">
                                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                                <p className="text-sm text-muted-foreground">Cargando mensajes...</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {historyMessages.map((msg: any) => {
                                    const isOutgoing = msg.message_type === 1; // Outgoing (Agent/Bot)
                                    return (
                                        <div key={msg.id} className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${isOutgoing
                                                    ? 'bg-primary text-primary-foreground rounded-tr-none'
                                                    : 'bg-muted text-foreground rounded-tl-none'
                                                }`}>
                                                <div className="font-bold text-[10px] mb-1 opacity-70 uppercase">
                                                    {isOutgoing ? 'Agente / Bot' : 'Cliente'}
                                                </div>
                                                {msg.content}
                                                <div className="text-[9px] mt-1 text-right opacity-60">
                                                    {new Date(msg.created_at * 1000).toLocaleTimeString()}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </ScrollArea>

                    <DialogFooter className="mt-4 border-t pt-4">
                        <Button variant="outline" onClick={() => setIsHistoryOpen(false)}>Cerrar</Button>
                        <a
                            href={`${config.chatwoot.publicUrl}/app/accounts/${config.chatwoot.accountId}/conversations/${selectedLead?.id}`}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <Button className="gap-2">
                                <ExternalLink className="h-4 w-4" />
                                Responder en Chatwoot
                            </Button>
                        </a>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* TAG CHANGE DIALOG */}
            <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Cambiar Estado del Lead</DialogTitle>
                        <DialogDescription>
                            Selecciona una nueva etiqueta. Al hacerlo, el lead será procesado según el nuevo estado y <strong>desaparecerá de esta cola</strong>.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-6 space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Nueva Etiqueta</label>
                            <Select onValueChange={setNewTag} value={newTag}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar etiqueta..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {allAvailableLabels.map((label: string) => (
                                        <SelectItem key={label} value={label}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsTagDialogOpen(false)}>Cancelar</Button>
                        <Button
                            disabled={!newTag}
                            onClick={handleConfirmTagChange}
                            className="bg-amber-600 hover:bg-amber-700"
                        >
                            Cambiar Estado
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DOUBLE CONFIRMATION ALERT */}
            <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            ¿Confirmar cambio de estado?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-4 pt-2">
                            <p>
                                Estás a punto de cambiar la etiqueta a: <Badge variant="secondary">{newTag}</Badge>
                            </p>
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-sm">
                                <p className="font-bold mb-1">¡Recuerda!</p>
                                <p>Asegúrate de haber actualizado la información del cliente en los atributos si has agendado una cita o recopilado datos importantes.</p>
                                <p className="mt-2 text-[11px] opacity-70">Este lead desaparecerá de la Cola de Trabajo Diaria al ya no tener el estado de seguimiento humano.</p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={executeTagChange} className="bg-amber-600 hover:bg-amber-700">
                            Sí, confirmar cambio
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default LeadActionQueue;
