import { useState } from "react";
import { toast } from "sonner";
import { chatwootService } from "@/services/ChatwootService";
import { supabaseHistoricalClient } from "@/infrastructure/supabase/SupabaseHistoricalClient";
import { getChatwootUrl, getDisplayMessages, getLastMessage } from "@/lib/leadDisplay";
import type { ResolvedConversation } from "@/context/dashboardDataTypes";
import type { ConversationMessage } from "@/domain/lead";

export const useScoringHistory = () => {
    const [viewingLead, setViewingLead] = useState<ResolvedConversation | null>(null);
    const [historyMessages, setHistoryMessages] = useState<ConversationMessage[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const openHistory = async (lead: ResolvedConversation) => {
        setViewingLead(lead);
        setHistoryMessages([]);
        setLoadingHistory(true);

        try {
            let history: ConversationMessage[] = [];
            const isLivePreferred = lead.source !== "supabase";

            const fetchApiMessages = async (): Promise<ConversationMessage[]> => {
                try {
                    return await chatwootService.getMessages(lead.id);
                } catch (apiError) {
                    console.warn("[ScoringHistory] Chatwoot history failed:", apiError);
                    return [];
                }
            };

            const fetchSupabaseMessages = async (): Promise<ConversationMessage[]> => {
                try {
                    return await supabaseHistoricalClient.getHistoricalMessages(lead.id);
                } catch (dbError) {
                    console.warn("[ScoringHistory] Supabase history failed:", dbError);
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

            const lastMessage = getLastMessage(lead);
            if ((!history || history.length === 0) && lastMessage) {
                history = [lastMessage];
            }

            setHistoryMessages(getDisplayMessages(history || []));
        } catch (historyError) {
            console.error("[ScoringHistory] History error:", historyError);
            toast.error("No se pudo cargar el historial");
        } finally {
            setLoadingHistory(false);
        }
    };

    const closeHistory = () => setViewingLead(null);

    const openInChatwoot = () => {
        if (!viewingLead) return;
        window.open(getChatwootUrl(viewingLead.id), "_blank");
    };

    return {
        viewingLead,
        historyMessages,
        loadingHistory,
        openHistory,
        closeHistory,
        openInChatwoot,
    };
};
