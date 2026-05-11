import { StorageService } from "@/services/StorageService";
import type { ConversationCacheRepository } from "@/application/dashboard";

export const indexedConversationRepository: ConversationCacheRepository = {
    saveConversations: (conversations, options) => StorageService.saveConversations(conversations, options),
    loadConversations: () => StorageService.loadConversations(),
    clearConversations: () => StorageService.clearConversations(),
};
