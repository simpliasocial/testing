import { parseTimestampToUnix } from "../../../shared/time/timestamps";

interface ResponseMessage {
    created_at_chatwoot?: unknown;
    created_at?: unknown;
    timestamp?: unknown;
    message_direction?: unknown;
    message_type?: unknown;
    sender_type?: unknown;
    private?: boolean;
    is_private?: boolean;
    content?: unknown;
}

interface ResponseConversation {
    first_reply_created_at?: unknown;
    created_at?: unknown;
    waiting_since?: unknown;
    last_non_activity_message?: ResponseMessage;
    messages?: ResponseMessage[];
}

export interface FirstResponseMetrics {
    firstResponseAverageSeconds: number;
    firstResponseRawAverageSeconds: number;
    firstResponseMedianSeconds: number;
    firstResponseCount: number;
    responseTimeMinutes: number;
}

const getMessageTimestampSeconds = (message: ResponseMessage) => {
    const raw = message.created_at_chatwoot || message.created_at || message.timestamp;
    return parseTimestampToUnix(raw);
};

const isIncomingMessage = (message: ResponseMessage) =>
    message.message_direction === "incoming" ||
    Number(message.message_type) === 0 ||
    String(message.message_type || "").toLowerCase() === "incoming" ||
    String(message.sender_type || "").toLowerCase() === "contact";

const hasMessageSenderSignal = (message: ResponseMessage) =>
    message.message_direction !== undefined ||
    message.message_type !== undefined ||
    message.sender_type !== undefined;

const getConversationMessages = (conversation: ResponseConversation) =>
    Array.isArray(conversation.messages)
        ? conversation.messages
            .filter((message) =>
                !message.private &&
                !message.is_private &&
                getMessageTimestampSeconds(message) > 0,
            )
            .sort((a, b) => getMessageTimestampSeconds(a) - getMessageTimestampSeconds(b))
        : [];

export const getFirstResponseSeconds = (conversation: ResponseConversation) => {
    if (conversation.first_reply_created_at && conversation.created_at) {
        const diff = Number(conversation.first_reply_created_at) - Number(conversation.created_at);
        if (diff >= 0 && diff <= 86400) return diff;
    }

    return null;
};

export const hasUnansweredCustomerMessage = (conversation: ResponseConversation) => {
    if (conversation.waiting_since) return true;

    if (
        conversation.last_non_activity_message &&
        hasMessageSenderSignal(conversation.last_non_activity_message)
    ) {
        return isIncomingMessage(conversation.last_non_activity_message);
    }

    const messages = getConversationMessages(conversation);
    if (messages.length > 0) {
        return isIncomingMessage(messages[messages.length - 1]);
    }

    if (conversation.last_non_activity_message?.content && !conversation.first_reply_created_at) {
        return true;
    }

    return !conversation.first_reply_created_at;
};

const average = (values: number[]) =>
    values.length > 0
        ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
        : 0;

const median = (values: number[]) => {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const midpoint = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 0
        ? Math.round((sorted[midpoint - 1] + sorted[midpoint]) / 2)
        : sorted[midpoint];
};

export const calculateFirstResponseMetrics = (
    conversations: ResponseConversation[],
    graceSeconds: number,
): FirstResponseMetrics => {
    const rawSamples = conversations
        .map(getFirstResponseSeconds)
        .filter((value): value is number => typeof value === "number");
    const adjustedSamples = rawSamples.map((value) => Math.max(0, value - graceSeconds));
    const firstResponseAverageSeconds = average(adjustedSamples);

    return {
        firstResponseAverageSeconds,
        firstResponseRawAverageSeconds: average(rawSamples),
        firstResponseMedianSeconds: median(adjustedSamples),
        firstResponseCount: adjustedSamples.length,
        responseTimeMinutes: firstResponseAverageSeconds > 0
            ? Math.round(firstResponseAverageSeconds / 60)
            : 0,
    };
};
