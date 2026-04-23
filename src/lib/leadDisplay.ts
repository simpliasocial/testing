import { config } from "@/config";
import { MinifiedConversation } from "@/services/StorageService";

export const cleanText = (value: unknown) => String(value ?? "").trim();

export const normalize = (value: unknown) =>
    String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

export const parseAmount = (value: unknown) => {
    const raw = String(value || "").trim();
    const normalized = raw.includes(",") && !raw.includes(".")
        ? raw.replace(",", ".")
        : raw.replace(/,/g, "");
    const parsed = Number.parseFloat(normalized.replace(/[^0-9.-]/g, ""));
    return Number.isNaN(parsed) ? 0 : parsed;
};

export const money = (value: number) =>
    new Intl.NumberFormat("es-US", { style: "currency", currency: "USD" }).format(value);

export const getAttrs = (lead: Partial<MinifiedConversation> | any) => ({
    ...(lead?.custom_attributes || {}),
    ...(lead?.meta?.sender?.custom_attributes || {})
});

export const getLeadName = (lead: Partial<MinifiedConversation> | any) => {
    const attrs = getAttrs(lead);
    const customName = cleanText(attrs.nombre_completo);
    return customName || cleanText(lead?.meta?.sender?.name) || cleanText(lead?.name) || "Sin Nombre";
};

export const getRawLeadPhone = (lead: Partial<MinifiedConversation> | any) =>
    cleanText(lead?.meta?.sender?.phone_number);

const CHANNEL_ALIAS_LABELS: Array<{ label: string; tokens: string[] }> = [
    { label: "WhatsApp", tokens: ["whatsapp", "whats app", "wa.me"] },
    { label: "Instagram", tokens: ["instagram"] },
    { label: "Facebook", tokens: ["facebook", "messenger"] },
    { label: "Telegram", tokens: ["telegram", "t.me", "tg://", "cwcloudbot_bot"] },
    { label: "TikTok", tokens: ["tiktok", "tik tok", "douyin", "simplia.social"] }
];

const resolveSocialChannelLabel = (value: unknown) => {
    const normalizedValue = normalize(value);
    if (!normalizedValue) return "";

    const matched = CHANNEL_ALIAS_LABELS.find(({ tokens }) =>
        tokens.some(token => normalizedValue.includes(token))
    );

    return matched?.label || "";
};

export const getInboxChannelName = (inbox?: any) =>
    channelLabelFromType(
        inbox?.channel_type,
        [
            inbox?.name,
            inbox?.provider,
            inbox?.slug,
            inbox?.website_token,
            inbox?.channel?.type
        ].filter(Boolean).join(" ")
    );

export const isWhatsappChannel = (lead: Partial<MinifiedConversation> | any, channelOverride = "") => {
    return channelLabelFromType(
        lead?.channel_type,
        `${lead?.channel || ""} ${channelOverride}`
    ) === "WhatsApp";
};

export const getLeadPhone = (lead: Partial<MinifiedConversation> | any, channelOverride = "") => {
    const attrs = getAttrs(lead);
    const customPhone = cleanText(attrs.celular);
    if (customPhone) return customPhone;
    return isWhatsappChannel(lead, channelOverride) ? getRawLeadPhone(lead) : "";
};

export const getLeadEmail = (lead: Partial<MinifiedConversation> | any) => {
    const attrs = getAttrs(lead);
    return cleanText(attrs.correo) || cleanText(lead?.meta?.sender?.email);
};

export const getLeadOperationDate = (lead: Partial<MinifiedConversation> | any) => {
    const attrs = getAttrs(lead);
    const raw = attrs.fecha_monto_operacion;
    if (!raw) return "";
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString().split("T")[0];
    return String(raw).split("T")[0];
};

export const operationDateToIso = (date: string) =>
    date ? new Date(`${date}T00:00:00.000-05:00`).toISOString() : null;

export const toUnixSeconds = (value: unknown) => {
    if (!value) return 0;
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric < 10000000000 ? numeric : Math.floor(numeric / 1000);
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? 0 : Math.floor(date.getTime() / 1000);
};

export const formatDateTime = (value: unknown) => {
    const unix = toUnixSeconds(value);
    if (!unix) return "Sin fecha";
    return new Date(unix * 1000).toLocaleString("es-EC", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
};

const getMessageNumericType = (message: any) => {
    const numeric = Number(message?.message_type);
    if (!Number.isNaN(numeric)) return numeric;

    const normalizedType = normalize(message?.message_type);
    if (normalizedType === "incoming") return 0;
    if (normalizedType === "outgoing") return 1;
    if (normalizedType === "activity") return 2;

    return null;
};

const hasRenderableMessagePayload = (message: any) => {
    if (cleanText(message?.content)) return true;
    if (Array.isArray(message?.attachments) && message.attachments.length > 0) return true;
    if (Array.isArray(message?.attachment) && message.attachment.length > 0) return true;
    if (Array.isArray(message?.content_attributes?.attachments) && message.content_attributes.attachments.length > 0) return true;
    return false;
};

export const getConversationMessageRole = (message: any): "incoming" | "outgoing" | null => {
    if (!message) return null;
    if (message?.is_private === true || message?.private === true) return null;

    const direction = normalize(message?.message_direction || message?.direction);
    const senderType = normalize(message?.sender_type || message?.sender?.type || message?.sender?.sender_type);
    const contentType = normalize(message?.content_type);
    const numericType = getMessageNumericType(message);

    if (!hasRenderableMessagePayload(message)) return null;
    if (direction.includes("activity") || contentType.includes("activity") || numericType === 2) return null;

    if (direction === "incoming") return "incoming";
    if (direction === "outgoing") return "outgoing";

    if (numericType === 0) return "incoming";
    if (numericType === 1) return "outgoing";

    if (senderType.includes("contact")) return "incoming";
    if (["agent", "user", "administrator", "bot"].some(token => senderType.includes(token))) return "outgoing";

    return null;
};

export const isRenderableConversationMessage = (message: any) =>
    getConversationMessageRole(message) !== null;

export const getDisplayMessages = (messages: any[] = []) =>
    (messages || [])
        .filter(isRenderableConversationMessage)
        .sort((a, b) => toUnixSeconds(a?.created_at || a?.created_at_chatwoot) - toUnixSeconds(b?.created_at || b?.created_at_chatwoot));

export const getMessageText = (message: any) => {
    if (!message) return "";
    return cleanText(message?.content) || "[Adjunto / contenido no textual]";
};

export const getLastMessage = (lead: Partial<MinifiedConversation> | any) => {
    const displayMessages = getDisplayMessages(Array.isArray(lead?.messages) ? lead.messages : []);
    if (displayMessages.length > 0) return displayMessages[displayMessages.length - 1];
    if (isRenderableConversationMessage(lead?.last_non_activity_message)) return lead.last_non_activity_message;
    if (isRenderableConversationMessage(lead?.last_message)) return lead.last_message;
    return null;
};

export const getMessagePreview = (lead: Partial<MinifiedConversation> | any) =>
    getMessageText(getLastMessage(lead)) || "Sin mensajes";

export const getMessageTimestamp = (lead: Partial<MinifiedConversation> | any) =>
    getLastMessage(lead)?.created_at || lead?.timestamp || lead?.created_at;

export const getChatwootUrl = (conversationId: number | string) =>
    `${config.chatwoot.publicUrl}/app/accounts/${config.chatwoot.accountId}/conversations/${conversationId}`;

export const getInitials = (name: string) =>
    cleanText(name)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0])
        .join("")
        .toUpperCase() || "LD";

export const channelLabelFromType = (type?: string, fallback?: string) => {
    const resolvedFromType = resolveSocialChannelLabel(type);
    if (resolvedFromType) return resolvedFromType;

    const resolvedFromFallback = resolveSocialChannelLabel(fallback);
    if (resolvedFromFallback) return resolvedFromFallback;

    const normalizedType = normalize(type);
    if (normalizedType.includes("api")) {
        const resolvedApiFallback = resolveSocialChannelLabel(fallback);
        if (resolvedApiFallback) return resolvedApiFallback;
    }

    return "Otro";
};

export const getLeadChannelName = (lead: Partial<MinifiedConversation> | any, inbox?: any) => {
    const attrs = getAttrs(lead);
    const fallbackHints = [
        attrs.canal,
        lead?.channel,
        lead?.channel_name,
        lead?.source,
        lead?.meta?.sender?.additional_attributes?.channel,
        lead?.meta?.sender?.additional_attributes?.social_channel,
        lead?.meta?.sender?.additional_attributes?.provider,
        lead?.meta?.sender?.additional_attributes?.platform,
        lead?.meta?.sender?.additional_attributes?.source,
        lead?.meta?.sender?.additional_attributes?.service,
        lead?.meta?.sender?.additional_attributes?.channel_type,
        lead?.meta?.sender?.identifier,
        getInboxChannelName(inbox),
        inbox?.name
    ].filter(Boolean).join(" ");

    return channelLabelFromType(lead?.channel_type || inbox?.channel_type, fallbackHints);
};

export const getLeadInboxName = (lead: Partial<MinifiedConversation> | any, inbox?: any) =>
    cleanText(inbox?.name || lead?.channel);

const shouldInspectUrlKey = (key: string) => {
    const normalized = normalize(key);
    return ["url", "link", "profile", "perfil", "source", "refer", "redirect", "social", "instagram", "facebook", "messenger"].some(token => normalized.includes(token));
};

const shouldSkipUrlKey = (key: string) => {
    const normalized = normalize(key);
    return ["avatar", "thumbnail", "image", "photo", "picture"].some(token => normalized.includes(token));
};

const normalizeUrl = (value: unknown) => {
    const raw = cleanText(value);
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^www\./i.test(raw)) return `https://${raw}`;
    return "";
};

const normalizeTelegramHandle = (value: unknown) => {
    let raw = cleanText(value);
    if (!raw) return "";

    raw = raw
        .replace(/^https?:\/\/(www\.)?(t\.me|telegram\.me)\//i, "")
        .replace(/^tg:\/\/resolve\?domain=/i, "")
        .replace(/^@/, "")
        .split(/[/?#&]/)[0]
        .trim();

    return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(raw) ? raw : "";
};

const findTextByKeys = (value: unknown, keys: string[], depth = 0, visited = new Set<unknown>()): string => {
    if (!value || depth > 5 || visited.has(value)) return "";
    if (typeof value === "string" || typeof value === "number") return "";
    if (typeof value !== "object") return "";

    visited.add(value);
    const entries = Object.entries(value as Record<string, unknown>);

    for (const [key, child] of entries) {
        const normalizedKey = normalize(key);
        if (!keys.some(candidate => normalizedKey.includes(candidate))) continue;
        if (typeof child === "string" || typeof child === "number") {
            const text = cleanText(child);
            if (text) return text;
        }
        const nested = findTextByKeys(child, keys, depth + 1, visited);
        if (nested) return nested;
    }

    for (const [, child] of entries) {
        const nested = findTextByKeys(child, keys, depth + 1, visited);
        if (nested) return nested;
    }

    return "";
};

const isChatwootUrl = (url: string) => {
    try {
        const chatwootHost = new URL(config.chatwoot.publicUrl).hostname;
        return new URL(url).hostname.includes(chatwootHost);
    } catch {
        return false;
    }
};

const findExternalUrl = (value: unknown, depth = 0, visited = new Set<unknown>()): string => {
    if (!value || depth > 4 || visited.has(value)) return "";

    if (typeof value === "string") {
        const url = normalizeUrl(value);
        return url && !isChatwootUrl(url) ? url : "";
    }

    if (typeof value !== "object") return "";
    visited.add(value);

    const entries = Object.entries(value as Record<string, unknown>);
    for (const [key, child] of entries) {
        if (shouldSkipUrlKey(key)) continue;
        if (!shouldInspectUrlKey(key)) continue;
        const url = findExternalUrl(child, depth + 1, visited);
        if (url) return url;
    }

    for (const [key, child] of entries) {
        if (shouldSkipUrlKey(key) || typeof child !== "object") continue;
        const url = findExternalUrl(child, depth + 1, visited);
        if (url) return url;
    }

    return "";
};

export const getLeadExternalUrl = (lead: Partial<MinifiedConversation> | any, channelOverride = "") => {
    const sender = lead?.meta?.sender || {};
    const searchable = {
        custom_attributes: getAttrs(lead),
        additional_attributes: lead?.additional_attributes || sender.additional_attributes,
        sender,
        meta: lead?.meta,
        raw_payload: lead?.raw_payload
    };

    const explicitUrl = findExternalUrl(searchable);
    if (explicitUrl) return explicitUrl;

    const channelHint = normalize(`${channelOverride} ${lead?.channel_type || ""} ${lead?.channel || ""} ${getAttrs(lead).canal || ""}`);
    if (channelHint.includes("telegram")) {
        const telegramHandle =
            normalizeTelegramHandle(sender.identifier) ||
            normalizeTelegramHandle(findTextByKeys(searchable, ["telegram", "username", "user_name", "handle", "identifier", "perfil", "profile", "source"]));

        return telegramHandle ? `https://t.me/${telegramHandle}` : "";
    }

    return "";
};
