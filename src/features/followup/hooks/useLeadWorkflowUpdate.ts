import { useCallback } from "react";
import { toast } from "sonner";
import { chatwootService } from "@/services/ChatwootService";
import type { MinifiedConversation } from "@/services/StorageService";
import { hybridConversationRepository } from "@/infrastructure/conversation/HybridConversationRepository";
import { labelEventClient } from "@/infrastructure/supabase/LabelEventClient";
import { supabase } from "@/lib/supabase";
import type { UnknownRecord } from "@/domain/common/types";
import {
    buildLeadWorkflowAttributeState,
    type LeadWorkflowLead,
} from "../model/leadWorkflowModel";

export type LeadWorkflowUpdateParams<TLead extends LeadWorkflowLead> = {
    lead: TLead;
    nextLabels: string[];
    contactAttributePatch?: UnknownRecord;
    conversationAttributePatch?: UnknownRecord;
    rawPayload: UnknownRecord;
    successMessage: string;
};

export type UseLeadWorkflowUpdateParams = {
    replaceConversation: (conversation: MinifiedConversation) => Promise<void>;
    refetchContext: () => Promise<void>;
    refetchDashboard?: () => Promise<unknown> | void;
};

const reconcileConversationSnapshot = async (conversationId: number, remainingRetries = 1): Promise<void> => {
    try {
        const { error } = await supabase.functions.invoke("chatwoot-repair-conversations", {
            body: {
                ids: [conversationId],
                limit: 1,
                batch_size: 1,
            },
        });

        if (error) throw error;
    } catch (reconcileError) {
        console.error(`Server-side conversation reconcile failed for ${conversationId}:`, reconcileError);
        if (remainingRetries > 0) {
            window.setTimeout(() => {
                void reconcileConversationSnapshot(conversationId, remainingRetries - 1);
            }, 1500);
        }
    }
};

export const useLeadWorkflowUpdate = ({
    replaceConversation,
    refetchContext,
    refetchDashboard,
}: UseLeadWorkflowUpdateParams) => {
    const applyLeadWorkflowUpdate = useCallback(async <TLead extends LeadWorkflowLead>({
        lead,
        nextLabels,
        contactAttributePatch,
        conversationAttributePatch,
        rawPayload,
        successMessage,
    }: LeadWorkflowUpdateParams<TLead>) => {
        const {
            contactId,
            hasContactPatch,
            hasConversationPatch,
            nextContactAttrs,
            nextConversationAttrs,
            nextResolvedAttrs,
        } = buildLeadWorkflowAttributeState(lead, contactAttributePatch, conversationAttributePatch);

        if (hasConversationPatch) {
            await chatwootService.updateConversationCustomAttributes(lead.id, nextConversationAttrs);
        }

        if (hasContactPatch) {
            await chatwootService.updateContact(contactId, {
                custom_attributes: nextContactAttrs,
            });
        }

        await chatwootService.updateConversationLabels(lead.id, nextLabels);

        try {
            await labelEventClient.recordConversationLabelChange({
                conversationId: lead.id,
                previousLabels: lead.labels || [],
                nextLabels,
                eventSource: "dashboard",
                rawPayload,
            });
        } catch (labelEventError) {
            console.error("Local label event sync failed after successful Chatwoot update:", labelEventError);
        }

        const [freshConversation] = await hybridConversationRepository.refreshConversationDetailsById([lead.id]);
        if (!freshConversation) {
            throw new Error("No se pudo obtener el estado final del lead.");
        }

        await replaceConversation({
            ...freshConversation,
            custom_attributes: nextResolvedAttrs,
        });

        toast.success(successMessage);

        void reconcileConversationSnapshot(lead.id);
        void Promise.allSettled([refetchContext(), refetchDashboard?.()]);
    }, [replaceConversation, refetchContext, refetchDashboard]);

    return { applyLeadWorkflowUpdate };
};
