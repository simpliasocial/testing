import { useEffect, useState, useCallback } from 'react';
import { chatwootService, ChatwootConversation } from '@/services/ChatwootService';
import { SupabaseService } from '@/services/SupabaseService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, ExternalLink, User, Clock, Search, ChevronLeft, ChevronRight, Calendar, Loader2, Database, AlertCircle } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { config } from '@/config';

const ChatwootPage = () => {
    const [activeTab, setActiveTab] = useState<'today' | 'history'>('today');
    const [conversations, setConversations] = useState<ChatwootConversation[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');

    // Filters
    const [selectedLabel, setSelectedLabel] = useState<string>('all');
    const [selectedInbox, setSelectedInbox] = useState<string>('all');
    const [startDate, setStartDate] = useState<string>(() => {
        try { return format(new Date(), 'yyyy-MM-01'); } catch { return '2024-01-01'; }
    });
    const [endDate, setEndDate] = useState<string>(() => {
        try { return format(new Date(), 'yyyy-MM-dd'); } catch { return '2024-12-31'; }
    });

    const [inboxes, setInboxes] = useState<any[]>([]);
    const [labels, setLabels] = useState<string[]>([]);
    const [meta, setMeta] = useState<any>({ all_count: 0 });

    // History Modal State
    const [viewingConv, setViewingConv] = useState<ChatwootConversation | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    useEffect(() => {
        console.log("[ChatwootPage] Initializing catalogs...");
        const loadCatalogs = async () => {
            try {
                const [inboxData, labelData] = await Promise.all([
                    chatwootService.getInboxes(),
                    chatwootService.getLabels()
                ]);
                setInboxes(inboxData || []);
                if (Array.isArray(labelData)) {
                    setLabels(labelData.map((l: any) => l?.name).filter(n => typeof n === 'string'));
                }
            } catch (error) {
                console.error("[ChatwootPage] Error loading catalogs:", error);
            }
        };
        loadCatalogs();
    }, []);

    const fetchConversations = useCallback(async () => {
        console.log(`[ChatwootPage] Fetching: tab=${activeTab}, page=${page}`);
        setLoading(true);
        try {
            let data;
            if (activeTab === 'today') {
                data = await chatwootService.getConversations({
                    page,
                    q: search || undefined,
                    inbox_id: selectedInbox !== 'all' ? selectedInbox : undefined,
                    labels: selectedLabel !== 'all' ? [selectedLabel] : undefined,
                });
            } else {
                data = await SupabaseService.getHistoricalConversations({
                    page,
                    q: search || undefined,
                    since: startDate,
                    until: endDate,
                });
            }

            setConversations(data?.payload || []);
            setMeta(data?.meta || { all_count: (data?.payload || []).length });
        } catch (error) {
            console.error("[ChatwootPage] Fetch Error:", error);
            toast.error('Error al cargar las conversaciones');
        } finally {
            setLoading(false);
        }
    }, [activeTab, page, search, selectedLabel, selectedInbox, startDate, endDate]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchConversations();
        }, 500);
        return () => clearTimeout(timer);
    }, [fetchConversations]);

    const handleOpenHistory = async (conv: ChatwootConversation) => {
        setViewingConv(conv);
        setMessages([]);
        setLoadingHistory(true);
        try {
            let history = [];
            if (activeTab === 'today') {
                history = await chatwootService.getMessages(conv.id);
            } else {
                history = await SupabaseService.getHistoricalMessages(conv.id);
            }
            setMessages(history || []);
        } catch (error) {
            console.error("[ChatwootPage] History Error:", error);
            toast.error('Error al cargar el historial');
        } finally {
            setLoadingHistory(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (String(status).toLowerCase()) {
            case 'open': return 'bg-green-500/10 text-green-500 border-green-500/20';
            case 'resolved': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            case 'pending': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
            default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
        }
    };

    const formatDateSafe = (timestamp: number) => {
        try {
            if (!timestamp || isNaN(timestamp)) return 'N/A';
            const date = new Date(timestamp * 1000);
            if (isNaN(date.getTime())) return 'N/A';
            return formatDistanceToNow(date, { addSuffix: true, locale: es });
        } catch {
            return 'N/A';
        }
    };

    const openInChatwoot = (id: number) => {
        if (!config.chatwoot.publicUrl || !config.chatwoot.accountId) return;
        window.open(`${config.chatwoot.publicUrl}/app/accounts/${config.chatwoot.accountId}/conversations/${id}`, '_blank');
    };

    return (
        <div className="space-y-6">
            <Card className="border-border bg-card">
                <CardHeader className="pb-3 border-b">
                    <div className="flex flex-col lg:flex-row gap-4 justify-between lg:items-center">
                        <div className="space-y-1">
                            <CardTitle className="text-xl flex items-center gap-2">
                                <MessageSquare className="h-5 w-5 text-primary" />
                                Listado de Conversaciones
                            </CardTitle>
                            <CardDescription>
                                Total encontrado: <span className="font-bold text-foreground">{(meta && meta.all_count) || conversations.length}</span>
                            </CardDescription>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Tabs
                                value={activeTab}
                                onValueChange={(v: any) => { setActiveTab(v); setPage(1); }}
                                className="bg-muted/50 p-0.5 rounded-lg"
                            >
                                <TabsList className="grid w-[240px] grid-cols-2 h-8">
                                    <TabsTrigger value="today" className="text-xs gap-1.5">
                                        <Clock className="h-3 w-3" /> Hoy
                                    </TabsTrigger>
                                    <TabsTrigger value="history" className="text-xs gap-1.5">
                                        <Database className="h-3 w-3" /> Histórico
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>

                            <div className="relative min-w-[200px] flex-1 lg:flex-none">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar contacto..."
                                    className="pl-9 h-9 text-xs"
                                    value={search}
                                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                                />
                            </div>

                            {activeTab === 'history' && (
                                <div className="flex items-center gap-2">
                                    <div className="relative">
                                        <Calendar className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground z-10 pointer-events-none" />
                                        <input
                                            type="date"
                                            className="flex h-9 rounded-md border border-input bg-background pl-7 pr-2 py-1 text-[10px] focus:ring-1 focus:ring-primary outline-none w-32"
                                            value={startDate}
                                            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                                        />
                                    </div>
                                    <div className="relative">
                                        <Calendar className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground z-10 pointer-events-none" />
                                        <input
                                            type="date"
                                            className="flex h-9 rounded-md border border-input bg-background pl-7 pr-2 py-1 text-[10px] focus:ring-1 focus:ring-primary outline-none w-32"
                                            value={endDate}
                                            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                                        />
                                    </div>
                                </div>
                            )}

                            {activeTab === 'today' && (
                                <>
                                    <Select value={selectedInbox} onValueChange={(val) => { setSelectedInbox(val); setPage(1); }}>
                                        <SelectTrigger className="h-9 w-36 text-xs">
                                            <SelectValue placeholder="Canal" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos</SelectItem>
                                            {inboxes.map((inbox) => (
                                                <SelectItem key={inbox.id} value={inbox.id.toString()}>{inbox.name || 'Canal Desconocido'}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <Select value={selectedLabel} onValueChange={(val) => { setSelectedLabel(val); setPage(1); }}>
                                        <SelectTrigger className="h-9 w-40 text-xs">
                                            <SelectValue placeholder="Etiqueta" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todas</SelectItem>
                                            {labels.map((label) => (
                                                <SelectItem key={label} value={label}>{(label || '').replace(/_/g, ' ')}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </>
                            )}
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
                                    <table className="w-full text-sm text-left border-collapse">
                                        <thead>
                                            <tr className="bg-muted/30 text-muted-foreground uppercase text-[10px] tracking-wider font-bold border-b">
                                                <th className="px-6 py-4">Contacto</th>
                                                <th className="px-6 py-4">Contexto / Último Mensaje</th>
                                                <th className="px-6 py-4">Estado</th>
                                                <th className="px-6 py-4 hidden md:table-cell">Etiquetas</th>
                                                <th className="px-6 py-4 hidden lg:table-cell">Temporalidad</th>
                                                <th className="px-6 py-4 text-right">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {conversations.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="px-6 py-24 text-center">
                                                        <div className="flex flex-col items-center gap-2 opacity-40">
                                                            <Search className="h-10 w-10" />
                                                            <p className="text-sm font-medium">No se encontraron resultados</p>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                conversations.map((conv) => (
                                                    <tr key={conv.id} className="hover:bg-muted/20 transition-colors group">
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shadow-sm shrink-0">
                                                                    {conv.meta?.sender?.name ? conv.meta.sender.name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="font-semibold text-foreground truncate">
                                                                        {conv.meta?.sender?.name || 'Contacto Anon'}
                                                                    </div>
                                                                    <div className="text-[10px] text-muted-foreground font-mono truncate">
                                                                        {conv.meta?.sender?.phone_number || conv.meta?.sender?.email || 'S/D'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td
                                                            className="px-6 py-4 max-w-[300px] cursor-pointer group/msg"
                                                            onClick={() => handleOpenHistory(conv)}
                                                        >
                                                            <div className="flex flex-col gap-0.5">
                                                                <p className="truncate text-muted-foreground italic text-xs group-hover/msg:text-primary transition-colors">
                                                                    "{conv.last_non_activity_message?.content || 'Ver historial...'}"
                                                                </p>
                                                                <span className="text-[9px] text-primary/70 font-bold opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center gap-1">
                                                                    <MessageSquare className="w-2.5 h-2.5" /> Abrir transcripción
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border shadow-xs uppercase ${getStatusColor(conv.status)}`}>
                                                                {conv.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 hidden md:table-cell">
                                                            <div className="flex flex-wrap gap-1">
                                                                {(conv.labels || []).slice(0, 2).map((label) => (
                                                                    <Badge key={label} variant="outline" className="text-[8px] font-bold h-4 px-1.5">
                                                                        {label}
                                                                    </Badge>
                                                                ))}
                                                                {(conv.labels || []).length > 2 && (
                                                                    <span className="text-[9px] text-muted-foreground font-bold">...</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-muted-foreground whitespace-nowrap hidden lg:table-cell">
                                                            <div className="flex items-center gap-1 text-[10px] font-medium">
                                                                <Clock className="w-3 h-3 text-primary/40" />
                                                                {formatDateSafe(conv.timestamp)}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-8 w-8 p-0 hover:bg-primary hover:text-white rounded-full transition-all"
                                                                onClick={() => openInChatwoot(conv.id)}
                                                                title="Abrir en Chatwoot"
                                                            >
                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t">
                                <p className="text-[10px] text-muted-foreground font-medium">
                                    Página {page} de {Math.floor((meta?.all_count || 0) / 15) + 1}
                                </p>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 px-3 text-xs rounded-lg"
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1 || loading}
                                    >
                                        <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Anterior
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 px-3 text-xs rounded-lg"
                                        onClick={() => setPage(p => p + 1)}
                                        disabled={conversations.length < 15 || loading}
                                    >
                                        Siguiente <ChevronRight className="h-3.5 w-3.5 ml-1" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Message History Modal */}
            <Dialog open={!!viewingConv} onOpenChange={(open) => !open && setViewingConv(null)}>
                <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden rounded-2xl shadow-2xl border-none">
                    <DialogHeader className="p-5 border-b bg-muted/20">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                {viewingConv?.meta?.sender?.name?.charAt(0).toUpperCase() || <User className="w-5 h-5" />}
                            </div>
                            <div className="min-w-0">
                                <DialogTitle className="text-base font-bold truncate">{viewingConv?.meta?.sender?.name || 'Chat Log'}</DialogTitle>
                                <p className="text-[10px] text-muted-foreground truncate">{viewingConv?.meta?.sender?.phone_number || viewingConv?.meta?.sender?.email || 'N/A'}</p>
                            </div>
                        </div>
                    </DialogHeader>

                    <ScrollArea className="h-[450px] p-5 bg-card/50">
                        {loadingHistory ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 opacity-50">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-xs">Recuperando mensajes...</p>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 opacity-30">
                                <AlertCircle className="h-10 w-10" />
                                <p className="text-xs">Sin registros</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {messages.map((msg, idx) => {
                                    const isOutgoing = msg.message_type === 1;
                                    return (
                                        <div key={msg.id || idx} className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[85%] rounded-xl p-3 shadow-xs ${isOutgoing
                                                ? 'bg-primary text-primary-foreground rounded-tr-none'
                                                : 'bg-muted/80 text-foreground rounded-tl-none border'
                                                }`}>
                                                <p className="text-xs leading-normal whitespace-pre-wrap">{msg.content || '[Audio/Imagen]'}</p>
                                                <div className={`text-[8px] mt-1.5 opacity-40 font-bold ${isOutgoing ? 'text-right' : 'text-left'}`}>
                                                    {msg.created_at ? format(new Date(msg.created_at * 1000), 'HH:mm dd/MM', { locale: es }) : ''}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </ScrollArea>

                    <div className="p-4 flex items-center justify-between border-t bg-muted/10">
                        <p className="text-[9px] text-muted-foreground font-mono">ID: {viewingConv?.id}</p>
                        <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setViewingConv(null)} className="h-8 text-xs">Cerrar</Button>
                            <Button
                                size="sm"
                                className="h-8 text-xs font-bold gap-1.5"
                                onClick={() => viewingConv && openInChatwoot(viewingConv.id)}
                            >
                                Gestionar en Chatwoot <ExternalLink className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ChatwootPage;
