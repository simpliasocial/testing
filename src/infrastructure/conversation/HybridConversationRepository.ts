import { HybridDashboardService } from "@/services/HybridDashboardService";
import type { ConversationRepository } from "@/application/dashboard";

export const hybridConversationRepository: ConversationRepository = {
    fetchHybridConversations: (signal) => HybridDashboardService.fetchHybridConversations(signal),
    fetchHistoricalBeforeLiveWindow: () => HybridDashboardService.fetchHistoricalBeforeLiveWindow(),
    fetchLiveConversations: (signal) => HybridDashboardService.fetchLiveConversations(signal),
    refreshConversationDetailsById: (conversationIds, params) =>
        HybridDashboardService.refreshConversationDetailsById(conversationIds, params),
    getLiveWindow: () => HybridDashboardService.getLiveWindow(),
};

export { mergeConversationsPreferApi } from "@/services/HybridDashboardService";
