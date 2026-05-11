import type { MinifiedConversation } from "../conversation/types";
import { type UnknownRecord, isRecord, asRecord } from "../common/types";

export type AttributeRecord = UnknownRecord;

const hasSeparatedAttributes = (lead: Partial<MinifiedConversation>): boolean =>
    isRecord(lead?.conversation_custom_attributes) ||
    isRecord(lead?.contact_custom_attributes);

export const getContactCustomAttributes = (lead: Partial<MinifiedConversation>): AttributeRecord => {
    if (isRecord(lead?.contact_custom_attributes)) {
        return lead.contact_custom_attributes;
    }

    return asRecord(lead?.meta?.sender?.custom_attributes);
};

export const getConversationCustomAttributes = (lead: Partial<MinifiedConversation>): AttributeRecord => {
    if (isRecord(lead?.conversation_custom_attributes)) {
        return lead.conversation_custom_attributes;
    }

    // For raw/live Chatwoot objects, custom_attributes belong to the conversation.
    // For legacy Supabase/cache snapshots without separated columns, custom_attributes
    // is already the resolved snapshot, so it should not be treated as conversation-only.
    if (lead?.source === "supabase" || lead?.source === "cache") {
        return {};
    }

    return asRecord(lead?.custom_attributes);
};

export const getSnapshotCustomAttributes = (lead: Partial<MinifiedConversation>): AttributeRecord =>
    asRecord(lead?.resolved_custom_attributes || lead?.custom_attributes);

export const resolveLeadAttributes = (lead: Partial<MinifiedConversation>): AttributeRecord => {
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
