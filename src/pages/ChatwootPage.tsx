import { useEffect, useMemo, useState } from 'react';
import { chatwootService } from '@/services/ChatwootService';
import { SupabaseService } from '@/services/SupabaseService';
import { useDashboardContext } from '@/context/DashboardDataContext';
import { MinifiedConversation } from '@/services/StorageService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Clock,
    ExternalLink,
    Loader2,
    MessageSquare,
    Search,
    UserCircle
} from 'lucide-react';
import {
    getConversationMessageRole,
    getDisplayMessages,
    formatDateTime,
    getAttrs,
    getChatwootUrl,
    getInitials,
    getLeadChannelName,
    getLeadEmail,
    getLeadExternalUrl,
    getLeadInboxName,
    getLeadName,
    getLeadPhone,
    getMessageText,
    getMessagePreview,
    getMessageTimestamp,
    getRawLeadPhone,
    normalize
} from '@/lib/leadDisplay';
import { toast } from 'sonner';

const PAGE_SIZE = 15;

const dayStartUnix = (date?: Date) => {
    if (!date) return 0;
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return Math.floor(start.getTime() / 1000);
};

const dayEndUnix = (date?: Date) => {
    if (!date) return Number.MAX_SAFE_INTEGER;
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return Math.floor(end.getTime() / 1000);
};

const ChatwootPage = () => {
    const {
        conversations,
        inboxes,
        globalFilters,
        loading,
        error,
        dataSource,
        liveError,
        historicalError
    } = useDashboardContext();

    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [viewingConv, setViewingConv] = useState<MinifiedConversation | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const selectedInboxKey = (globalFilters.selectedInboxes || []).join(',');

    useEffect(() => {
        setPage(1);
    }, [search, globalFilters.startDate, globalFilters.endDate, selectedInboxKey]);

    const inboxMap = useMemo(
        () => new Map(inboxes.map((inbox: any) => [Number(inbox.id), inbox])),
        [inboxes]
    );

    const getInbox = (lead: MinifiedConversation) =>
        lead?.inbox_id ? inboxMap.get(Number(lead.inbox_id)) : null;

    const getChannelName = (lead: MinifiedConversation) =>
        getLeadChannelName(lead, getInbox(lead));

    const filteredConversations = useMemo(() => {
        const query = normalize(search);
        const startUnix = dayStartUnix(globalFilters.startDate);
        const endUnix = dayEndUnix(globalFilters.endDate);
        const selectedInboxes = globalFilters.selectedInboxes || [];

        return conversations
            .filter((lead) => {
                const filterTimestamp = lead.created_at || lead.timestamp || 0;
                if (filterTimestamp && (filterTimestamp < startUnix || filterTimestamp > endUnix)) return false;
                if (selectedInboxes.length > 0 && !selectedInboxes.includes(Number(lead.inbox_id))) return false;
                return true;
            })
            .filter((lead) => {
                if (!query) return true;

                const channel = getChannelName(lead);
                const attrs = getAttrs(lead);
                const haystack = [
                    lead.id,
                    getLeadName(lead),
                    getLeadPhone(lead, channel),
                    getRawLeadPhone(lead),
                    getLeadEmail(lead),
                    channel,
                    getLeadInboxName(lead, getInbox(lead)),
                    ...(lead.labels || []),
                    attrs.nombre_completo,
                    attrs.celular,
                    attrs.correo,
                    attrs.canal
                ].map(normalize).join(' ');

                return haystack.includes(query);
            })
            .sort((a, b) => (b.timestamp || b.created_at || 0) - (a.timestamp || a.created_at || 0));
    }, [conversations, globalFilters.startDate, globalFilters.endDate, selectedInboxKey, search, inboxMap]);

    const totalPages = Math.max(1, Math.ceil(filteredConversations.length / PAGE_SIZE));
    const visibleConversations = filteredConversations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const openInChatwoot = (conversationId: number) => {
        window.open(getChatwootUrl(conversationId), '_blank');
    };

    const handleOpenHistory = async (lead: MinifiedConversation) => {
        setViewingConv(lead);
        setMessages([]);
        setLoadingHistory(true);

        try {
            let history: any[] = [];
            const isLivePreferred = lead.source !== 'supabase';
            const fetchApiMessages = async () => {
                try {
                    return await chatwootService.getMessages(lead.id);
                } catch (apiError) {
                    console.warn('[ChatwootPage] Chatwoot history failed:', apiError);
                    return [];
                }
            };
            const fetchSupabaseMessages = async () => {
                try {
                    return await SupabaseService.getHistoricalMessages(lead.id);
                } catch (dbError) {
                    console.warn('[ChatwootPage] Supabase history failed:', dbError);
                    return [];
                }
            };

            if (isLivePreferred) {
                history = await fetchApiMessages();
                if (!history || history.length === 0) {
                    history = await fetchSupabaseMessages();
                }
            } else {
                history = await fetchSupabaseMessages();
                if (!history || history.length === 0) {
                    history = await fetchApiMessages();
                }
            }

            if ((!history || history.length === 0) && lead.last_non_activity_message) {
                history = [lead.last_non_activity_message];
            }

            setMessages(getDisplayMessages(history || []));
        } catch (historyError) {
            console.error('[ChatwootPage] History Error:', historyError);
            toast.error('Error al cargar el historial');
        } finally {
            setLoadingHistory(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card className="border-border bg-card">
                <CardHeader className="pb-4 border-b">
                    <div className="flex flex-col lg:flex-row gap-4 justify-between lg:items-center">
                        <div className="space-y-1">
                            <CardTitle className="text-xl flex items-center gap-2">
                                <MessageSquare className="h-5 w-5 text-primary" />
                                Listado de Conversaciones
                            </CardTitle>
                            <CardDescription>
                                Total encontrado: <span className="font-bold text-foreground">{filteredConversations.length}</span>
                            </CardDescription>
                            {(liveError || historicalError || error) && (
                                <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    La lista usa la mejor data disponible. Revisa el estado live/historico si algun origen fallo.
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <Badge variant="outline" className="h-9 justify-center px-3">
                                {dataSource === 'HYBRID' ? 'Vivo + Historial' : dataSource === 'API_ONLY' ? 'Solo vivo' : 'Solo historial'}
                            </Badge>
                            <div className="relative min-w-[260px]">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por ID, nombre, numero, etiqueta o canal..."
                                    className="pl-9 h-9 text-sm"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="pt-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-4">
                            <Loader2 className="animate-spin h-10 w-10 text-primary/40" />
                            <p className="text-sm text-muted-foreground animate-pulse">Cargando conversaciones...</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-xl border border-border overflow-hidden bg-background shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[1180px] text-sm text-left border-collapse">
                                        <thead>
                                            <tr className="bg-muted/30 text-muted-foreground uppercase text-[10px] tracking-wider font-bold border-b">
                                                <th className="px-6 py-4">Nombre del lead</th>
                                                <th className="px-6 py-4">Canal</th>
                                                <th className="px-6 py-4">Numero</th>
                                                <th className="px-6 py-4">Etiqueta</th>
                                                <th className="px-6 py-4">Historial de mensajes</th>
                                                <th className="px-6 py-4">URL</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {visibleConversations.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="px-6 py-24 text-center">
                                                        <div className="flex flex-col items-center gap-2 opacity-40">
                                                            <Search className="h-10 w-10" />
                                                            <p className="text-sm font-medium">No se encontraron resultados</p>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                visibleConversations.map((lead) => {
                                                    const inbox = getInbox(lead);
                                                    const displayName = getLeadName(lead);
                                                    const channelDisplay = getLeadChannelName(lead, inbox);
                                                    const phoneDisplay = getLeadPhone(lead, channelDisplay);
                                                    const lastMessage = getMessagePreview(lead);
                                                    const lastMessageDate = formatDateTime(getMessageTimestamp(lead));
                                                    const externalUrl = getLeadExternalUrl(lead, channelDisplay);

                                                    return (
                                                        <tr key={lead.id} className="hover:bg-muted/20 transition-colors">
                                                            <td className="px-6 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs uppercase shadow-sm shrink-0">
                                                                        {getInitials(displayName)}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <div className="font-semibold text-foreground truncate">
                                                                            {displayName}
                                                                        </div>
                                                                        <div className="text-[10px] text-muted-foreground font-mono truncate">
                                                                            ID {lead.id}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <Badge variant="secondary" className="px-2 py-0 text-[10px] uppercase font-bold">
                                                                    {channelDisplay}
                                                                </Badge>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium italic">
                                                                    <UserCircle className="w-3 h-3" />
                                                                    {phoneDisplay || 'Sin numero'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex flex-wrap gap-1 max-w-[260px]">
                                                                    {(lead.labels || []).length > 0 ? (
                                                                        (lead.labels || []).map((label) => (
                                                                            <Badge key={label} variant="outline" className="text-[9px] font-bold h-5 px-2">
                                                                                {label}
                                                                            </Badge>
                                                                        ))
                                                                    ) : (
                                                                        <span className="text-xs text-muted-foreground">Sin etiqueta</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenHistory(lead)}
                                                                    className="flex max-w-[360px] flex-col text-left hover:text-primary"
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
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t">
                                <p className="text-[10px] text-muted-foreground font-medium">
                                    Pagina {page} de {totalPages}
                                </p>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 px-3 text-xs rounded-lg"
                                        onClick={() => setPage(current => Math.max(1, current - 1))}
                                        disabled={page === 1 || loading}
                                    >
                                        <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Anterior
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 px-3 text-xs rounded-lg"
                                        onClick={() => setPage(current => Math.min(totalPages, current + 1))}
                                        disabled={page >= totalPages || loading}
                                    >
                                        Siguiente <ChevronRight className="h-3.5 w-3.5 ml-1" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={!!viewingConv} onOpenChange={(open) => !open && setViewingConv(null)}>
                <DialogContent className="max-w-2xl sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5 text-primary" />
                            Historial de: {viewingConv ? getLeadName(viewingConv) : ''}
                        </DialogTitle>
                        <DialogDescription>
                            Mensajes disponibles del lead. Puedes abrir la conversacion original para revisar mas contexto.
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
                                {messages.length === 0 && (
                                    <div className="py-16 text-center text-sm text-muted-foreground">
                                        No hay mensajes disponibles para este lead.
                                    </div>
                                )}
                                {messages.map((msg: any, index) => {
                                    const role = getConversationMessageRole(msg);
                                    const isOutgoing = role === 'outgoing';
                                    return (
                                        <div key={msg.id || index} className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${isOutgoing
                                                ? 'bg-primary text-primary-foreground rounded-tr-none'
                                                : 'bg-muted text-foreground rounded-tl-none'
                                                }`}>
                                                <div className="font-bold text-[10px] mb-1 opacity-70 uppercase">
                                                    {isOutgoing ? 'Agente / Bot' : 'Cliente'}
                                                </div>
                                                <p className="whitespace-pre-wrap">{getMessageText(msg)}</p>
                                                <div className="text-[9px] mt-1 text-right opacity-60">
                                                    {formatDateTime(msg.created_at || msg.created_at_chatwoot)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </ScrollArea>

                    <DialogFooter className="mt-4 border-t pt-4">
                        <Button variant="outline" onClick={() => setViewingConv(null)}>Cerrar</Button>
                        <Button
                            className="gap-2"
                            onClick={() => viewingConv && openInChatwoot(viewingConv.id)}
                        >
                            <ExternalLink className="h-4 w-4" />
                            Ver en Chatwoot
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ChatwootPage;
