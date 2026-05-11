import type { IncomingMessageTrafficEvent } from "../../domain/conversation";
import type { ConversationMessage } from "../../domain/lead";
import {
    getGuayaquilDateString,
    getGuayaquilHour,
    getGuayaquilHourLabel,
} from "../../lib/guayaquilTime";

type TrafficSource = IncomingMessageTrafficEvent["source"];

export const toIsoFromTimestamp = (value: unknown) => {
    if (!value) return "";

    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
        return new Date(numeric < 10000000000 ? numeric * 1000 : numeric).toISOString();
    }

    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

export const messageTimestamp = (message: ConversationMessage) => {
    const iso = toIsoFromTimestamp(message.created_at_chatwoot || message.created_at || message.timestamp);
    return iso ? Math.floor(new Date(iso).getTime() / 1000) : 0;
};

export const isIncomingCustomerMessage = (message: ConversationMessage) =>
    message.message_direction === "incoming" ||
    Number(message.message_type) === 0 ||
    String(message.message_type || "").toLowerCase() === "incoming" ||
    String(message.sender_type || "").toLowerCase() === "contact";

export const isPublicMessage = (message: ConversationMessage) =>
    !message.private && !message.is_private;

export const mapIncomingMessageEvent = (
    message: ConversationMessage,
    source: TrafficSource,
    fallbackConversationId?: number,
    fallbackInboxId?: number,
): IncomingMessageTrafficEvent | null => {
    const createdAtIso = toIsoFromTimestamp(message.created_at_chatwoot || message.created_at || message.timestamp);
    if (!createdAtIso) return null;

    const date = new Date(createdAtIso);
    if (Number.isNaN(date.getTime())) return null;

    const rawMessage = message as ConversationMessage & {
        chatwoot_message_id?: number | string;
        chatwoot_conversation_id?: number | string;
        chatwoot_inbox_id?: number | string;
        conversation_id?: number | string;
        inbox_id?: number | string;
    };
    const conversationId = Number(rawMessage.chatwoot_conversation_id || rawMessage.conversation_id || fallbackConversationId);
    const inboxId = Number(rawMessage.chatwoot_inbox_id || rawMessage.inbox_id || fallbackInboxId);

    return {
        id: String(rawMessage.chatwoot_message_id || rawMessage.id || `${source}_${conversationId}_${date.getTime()}`),
        conversationId,
        inboxId: Number.isFinite(inboxId) ? inboxId : undefined,
        createdAtIso,
        createdAtUnix: Math.floor(date.getTime() / 1000),
        date: getGuayaquilDateString(date),
        hour: getGuayaquilHour(date),
        hourLabel: getGuayaquilHourLabel(date),
        source,
    };
};

export const uniqueIncomingEvents = (events: IncomingMessageTrafficEvent[]) => {
    const byId = new Map<string, IncomingMessageTrafficEvent>();
    events.forEach((event) => byId.set(event.id, event));
    return Array.from(byId.values()).sort((left, right) => left.createdAtUnix - right.createdAtUnix);
};
