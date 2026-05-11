import type { MinifiedConversation } from "../../../services/StorageService";
import type { UnknownRecord } from "../../../domain/common/types";
import { getContactCustomAttributes, getConversationCustomAttributes } from "../../../lib/leadAttributes";

export type LeadWorkflowLead = Partial<MinifiedConversation> & {
    id: number;
    labels?: string[];
    custom_attributes?: UnknownRecord;
    meta?: {
        sender?: {
            id?: number | string;
        };
    };
};

export type LeadWorkflowAttributeState = {
    contactId: number;
    hasContactPatch: boolean;
    hasConversationPatch: boolean;
    nextContactAttrs: UnknownRecord;
    nextConversationAttrs: UnknownRecord;
    nextResolvedAttrs: UnknownRecord;
};

export const resolveLeadWorkflowContactId = (lead: LeadWorkflowLead) => {
    const contactId = Number(lead.meta?.sender?.id);
    return Number.isFinite(contactId) && contactId > 0 ? contactId : null;
};

export const buildLeadWorkflowAttributeState = (
    lead: LeadWorkflowLead,
    contactAttributePatch: UnknownRecord = {},
    conversationAttributePatch: UnknownRecord = {},
): LeadWorkflowAttributeState => {
    const contactId = resolveLeadWorkflowContactId(lead);
    if (!contactId) {
        throw new Error("No se encontró el contacto asociado a este lead.");
    }

    const currentContactAttrs = getContactCustomAttributes(lead);
    const currentConversationAttrs = getConversationCustomAttributes(lead);
    const hasContactPatch = Object.keys(contactAttributePatch).length > 0;
    const hasConversationPatch = Object.keys(conversationAttributePatch).length > 0;

    const nextContactAttrs = {
        ...currentContactAttrs,
        ...contactAttributePatch,
    };
    const nextConversationAttrs = {
        ...currentConversationAttrs,
        ...conversationAttributePatch,
    };
    const nextResolvedAttrs = {
        ...(lead.custom_attributes || {}),
        ...nextContactAttrs,
        ...nextConversationAttrs,
    };

    return {
        contactId,
        hasContactPatch,
        hasConversationPatch,
        nextContactAttrs,
        nextConversationAttrs,
        nextResolvedAttrs,
    };
};
