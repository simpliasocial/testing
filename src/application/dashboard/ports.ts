import type { ContactAttributeDefinition, DashboardFilters } from "@/domain/dashboard";
import type { TagConfig } from "@/domain/dashboard";
import type { Inbox } from "@/domain/lead";
import type { MinifiedConversation } from "@/services/StorageService";

export interface ConversationRepository {
    fetchHybridConversations(signal?: AbortSignal): Promise<{
        conversations: MinifiedConversation[];
        liveCount: number;
        historicalCount: number;
    }>;
    fetchHistoricalBeforeLiveWindow(): Promise<{ payload: MinifiedConversation[]; count: number }>;
    fetchLiveConversations(signal?: AbortSignal): Promise<{ payload: MinifiedConversation[]; meta: unknown }>;
    refreshConversationDetailsById(
        conversationIds: number[],
        params?: { signal?: AbortSignal; limit?: number },
    ): Promise<MinifiedConversation[]>;
    getLiveWindow(): {
        liveStartUnix: number;
        liveStartIso: string;
        nowUnix: number;
        todayStartUnix: number;
        tomorrowStartUnix: number;
    };
}

export interface ConversationCacheRepository {
    saveConversations(conversations: MinifiedConversation[], options?: { replaceAll?: boolean }): Promise<void>;
    loadConversations(): Promise<MinifiedConversation[]>;
    clearConversations(): Promise<void>;
}

export interface CatalogRepository {
    fetchInboxes(signal?: AbortSignal): Promise<Inbox[]>;
    fetchLabels(signal?: AbortSignal): Promise<string[]>;
    fetchContactAttributeDefinitions(signal?: AbortSignal): Promise<ContactAttributeDefinition[]>;
}

export interface DashboardSettingsRepository {
    loadTagSettings(accountId?: number): Promise<TagConfig | null>;
    saveTagSettings(config: TagConfig, accountId?: number): Promise<void>;
}

export interface DashboardQuery {
    filters: DashboardFilters;
    signal?: AbortSignal;
}
