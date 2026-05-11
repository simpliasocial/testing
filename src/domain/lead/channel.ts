import { cleanText, normalizeSearchText } from "../common/types";
import type { Inbox, LeadLike } from "./types";

const CHANNEL_ALIAS_LABELS: Array<{ label: string; tokens: string[] }> = [
    { label: "WhatsApp", tokens: ["whatsapp", "whats app", "wa.me"] },
    { label: "Instagram", tokens: ["instagram"] },
    { label: "Facebook", tokens: ["facebook", "messenger"] },
    { label: "Telegram", tokens: ["telegram", "t.me", "tg://", "cwcloudbot_bot"] },
    { label: "TikTok", tokens: ["tiktok", "tik tok", "douyin", "simplia.social"] },
    { label: "Sitio web", tokens: ["webwidget", "web_widget", "web widget", "website", "web site", "sitio web", "pagina web", "livechat", "live chat", "widget"] },
];

export const resolveKnownChannelLabel = (value: unknown) => {
    const normalizedValue = normalizeSearchText(value);
    if (!normalizedValue) return "";

    const matched = CHANNEL_ALIAS_LABELS.find(({ tokens }) =>
        tokens.some((token) => normalizedValue.includes(token)),
    );

    return matched?.label || "";
};

export const cleanStoredChannel = (value: unknown) => {
    const text = cleanText(value);
    const normalized = normalizeSearchText(text);

    return normalized && !["otro", "other", "unknown", "sin canal", "n/a", "na"].includes(normalized)
        ? text
        : "";
};

export const resolveLeadChannel = (lead: LeadLike, inbox?: Inbox | null) => {
    const attrs = lead.resolvedAttrs || lead.resolved_custom_attributes || lead.custom_attributes || {};
    const senderAdditional = lead.meta?.sender?.additional_attributes || {};
    const hints = [
        attrs.canal,
        attrs.channel,
        attrs.origen,
        senderAdditional.channel,
        senderAdditional.social_channel,
        senderAdditional.provider,
        senderAdditional.platform,
        senderAdditional.source,
        inbox?.name,
        inbox?.website_url,
        inbox?.website_token,
        inbox?.channel_type,
        inbox?.provider,
        inbox?.slug,
    ].filter(Boolean).join(" ");

    return resolveKnownChannelLabel(inbox?.channel_type)
        || resolveKnownChannelLabel(hints)
        || cleanStoredChannel(attrs.canal)
        || "Otro";
};
