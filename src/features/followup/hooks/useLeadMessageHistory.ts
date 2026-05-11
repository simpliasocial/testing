import { useCallback, useState } from "react";
import { toast } from "sonner";
import { chatwootService } from "@/services/ChatwootService";
import { supabaseHistoricalClient } from "@/infrastructure/supabase/SupabaseHistoricalClient";
import type { ConversationMessage, LeadLike } from "@/domain/lead";
import {
    getDisplayMessages,
    getLastMessage,
} from "@/lib/leadDisplay";

export type LeadMessageHistoryLead = Partial<LeadLike> & {
    id: number;
    additional_attributes?: unknown;
    channel?: unknown;
    channel_name?: unknown;
    channel_type?: unknown;
    last_message?: unknown;
    name?: unknown;
    raw_payload?: unknown;
};

export const useLeadMessageHistory = <TLead extends LeadMessageHistoryLead>() => {
    const [historyLead, setHistoryLead] = useState<TLead | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [historyMessages, setHistoryMessages] = useState<ConversationMessage[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const openHistory = useCallback(async (lead: TLead) => {
        setHistoryLead(lead);
        setIsHistoryOpen(true);
        setLoadingHistory(true);

        try {
            let messages: ConversationMessage[] = await chatwootService.getMessages(lead.id);
            if (!messages || messages.length === 0) {
                messages = await supabaseHistoricalClient.getHistoricalMessages(lead.id);
            }

            const lastMessage = getLastMessage(lead);
            if ((!messages || messages.length === 0) && lastMessage) {
                messages = [lastMessage];
            }

            setHistoryMessages(getDisplayMessages(messages || []));
        } catch (historyError) {
            console.error("Error fetching history:", historyError);
            toast.error("No se pudo cargar el historial");
        } finally {
            setLoadingHistory(false);
        }
    }, []);

    return {
        historyLead,
        isHistoryOpen,
        setIsHistoryOpen,
        historyMessages,
        loadingHistory,
        openHistory,
    };
};
