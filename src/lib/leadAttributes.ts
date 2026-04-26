/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MinifiedConversation } from "@/services/StorageService";

type AttributeRecord = Record<string, any>;

const isAttributeRecord = (value: unknown): value is AttributeRecord =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asAttributes = (value: unknown): AttributeRecord =>
    isAttributeRecord(value) ? value : {};

const hasSeparatedAttributes = (lead: any) =>
    isAttributeRecord(lead?.conversation_custom_attributes) ||
    isAttributeRecord(lead?.contact_custom_attributes);

export const getContactCustomAttributes = (lead: Partial<MinifiedConversation> | any): AttributeRecord => {
    if (isAttributeRecord(lead?.contact_custom_attributes)) {
        return lead.contact_custom_attributes;
    }

    return asAttributes(lead?.meta?.sender?.custom_attributes);
};

export const getConversationCustomAttributes = (lead: Partial<MinifiedConversation> | any): AttributeRecord => {
    if (isAttributeRecord(lead?.conversation_custom_attributes)) {
        return lead.conversation_custom_attributes;
    }

    // For raw/live Chatwoot objects, custom_attributes belong to the conversation.
    // For legacy Supabase/cache snapshots without separated columns, custom_attributes
    // is already the resolved snapshot, so it should not be treated as conversation-only.
    if (lead?.source === "supabase" || lead?.source === "cache") {
        return {};
    }

    return asAttributes(lead?.custom_attributes);
};

export const getSnapshotCustomAttributes = (lead: Partial<MinifiedConversation> | any): AttributeRecord =>
    asAttributes(lead?.resolved_custom_attributes || lead?.custom_attributes);

export const resolveLeadAttributes = (lead: Partial<MinifiedConversation> | any): AttributeRecord => {
    const snapshotAttrs = getSnapshotCustomAttributes(lead);
    const contactAttrs = getContactCustomAttributes(lead);
    const conversationAttrs = getConversationCustomAttributes(lead);

    if (!hasSeparatedAttributes(lead) && (lead?.source === "supabase" || lead?.source === "cache")) {
        return {
            ...contactAttrs,
            ...snapshotAttrs
        };
    }

    return {
        ...snapshotAttrs,
        ...contactAttrs,
        ...conversationAttrs
    };
};
