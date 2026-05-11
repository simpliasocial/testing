import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExternalLink, Loader2, MessageSquare } from "lucide-react";
import { formatDateTime, getConversationMessageRole, getLeadName, getMessageText } from "@/lib/leadDisplay";

interface ScoringHistoryDialogProps {
    viewingLead: any;
    historyMessages: any[];
    loadingHistory: boolean;
    closeHistory: () => void;
    openInChatwoot: () => void;
}

export const ScoringHistoryDialog: React.FC<ScoringHistoryDialogProps> = ({
    viewingLead, historyMessages, loadingHistory, closeHistory, openInChatwoot
}) => {
    return (
        <Dialog open={!!viewingLead} onOpenChange={(open) => !open && closeHistory()}>
            <DialogContent className="max-w-2xl sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-primary" />
                        Historial de: {viewingLead ? getLeadName(viewingLead) : ""}
                    </DialogTitle>
                    <DialogDescription>
                        Mensajes disponibles del lead. Puedes abrir la conversación original para revisar más contexto.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="mt-4 h-[500px] pr-4">
                    {loadingHistory ? (
                        <div className="flex h-full flex-col items-center justify-center">
                            <Loader2 className="mb-2 h-8 w-8 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">Cargando mensajes...</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {historyMessages.length === 0 && (
                                <div className="py-16 text-center text-sm text-muted-foreground">
                                    No hay mensajes disponibles para este lead.
                                </div>
                            )}
                            {historyMessages.map((message, index) => {
                                const role = getConversationMessageRole(message);
                                const isOutgoing = role === "outgoing";

                                return (
                                    <div key={message.id || index} className={`flex ${isOutgoing ? "justify-end" : "justify-start"}`}>
                                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${isOutgoing
                                            ? "rounded-tr-none bg-primary text-primary-foreground"
                                            : "rounded-tl-none bg-muted text-foreground"
                                            }`}>
                                            <div className="mb-1 text-[10px] font-bold uppercase opacity-70">
                                                {isOutgoing ? "Agente / Bot" : "Cliente"}
                                            </div>
                                            <p className="whitespace-pre-wrap">{getMessageText(message)}</p>
                                            <div className="mt-1 text-right text-[9px] opacity-60">
                                                {formatDateTime(message.created_at || message.created_at_chatwoot)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </ScrollArea>

                <DialogFooter className="mt-4 border-t pt-4">
                    <Button variant="outline" onClick={() => closeHistory()}>Cerrar</Button>
                    <Button className="gap-2" onClick={openInChatwoot}>
                        <ExternalLink className="h-4 w-4" />
                        Abrir conversación
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
