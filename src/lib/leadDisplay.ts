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

export const isWhatsappChannel = (lead: Partial<MinifiedConversation> | any, channelOverride = "") => {
    const channelHint = normalize(`${lead?.channel_type || ""} ${lead?.channel || ""} ${channelOverride}`);
    return channelHint.includes("whatsapp");
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

export const getLastMessage = (lead: Partial<MinifiedConversation> | any) => {
    if (lead?.last_message) return lead.last_message;
    if (lead?.last_non_activity_message) return lead.last_non_activity_message;
    if (Array.isArray(lead?.messages) && lead.messages.length > 0) return lead.messages[lead.messages.length - 1];
    return null;
};

export const getMessagePreview = (lead: Partial<MinifiedConversation> | any) =>
    cleanText(getLastMessage(lead)?.content) || "Sin mensajes";

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
    const normalizedType = normalize(type);
    const normalizedFallback = normalize(fallback);

    if (normalizedType.includes("instagram") || normalizedFallback.includes("instagram")) return "Instagram";
    if (normalizedType.includes("facebook") || normalizedFallback.includes("messenger")) return "Messenger";
    if (normalizedType.includes("whatsapp") || normalizedFallback.includes("whatsapp")) return "WhatsApp";
    if (normalizedType.includes("telegram") || normalizedFallback.includes("telegram")) return "Telegram";
    if (normalizedType.includes("twitter") || normalizedFallback.includes("twitter") || normalizedFallback.includes("x ")) return "X";
    if (normalizedFallback.includes("tiktok")) return "TikTok";
    if (normalizedType.includes("web") || normalizedFallback.includes("web")) return "Web";

    return cleanText(fallback) || "Otro";
};

export const getLeadChannelName = (lead: Partial<MinifiedConversation> | any, inbox?: any) =>
    channelLabelFromType(lead?.channel_type || inbox?.channel_type, inbox?.name || lead?.channel || getAttrs(lead).canal);

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
