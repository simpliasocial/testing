import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { chatwootService } from "@/services/ChatwootService";
import { supabase } from "@/lib/supabase";
import { friendlyErrorMessage } from "@/lib/displayCopy";
import {
    LOCAL_ATTRIBUTE_DEFINITIONS,
    inferAttributeDefinitionsFromConversations,
    mergeAttributeDefinitions,
    normalizeAttributeDefinitions,
    type AttributeDefinition,
} from "../model/leadActionQueueModel";

type UseFollowupAttributeDefinitionsParams = {
    conversations: unknown[];
};

const ATTRIBUTE_DEFINITION_COLUMNS = [
    "attribute_key",
    "attribute_display_name",
    "attribute_display_type",
    "attribute_values",
    "attribute_scope",
    "attribute_model",
    "regex_pattern",
    "regex_cue",
    "attribute_description",
].join(", ");

export const useFollowupAttributeDefinitions = ({
    conversations,
}: UseFollowupAttributeDefinitionsParams) => {
    const [loadedAttributeDefinitions, setLoadedAttributeDefinitions] = useState<AttributeDefinition[]>([]);
    const [loadingAttributeDefinitions, setLoadingAttributeDefinitions] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const loadAttributeDefinitions = async () => {
            setLoadingAttributeDefinitions(true);
            try {
                const [liveResult, fallbackResult] = await Promise.allSettled([
                    chatwootService.getAttributeDefinitions(),
                    supabase
                        .schema("cw")
                        .from("attribute_definitions")
                        .select(ATTRIBUTE_DEFINITION_COLUMNS)
                        .order("attribute_display_name", { ascending: true }),
                ]);
                const liveRawDefinitions =
                    liveResult.status === "fulfilled" ? liveResult.value : [];
                const fallbackDefinitions =
                    fallbackResult.status === "fulfilled" && !fallbackResult.value.error
                        ? (fallbackResult.value.data || []) as unknown[]
                        : [];

                const mergedDefinitions = mergeAttributeDefinitions(
                    normalizeAttributeDefinitions(liveRawDefinitions || []),
                    normalizeAttributeDefinitions(fallbackDefinitions as Record<string, unknown>[]),
                );

                if (!cancelled) {
                    setLoadedAttributeDefinitions(mergedDefinitions);
                }
            } catch (attributeError) {
                console.error("Error loading external field definitions:", attributeError);
                if (!cancelled) {
                    setLoadedAttributeDefinitions([]);
                    toast.error(friendlyErrorMessage("loadFields"));
                }
            } finally {
                if (!cancelled) {
                    setLoadingAttributeDefinitions(false);
                }
            }
        };

        void loadAttributeDefinitions();

        return () => {
            cancelled = true;
        };
    }, []);

    const inferredAttributeDefinitions = useMemo(
        () => inferAttributeDefinitionsFromConversations(conversations),
        [conversations],
    );

    const attributeDefinitions = useMemo(
        () => mergeAttributeDefinitions(LOCAL_ATTRIBUTE_DEFINITIONS, loadedAttributeDefinitions, inferredAttributeDefinitions),
        [loadedAttributeDefinitions, inferredAttributeDefinitions],
    );

    const attributeDefinitionMap = useMemo(
        () => new Map(attributeDefinitions.map((definition) => [definition.key, definition])),
        [attributeDefinitions],
    );

    return {
        attributeDefinitions,
        attributeDefinitionMap,
        loadingAttributeDefinitions,
    };
};
