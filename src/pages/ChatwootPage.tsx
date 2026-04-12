import { useEffect, useState } from 'react';
import { chatwootService, ChatwootConversation } from '@/services/ChatwootService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, ExternalLink, User, Clock, Tag, Search, ChevronLeft, ChevronRight, Calendar, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { config } from '@/config';

const ChatwootPage = () => {
    const [conversations, setConversations] = useState<ChatwootConversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');

    // Filters based on User Request
    const [selectedLabel, setSelectedLabel] = useState<string>('all');
    const [selectedInbox, setSelectedInbox] = useState<string>('all');
    const [selectedDate, setSelectedDate] = useState<string>("");

    const [inboxes, setInboxes] = useState<any[]>([]);
    const [labels, setLabels] = useState<string[]>([]);
    const [meta, setMeta] = useState<any>({ all_count: 0 });

    useEffect(() => {
        const loadCatalogs = async () => {
            try {
                const [inboxData, labelData] = await Promise.all([
                    chatwootService.getInboxes(),
                    chatwootService.getLabels() // Assuming this exists or returns list
                ]);
                setInboxes(inboxData);
                // Extract label titles
                if (Array.isArray(labelData)) {
                    setLabels(labelData.map((l: any) => l.name));
                }
            } catch (error) {
                console.error("Error loading catalogs", error);
            }
        };
        loadCatalogs();
    }, []);

    const fetchConversations = async () => {
        setLoading(true);
        try {
            const data = await chatwootService.getConversations({
                page,
                q: search || undefined,
                inbox_id: selectedInbox !== 'all' ? selectedInbox : undefined,
                labels: selectedLabel !== 'all' ? [selectedLabel] : undefined,
            });

            console.log(`[ChatwootPage] API Raw Data:`, data);

            let filtered = data.payload || [];

            console.log(`[ChatwootPage] Conversations before filtering: ${filtered.length}`);

            // Local date filtering if selectedDate is set
            if (selectedDate) {
                const searchDate = new Date(selectedDate);
                filtered = filtered.filter((c: any) => {
                    const convDate = new Date((c.timestamp || c.created_at) * 1000);
                    return convDate.toDateString() === searchDate.toDateString();
                });
            }

            setConversations(filtered);
            setMeta(data.meta || { all_count: filtered.length });
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar las conversaciones de Chatwoot');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchConversations();
        }, 500);
        return () => clearTimeout(timer);
    }, [page, search, selectedLabel, selectedInbox]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'open': return 'bg-green-500/10 text-green-500 border-green-500/20';
            case 'resolved': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            case 'pending': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
            default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
        }
    };

    const openInChatwoot = (id: number) => {
        window.open(`${config.chatwoot.publicUrl}/app/accounts/${config.chatwoot.accountId}/conversations/${id}`, '_blank');
    };

    return (
        <div className="space-y-6">
            <Card className="border-border bg-card">
                <CardHeader className="pb-3 border-b">
                    <div className="flex flex-col lg:flex-row gap-4 justify-between lg:items-center">
                        <div>
                            <CardTitle className="text-xl">Listado de Conversaciones</CardTitle>
                            <CardDescription>
                                Total encontrado: <span className="font-bold text-foreground">{(meta && meta.all_count) || conversations.length}</span>
                            </CardDescription>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {/* 1. Search Bar */}
                            <div className="relative min-w-[200px] flex-1 lg:flex-none">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por nombre o celular..."
                                    className="pl-9 h-10"
                                    value={search}
                                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                                />
                            </div>

                            {/* 2. Date Picker */}
                            <div className="relative min-w-[150px] flex-1 lg:flex-none">
                                <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground z-10" />
                                <input
                                    type="date"
                                    className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                />
                            </div>

                            {/* 3. Inbox/Channel Filter */}
                            <Select value={selectedInbox} onValueChange={(val) => { setSelectedInbox(val); setPage(1); }}>
                                <SelectTrigger className="w-full sm:w-[180px] h-10">
                                    <SelectValue placeholder="Todos los canales" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos los canales</SelectItem>
                                    {inboxes.map((inbox) => (
                                        <SelectItem key={inbox.id} value={inbox.id.toString()}>
                                            {inbox.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* 4. Labels Filter */}
                            <Select value={selectedLabel} onValueChange={(val) => { setSelectedLabel(val); setPage(1); }}>
                                <SelectTrigger className="w-full sm:w-[180px] h-10">
                                    <SelectValue placeholder="Todas las etiquetas" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas las etiquetas</SelectItem>
                                    {labels.map((label) => (
                                        <SelectItem key={label} value={label || 'unlabeled'}>
                                            {(label || 'Sin etiqueta').charAt(0).toUpperCase() + (label || '').slice(1).replace(/_/g, ' ')}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="animate-spin h-12 w-12 text-primary" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-xl border border-border overflow-hidden shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] tracking-wider font-bold">
                                            <tr>
                                                <th className="px-6 py-4">Contacto</th>
                                                <th className="px-6 py-4">Último Mensaje</th>
                                                <th className="px-6 py-4">Estado</th>
                                                <th className="px-6 py-4 hidden md:table-cell">Etiquetas</th>
                                                <th className="px-6 py-4 hidden lg:table-cell">Tiempo</th>
                                                <th className="px-6 py-4 text-right">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border bg-card">
                                            {conversations.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                                                        No se encontraron conversaciones con los filtros aplicados
                                                    </td>
                                                </tr>
                                            ) : (
                                                conversations.map((conv) => (
                                                    <tr key={conv.id} className="hover:bg-muted/30 transition-colors group">
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                                                    {conv.meta.sender.name ? conv.meta.sender.name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
                                                                </div>
                                                                <div>
                                                                    <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                                                                        {conv.meta.sender.name || 'Sin Nombre'}
                                                                    </div>
                                                                    <div className="text-xs text-muted-foreground">
                                                                        {conv.meta.sender.phone_number || conv.meta.sender.email}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 max-w-[300px]">
                                                            <p className="truncate text-muted-foreground italic">
                                                                "{conv.last_non_activity_message?.content || 'Sin mensajes'}"
                                                            </p>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${getStatusColor(conv.status)}`}>
                                                                {conv.status === 'open' ? 'Abierto' : conv.status === 'resolved' ? 'Resuelto' : conv.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 hidden md:table-cell">
                                                            <div className="flex flex-wrap gap-1">
                                                                {conv.labels.map((label) => (
                                                                    <Badge key={label} variant="secondary" className="text-[10px] font-medium h-5">
                                                                        {label}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-muted-foreground whitespace-nowrap hidden lg:table-cell">
                                                            <div className="flex items-center gap-1.5 text-xs">
                                                                <Clock className="w-3.5 h-3.5" />
                                                                {formatDistanceToNow(new Date(conv.timestamp * 1000), { addSuffix: true, locale: es })}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-8 gap-2 hover:bg-primary hover:text-white transition-all"
                                                                onClick={() => openInChatwoot(conv.id)}
                                                            >
                                                                Chat
                                                                <ExternalLink className="w-3 h-3" />
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Pagination */}
                            <div className="flex items-center justify-between pt-2">
                                <div className="text-xs font-medium text-muted-foreground">
                                    Viendo página <span className="text-foreground">{page}</span>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8"
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={page === 1 || loading}
                                    >
                                        <ChevronLeft className="h-4 w-4 mr-1" />
                                        Anterior
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8"
                                        onClick={() => setPage((p) => p + 1)}
                                        disabled={conversations.length < 15 || loading}
                                    >
                                        Siguiente
                                        <ChevronRight className="h-4 w-4 ml-1" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default ChatwootPage;
