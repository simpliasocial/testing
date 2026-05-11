import { ExternalLink, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ConversationMessage } from "@/domain/lead";
import {
    formatDateTime,
    getChatwootUrl,
    getConversationMessageRole,
    getLeadName,
    getMessageText,
} from "@/lib/leadDisplay";

type HistoryLead = Parameters<typeof getLeadName>[0] & {
    id: number;
};

type LeadMessageHistoryDialogProps = {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    lead: HistoryLead | null;
    messages: ConversationMessage[];
    loading: boolean;
};

export const LeadMessageHistoryDialog = ({
    isOpen,
    onOpenChange,
    lead,
    messages,
    loading,
}: LeadMessageHistoryDialogProps) => (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl sm:max-w-3xl">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    Historial de: {lead ? getLeadName(lead) : ""}
                </DialogTitle>
                <DialogDescription>
                    Mensajes disponibles del lead. Si necesitas responder o revisar más contexto, abre la conversación original.
                </DialogDescription>
            </DialogHeader>

            <ScrollArea className="mt-4 h-[500px] pr-4">
                {loading ? (
                    <div className="flex h-full flex-col items-center justify-center">
                        <Loader2 className="mb-2 h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Cargando mensajes...</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {messages.length === 0 && (
                            <div className="py-16 text-center text-sm text-muted-foreground">
                                No hay mensajes disponibles para este lead.
                            </div>
                        )}
                        {messages.map((message) => {
                            const role = getConversationMessageRole(message);
                            const isOutgoing = role === "outgoing";
                            return (
                                <div key={message.id} className={`flex ${isOutgoing ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${isOutgoing
                                        ? "rounded-tr-none bg-primary text-primary-foreground"
                                        : "rounded-tl-none bg-muted text-foreground"
                                        }`}
                                    >
                                        <div className="mb-1 text-[10px] font-bold uppercase opacity-70">
                                            {isOutgoing ? "Agente / Bot" : "Cliente"}
                                        </div>
                                        {getMessageText(message)}
                                        <div className="mt-1 text-right text-[9px] opacity-60">
                                            {formatDateTime(message.created_at)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </ScrollArea>

            <DialogFooter className="mt-4 border-t pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
                <a
                    href={lead ? getChatwootUrl(lead.id) : "#"}
                    target="_blank"
                    rel="noreferrer"
                >
                    <Button className="gap-2">
                        <ExternalLink className="h-4 w-4" />
                        Abrir conversación
                    </Button>
                </a>
            </DialogFooter>
        </DialogContent>
    </Dialog>
);
