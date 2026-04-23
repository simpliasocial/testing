import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import {
    Loader2,
    ListTodo,
    ExternalLink,
    Clock,
    MessageSquare,
    RefreshCw,
    Phone,
    UserCircle,
    CheckCircle2,
    AlertTriangle,
    Search,
    DollarSign,
    FileSpreadsheet,
    CalendarDays,
    Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useDashboardContext } from "@/context/DashboardDataContext";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { ChannelSelector } from "@/components/dashboard/ChannelSelector";
import { ExportToExcel } from "@/components/dashboard/ExportToExcel";
import { chatwootService } from "@/services/ChatwootService";
import { SupabaseService } from "@/services/SupabaseService";
import { LabelEventService } from "@/services/LabelEventService";
import { supabase } from "@/lib/supabase";
import { getGuayaquilDateString } from "@/lib/guayaquilTime";
import { MinifiedConversation } from "@/services/StorageService";
import { DateRange } from "react-day-picker";
import {
    formatDateTime,
    getAttrs,
    getChatwootUrl,
    getInitials,
    getLastMessage,
    getLeadChannelName,
    getLeadEmail,
    getLeadExternalUrl,
    getLeadInboxName,
    getLeadName,
    getLeadOperationDate,
    getLeadPhone,
    getMessagePreview,
    getMessageTimestamp,
    getRawLeadPhone,
    money,
    normalize,
    operationDateToIso,
    parseAmount
} from "@/lib/leadDisplay";
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
import * as XLSX from "xlsx";

const SALE_LABEL = "venta_exitosa";

const LeadActionQueue = () => {
    const {
        globalFilters,
        tagSettings,
        labels: allAvailableLabels,
        conversations,
        inboxes,
        setGlobalFilters,
        refetch: refetchContext
    } = useDashboardContext();
    const { loading, error, data, refetch } = useDashboardData({
        ...globalFilters,
        ...tagSettings
    });

    const [selectedLead, setSelectedLead] = useState<any>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
    const [historyMessages, setHistoryMessages] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [isTagConfirmOpen, setIsTagConfirmOpen] = useState(false);
    const [newTag, setNewTag] = useState<string>("");

    const [operationSearch, setOperationSearch] = useState("");
    const [operationLead, setOperationLead] = useState<MinifiedConversation | null>(null);
    const [operationAmount, setOperationAmount] = useState("");
    const [operationDate, setOperationDate] = useState(getGuayaquilDateString());
    const [isOperationDialogOpen, setIsOperationDialogOpen] = useState(false);
    const [isOperationConfirmOpen, setIsOperationConfirmOpen] = useState(false);
    const [isSavingOperation, setIsSavingOperation] = useState(false);

    const [salesStartDate, setSalesStartDate] = useState("");
    const [salesEndDate, setSalesEndDate] = useState("");
    const [salesSearch, setSalesSearch] = useState("");

    const queue = useMemo(() => data.operationalMetrics?.followUpQueue || [], [data]);

    const handleQueueDateRangeChange = (range: DateRange | undefined) => {
        setGlobalFilters(prev => ({ ...prev, startDate: range?.from, endDate: range?.to }));
    };

    const handleQueueInboxesChange = (selectedInboxes: number[]) => {
        setGlobalFilters(prev => ({ ...prev, selectedInboxes }));
    };

    const inboxMap = useMemo(() => new Map(inboxes.map((inbox: any) => [Number(inbox.id), inbox])), [inboxes]);

    const getChannelName = (lead: Partial<MinifiedConversation> | any) => {
        const inbox = lead?.inbox_id ? inboxMap.get(Number(lead.inbox_id)) : null;
        return getLeadChannelName(lead, inbox);
    };

    const getInboxName = (lead: Partial<MinifiedConversation> | any) => {
        const inbox = lead?.inbox_id ? inboxMap.get(Number(lead.inbox_id)) : null;
        return getLeadInboxName(lead, inbox);
    };

    const operationResults = useMemo(() => {
        const query = normalize(operationSearch);
        if (!query) return [];

        return conversations
            .filter((lead) => {
                const attrs = getAttrs(lead);
                const haystack = [
                    lead.id,
                    getLeadName(lead),
                    getLeadPhone(lead),
                    getRawLeadPhone(lead),
                    getLeadEmail(lead),
                    attrs.celular,
                    attrs.nombre_completo
                ].map(normalize).join(" ");

                return haystack.includes(query);
            })
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, 8);
    }, [conversations, operationSearch]);

    const salesRows = useMemo(() => {
        const query = normalize(salesSearch);
        return conversations
            .filter((lead) => lead.labels?.includes(SALE_LABEL))
            .filter((lead) => {
                const operationDateValue = getLeadOperationDate(lead);
                if (salesStartDate && (!operationDateValue || operationDateValue < salesStartDate)) return false;
                if (salesEndDate && (!operationDateValue || operationDateValue > salesEndDate)) return false;

                if (!query) return true;
                const haystack = [
                    lead.id,
                    getLeadName(lead),
                    getLeadPhone(lead),
                    getLeadEmail(lead),
                    getChannelName(lead)
                ].map(normalize).join(" ");
                return haystack.includes(query);
            })
            .sort((a, b) => (getLeadOperationDate(b) || "").localeCompare(getLeadOperationDate(a) || ""));
    }, [conversations, salesStartDate, salesEndDate, salesSearch, inboxMap]);

    const salesTotal = useMemo(
        () => salesRows.reduce((sum, lead) => sum + parseAmount(getAttrs(lead).monto_operacion), 0),
        [salesRows]
    );

    const openOperationDialog = (lead: MinifiedConversation) => {
        const attrs = getAttrs(lead);
        setOperationLead(lead);
        setOperationAmount(attrs.monto_operacion ? String(attrs.monto_operacion) : "");
        setOperationDate(getLeadOperationDate(lead) || getGuayaquilDateString());
        setIsOperationDialogOpen(true);
    };

    const handleOperationFormConfirm = () => {
        if (!operationLead) return;
        if (!operationAmount.trim()) {
            toast.error("Ingresa el monto de la operacion");
            return;
        }
        if (!operationDate) {
            toast.error("Ingresa la fecha del monto de operacion");
            return;
        }
        setIsOperationConfirmOpen(true);
    };

    const executeOperationConfirm = async () => {
        if (!operationLead) return;

        const contactId = operationLead.meta?.sender?.id;
        if (!contactId) {
            toast.error("No se encontro el ID del contacto de Chatwoot para actualizar atributos");
            return;
        }

        const nextLabels = [SALE_LABEL];
        const currentContactAttrs = operationLead.meta?.sender?.custom_attributes || {};
        const currentConvAttrs = operationLead.custom_attributes || {};
        const nextContactAttrs = {
            ...currentContactAttrs,
            monto_operacion: operationAmount.trim(),
            fecha_monto_operacion: operationDate
        };
        const nextMergedAttrs = {
            ...currentConvAttrs,
            ...nextContactAttrs
        };

        setIsSavingOperation(true);
        try {
            await chatwootService.updateContact(contactId, {
                custom_attributes: nextContactAttrs
            });

            await chatwootService.updateConversationLabels(operationLead.id, nextLabels);

            await LabelEventService.recordConversationLabelChange({
                conversationId: operationLead.id,
                previousLabels: operationLead.labels || [],
                nextLabels,
                eventSource: "dashboard",
                rawPayload: {
                    action: "confirm_operation",
                    monto_operacion: operationAmount.trim(),
                    fecha_monto_operacion: operationDate
                }
            });

            const { error: supabaseError } = await supabase
                .schema("cw")
                .from("conversations_current")
                .update({
                    labels: nextLabels,
                    custom_attributes: nextMergedAttrs,
                    monto_operacion: operationAmount.trim(),
                    fecha_monto_operacion: operationDateToIso(operationDate),
                    updated_at: new Date().toISOString()
                })
                .eq("chatwoot_conversation_id", operationLead.id);

            if (supabaseError) throw supabaseError;

            toast.success("Operacion confirmada y marcada como venta_exitosa");
            setIsOperationConfirmOpen(false);
            setIsOperationDialogOpen(false);
            setOperationLead(null);
            setOperationSearch("");
            await Promise.all([refetchContext(), refetch?.()]);
        } catch (err) {
            console.error("Error confirming operation:", err);
            toast.error("No se pudo confirmar la operacion en Chatwoot");
        } finally {
            setIsSavingOperation(false);
        }
    };

    const exportSalesReport = () => {
        if (salesRows.length === 0) {
            toast.error("No hay ventas exitosas para exportar con esos filtros");
            return;
        }

        const detailRows = salesRows.map((lead) => {
            const attrs = getAttrs(lead);
            const createdAt = lead.created_at ? new Date(lead.created_at * 1000) : null;
            const lastActivity = lead.timestamp ? new Date(lead.timestamp * 1000) : null;

            return {
                "ID Conversacion": lead.id,
                "Nombre Lead": getLeadName(lead),
                "Telefono": getLeadPhone(lead),
                "Correo": getLeadEmail(lead),
                "Canal": getChannelName(lead),
                "Etiquetas": (lead.labels || []).join(" | "),
                "Monto Operacion": attrs.monto_operacion || "",
                "Monto Numerico": parseAmount(attrs.monto_operacion),
                "Fecha Monto Operacion": getLeadOperationDate(lead),
                "Responsable": attrs.responsable || lead.meta?.assignee?.name || "",
                "Agencia": attrs.agencia || "",
                "Campana": attrs.campana || "",
                "Ciudad": attrs.ciudad || "",
                "Fecha Ingreso": createdAt ? createdAt.toLocaleString() : "",
                "Ultima Interaccion": lastActivity ? lastActivity.toLocaleString() : "",
                "Origen Dato": lead.source || "",
                "URL Red Social": getLeadExternalUrl(lead, getChannelName(lead)),
                "Enlace Chatwoot": getChatwootUrl(lead.id)
            };
        });

        const byChannel = new Map<string, { canal: string; ventas: number; monto: number }>();
        const byMonth = new Map<string, { periodo: string; ventas: number; monto: number }>();

        salesRows.forEach((lead) => {
            const amount = parseAmount(getAttrs(lead).monto_operacion);
            const channel = getChannelName(lead);
            const month = (getLeadOperationDate(lead) || "Sin fecha").slice(0, 7);

            const channelRow = byChannel.get(channel) || { canal: channel, ventas: 0, monto: 0 };
            channelRow.ventas += 1;
            channelRow.monto += amount;
            byChannel.set(channel, channelRow);

            const monthRow = byMonth.get(month) || { periodo: month, ventas: 0, monto: 0 };
            monthRow.ventas += 1;
            monthRow.monto += amount;
            byMonth.set(month, monthRow);
        });

        const summaryRows = [
            ["Generado", new Date().toLocaleString()],
            ["Filtro fecha inicio", salesStartDate || "Todos"],
            ["Filtro fecha fin", salesEndDate || "Todos"],
            ["Filtro busqueda", salesSearch || "Todos"],
            ["Ventas exitosas", salesRows.length],
            ["Monto total", salesTotal],
            ["Ticket promedio", salesRows.length > 0 ? salesTotal / salesRows.length : 0],
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Resumen");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.from(byChannel.values())), "Por Canal");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.from(byMonth.values())), "Por Mes");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Detalle Ventas");
        XLSX.writeFile(wb, `reporte_ventas_exitosas_${getGuayaquilDateString()}.xlsx`);
        toast.success("Reporte de ventas exitosas generado");
    };

    const handleViewHistory = async (lead: any) => {
        setSelectedLead(lead);
        setIsHistoryOpen(true);
        setLoadingHistory(true);
        try {
            let messages = await chatwootService.getMessages(lead.id);
            if (!messages || messages.length === 0) {
                messages = await SupabaseService.getHistoricalMessages(lead.id);
            }
            if ((!messages || messages.length === 0) && getLastMessage(lead)) {
                messages = [getLastMessage(lead)];
            }
            setHistoryMessages(messages || []);
        } catch (err) {
            console.error("Error fetching history:", err);
            toast.error("No se pudo cargar el historial");
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleOpenTagChange = (lead: any) => {
        setSelectedLead(lead);
        setNewTag("");
        setIsTagDialogOpen(true);
    };

    const handleConfirmTagChange = () => {
        if (!newTag) return;
        setIsTagConfirmOpen(true);
    };

    const executeTagChange = async () => {
        if (!selectedLead || !newTag) return;

        try {
            await chatwootService.updateConversationLabels(selectedLead.id, [newTag]);
            await LabelEventService.recordConversationLabelChange({
                conversationId: selectedLead.id,
                previousLabels: selectedLead.labels || [],
                nextLabels: [newTag],
                eventSource: "dashboard",
                rawPayload: {
                    action: "change_followup_status",
                    selected_label: newTag
                }
            });

            const { error: supabaseError } = await supabase
                .schema("cw")
                .from("conversations_current")
                .update({
                    labels: [newTag],
                    updated_at: new Date().toISOString()
                })
                .eq("chatwoot_conversation_id", selectedLead.id);

            if (supabaseError) throw supabaseError;

            toast.success(`Estado cambiado a: ${newTag}`);
            setIsTagDialogOpen(false);
            setIsTagConfirmOpen(false);
            setNewTag("");
            setSelectedLead(null);
            await Promise.all([refetchContext(), refetch?.()]);
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

    if (error) {
        return (
            <div className="flex items-center justify-center h-96 text-red-500">
                Error: {error}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Card className="border-emerald-200 shadow-sm">
                <CardHeader className="pb-4">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-xl">
                                <DollarSign className="h-6 w-6 text-emerald-600" />
                                Confirmar operacion
                            </CardTitle>
                            <CardDescription>
                                Busca por ID de conversacion, numero o nombre. La busqueda usa datos live de Chatwoot para hoy/ayer y Supabase para historico.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg border bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                            <CheckCircle2 className="h-4 w-4" />
                            {salesRows.length} ventas filtradas - {money(salesTotal)}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                        <div className="xl:col-span-3 space-y-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    className="pl-9"
                                    placeholder="Buscar lead por ID, nombre o numero..."
                                    value={operationSearch}
                                    onChange={(e) => setOperationSearch(e.target.value)}
                                />
                            </div>

                            <div className="rounded-xl border overflow-hidden bg-background">
                                {operationSearch.trim() && operationResults.length === 0 ? (
                                    <div className="px-4 py-8 text-sm text-muted-foreground text-center">
                                        No se encontraron leads con esa busqueda.
                                    </div>
                                ) : !operationSearch.trim() ? (
                                    <div className="px-4 py-8 text-sm text-muted-foreground text-center">
                                        Escribe un ID, nombre o numero para encontrar un lead.
                                    </div>
                                ) : (
                                    <div className="divide-y">
                                        {operationResults.map((lead) => {
                                            const attrs = getAttrs(lead);
                                            return (
                                                <div key={lead.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 hover:bg-muted/30">
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-semibold truncate">{getLeadName(lead)}</span>
                                                            <Badge variant="outline">ID {lead.id}</Badge>
                                                            {lead.labels?.includes(SALE_LABEL) && (
                                                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">venta_exitosa</Badge>
                                                            )}
                                                        </div>
                                                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                                            <span>{getLeadPhone(lead) || "Sin telefono"}</span>
                                                            <span>{getChannelName(lead)}</span>
                                                            {attrs.monto_operacion && <span>{money(parseAmount(attrs.monto_operacion))}</span>}
                                                            {getLeadOperationDate(lead) && <span>{getLeadOperationDate(lead)}</span>}
                                                        </div>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                                                        onClick={() => openOperationDialog(lead)}
                                                    >
                                                        <Check className="h-4 w-4" />
                                                        Confirmar operacion
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="xl:col-span-2 space-y-3 rounded-xl border bg-slate-50/50 p-4">
                            <div className="flex items-center gap-2 font-semibold">
                                <FileSpreadsheet className="h-4 w-4 text-primary" />
                                Reporte de ventas exitosas
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Desde</label>
                                    <Input type="date" value={salesStartDate} onChange={(e) => setSalesStartDate(e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Hasta</label>
                                    <Input type="date" value={salesEndDate} onChange={(e) => setSalesEndDate(e.target.value)} />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Buscar en ventas</label>
                                <Input
                                    placeholder="Nombre, telefono, ID o canal"
                                    value={salesSearch}
                                    onChange={(e) => setSalesSearch(e.target.value)}
                                />
                            </div>
                            <Button variant="outline" className="w-full gap-2" onClick={exportSalesReport}>
                                <FileSpreadsheet className="h-4 w-4" />
                                Exportar Excel completo
                            </Button>
                            <div className="grid grid-cols-2 gap-2 pt-1">
                                <div className="rounded-lg bg-background border p-3">
                                    <p className="text-[10px] uppercase text-muted-foreground font-bold">Ventas</p>
                                    <p className="text-lg font-bold">{salesRows.length}</p>
                                </div>
                                <div className="rounded-lg bg-background border p-3">
                                    <p className="text-[10px] uppercase text-muted-foreground font-bold">Total</p>
                                    <p className="text-lg font-bold">{money(salesTotal)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-card p-4 rounded-xl border shadow-sm">
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    <ChannelSelector
                        selectedInboxes={globalFilters.selectedInboxes || []}
                        onChange={handleQueueInboxesChange}
                    />
                    <DateRangePicker
                        value={{ from: globalFilters.startDate, to: globalFilters.endDate }}
                        onChange={handleQueueDateRangeChange}
                    />
                </div>

                <div className="flex items-center gap-2 w-full lg:w-auto lg:ml-auto justify-end">
                    <ExportToExcel />
                    <Button variant="outline" size="icon" onClick={refetch} title="Actualizar datos">
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

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
                        <table className="w-full min-w-[1180px] text-sm text-left">
                            <thead className="text-[10px] text-muted-foreground uppercase bg-muted/30 border-b font-bold tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">Nombre del lead</th>
                                    <th className="px-6 py-4">Canal</th>
                                    <th className="px-6 py-4">Numero</th>
                                    <th className="px-6 py-4">Historial de mensajes</th>
                                    <th className="px-6 py-4">URL</th>
                                    <th className="px-6 py-4">Cambiar estado</th>
                                    <th className="px-6 py-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-muted/20">
                                {queue.map((lead: any) => {
                                    const displayName = getLeadName(lead);
                                    const channelDisplay = getChannelName(lead);
                                    const inboxName = getInboxName(lead);
                                    const phoneDisplay = getLeadPhone({ ...lead, channel: channelDisplay });
                                    const lastMessage = getMessagePreview(lead);
                                    const lastMessageDate = formatDateTime(getMessageTimestamp(lead));
                                    const externalUrl = getLeadExternalUrl(lead, channelDisplay);

                                    return (
                                        <tr key={lead.id} className="bg-background hover:bg-muted/10 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs uppercase">
                                                        {getInitials(displayName)}
                                                    </div>
                                                    <div className="flex min-w-0 flex-col">
                                                        <span className="font-semibold text-foreground truncate">{displayName}</span>
                                                        <span className="text-[10px] text-muted-foreground">ID {lead.id}</span>
                                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                            <UserCircle className="w-3 h-3" />
                                                            {lead.owner}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col items-start gap-1">
                                                    <Badge variant="secondary" className="px-2 py-0 text-[10px] uppercase font-bold">
                                                        {channelDisplay}
                                                    </Badge>
                                                    {inboxName && inboxName !== channelDisplay && (
                                                        <span className="max-w-[160px] truncate text-[10px] text-muted-foreground">{inboxName}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col text-xs gap-1">
                                                    <span className="flex items-center gap-1.5 text-muted-foreground font-medium italic">
                                                        <Phone className="w-3 h-3" />
                                                        {phoneDisplay || "Sin numero"}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <button
                                                    type="button"
                                                    onClick={() => handleViewHistory(lead)}
                                                    className="flex max-w-[300px] flex-col text-left hover:text-primary"
                                                >
                                                    <span className="text-xs truncate text-foreground font-medium">
                                                        {lastMessage}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                                                        <Clock className="w-3 h-3" />
                                                        {lastMessageDate}
                                                    </span>
                                                    <span className="text-[10px] text-primary mt-1">Ver historial</span>
                                                </button>
                                            </td>
                                            <td className="px-6 py-4">
                                                {externalUrl ? (
                                                    <a href={externalUrl} target="_blank" rel="noreferrer">
                                                        <Button size="sm" variant="outline" className="h-8 gap-2 text-xs">
                                                            <ExternalLink className="h-3.5 w-3.5" />
                                                            Abrir URL
                                                        </Button>
                                                    </a>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">Sin URL</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 gap-2 text-xs border-primary/30 text-primary hover:bg-primary/5"
                                                    onClick={() => handleOpenTagChange(lead)}
                                                >
                                                    <RefreshCw className="h-3.5 w-3.5" />
                                                    Cambiar estado
                                                </Button>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 gap-2 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                                        onClick={() => openOperationDialog(lead)}
                                                    >
                                                        <DollarSign className="h-3.5 w-3.5" />
                                                        Venta
                                                    </Button>
                                                    <a
                                                        href={getChatwootUrl(lead.id)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        <Button size="sm" variant="ghost" className="h-8 gap-2 px-2 text-xs text-muted-foreground hover:text-primary">
                                                            <ExternalLink className="h-4 w-4" />
                                                            Chatwoot
                                                        </Button>
                                                    </a>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {queue.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center gap-2 opacity-40">
                                                <CheckCircle2 className="h-12 w-12 text-muted-foreground" />
                                                <span className="text-sm italic font-medium">No hay leads en seguimiento humano. Todo al dia.</span>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isOperationDialogOpen} onOpenChange={setIsOperationDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-emerald-600" />
                            Confirmar operacion
                        </DialogTitle>
                        <DialogDescription>
                            Ingresa el monto y la fecha de la operacion para marcar este lead como venta_exitosa.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                            <div className="font-semibold">{operationLead ? getLeadName(operationLead) : ""}</div>
                            <div className="text-xs text-muted-foreground">
                                ID {operationLead?.id} - {operationLead ? getLeadPhone(operationLead) : ""} - {operationLead ? getChannelName(operationLead) : ""}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Monto operacion</label>
                            <Input
                                value={operationAmount}
                                onChange={(e) => setOperationAmount(e.target.value)}
                                placeholder="Ej: 15000"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Fecha monto operacion</label>
                            <div className="relative">
                                <CalendarDays className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    className="pl-9"
                                    type="date"
                                    value={operationDate}
                                    onChange={(e) => setOperationDate(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsOperationDialogOpen(false)}>Cancelar</Button>
                        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleOperationFormConfirm}>
                            Confirmar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isOperationConfirmOpen} onOpenChange={setIsOperationConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Confirmacion final
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-4 pt-2">
                            <p>
                                Vas a confirmar la venta de <strong>{operationLead ? getLeadName(operationLead) : ""}</strong> por{" "}
                                <strong>{money(parseAmount(operationAmount))}</strong> con fecha <strong>{operationDate}</strong>. Estas seguro?
                            </p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isSavingOperation}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={executeOperationConfirm}
                            disabled={isSavingOperation}
                            className="bg-emerald-600 hover:bg-emerald-700"
                        >
                            {isSavingOperation ? "Guardando..." : "Si, confirmar venta"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <DialogContent className="max-w-2xl sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5 text-primary" />
                            Historial de: {selectedLead ? getLeadName(selectedLead) : ""}
                        </DialogTitle>
                        <DialogDescription>
                            Mensajes disponibles del lead. Si necesitas responder o revisar mas contexto, abre la conversacion original.
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
                                {historyMessages.length === 0 && (
                                    <div className="py-16 text-center text-sm text-muted-foreground">
                                        No hay mensajes disponibles para este lead.
                                    </div>
                                )}
                                {historyMessages.map((msg: any) => {
                                    const isOutgoing = msg.message_type === 1 || msg.message_direction === "outgoing";
                                    return (
                                        <div key={msg.id} className={`flex ${isOutgoing ? "justify-end" : "justify-start"}`}>
                                            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${isOutgoing
                                                ? "bg-primary text-primary-foreground rounded-tr-none"
                                                : "bg-muted text-foreground rounded-tl-none"
                                                }`}>
                                                <div className="font-bold text-[10px] mb-1 opacity-70 uppercase">
                                                    {isOutgoing ? "Agente / Bot" : "Cliente"}
                                                </div>
                                                {msg.content}
                                                <div className="text-[9px] mt-1 text-right opacity-60">
                                                    {formatDateTime(msg.created_at)}
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
                            href={selectedLead ? getChatwootUrl(selectedLead.id) : "#"}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <Button className="gap-2">
                                <ExternalLink className="h-4 w-4" />
                                Ver en Chatwoot
                            </Button>
                        </a>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Cambiar estado</DialogTitle>
                        <DialogDescription>
                            Selecciona una etiqueta. Las etiquetas actuales se borraran y este lead quedara solo con la etiqueta elegida.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-6 space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Nueva etiqueta</label>
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
                            Cambiar estado
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isTagConfirmOpen} onOpenChange={setIsTagConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Confirmar cambio de estado
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-4 pt-2">
                            <p>
                                Vas a reemplazar todas las etiquetas actuales de <strong>{selectedLead ? getLeadName(selectedLead) : ""}</strong> por{" "}
                                <Badge variant="secondary">{newTag}</Badge>. Estas seguro?
                            </p>
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-sm">
                                <p className="font-bold mb-1">Recuerda</p>
                                <p>Si cambias a una etiqueta de cita o agendamiento, revisa antes que la informacion necesaria del cliente quede actualizada en sus atributos.</p>
                                <p className="mt-2">Despues del cambio, este lead puede desaparecer de esta cola porque aqui solo se muestran leads con seguimiento_humano.</p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={executeTagChange} className="bg-amber-600 hover:bg-amber-700">
                            Si, confirmar cambio
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default LeadActionQueue;
