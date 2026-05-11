import type { MinifiedConversation } from "./types";

export const conversationActivityTimestamp = (conversation: MinifiedConversation) =>
    conversation.timestamp || conversation.created_at || 0;

export const uniqueConversationsById = (conversations: MinifiedConversation[]) => {
    const byId = new Map<number, MinifiedConversation>();

    conversations.forEach((conversation) => {
        if (conversation.id) byId.set(conversation.id, conversation);
    });

    return Array.from(byId.values()).sort(
        (left, right) => conversationActivityTimestamp(right) - conversationActivityTimestamp(left),
    );
};
