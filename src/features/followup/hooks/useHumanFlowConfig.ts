import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_TAG_CONFIG, type TagConfig } from "@/domain/dashboard";
import {
    getHumanFlowConfig,
    humanFlowConfigChanged,
    normalizeList,
    type AttributeDefinition,
    type HumanFlowConfigState,
} from "../model/leadActionQueueModel";

type HumanFlowListKey = keyof Pick<
    HumanFlowConfigState,
    "humanFollowupQueueTags" | "humanSalesQueueTags" | "humanAppointmentFieldKeys" | "humanSaleFieldKeys"
>;

type HumanFlowLabelKey = "humanAppointmentTargetLabel" | "humanSaleTargetLabel";

type UseHumanFlowConfigParams = {
    tagSettings: TagConfig;
    allAvailableLabels: string[];
    attributeDefinitionMap: Map<string, AttributeDefinition>;
    updateTagSettings: (config: TagConfig) => Promise<void>;
};

const createFallbackAttributeDefinition = (key: string): AttributeDefinition => ({
    key,
    label: key.replace(/_/g, " "),
    displayType: "text",
    valueType: "text",
    options: [],
});

const resolveConfiguredFields = (
    fieldKeys: string[],
    attributeDefinitionMap: Map<string, AttributeDefinition>,
) => fieldKeys.map((key) => attributeDefinitionMap.get(key) || createFallbackAttributeDefinition(key));

export const useHumanFlowConfig = ({
    tagSettings,
    allAvailableLabels,
    attributeDefinitionMap,
    updateTagSettings,
}: UseHumanFlowConfigParams) => {
    const savedHumanConfig = useMemo(
        () => getHumanFlowConfig(tagSettings, DEFAULT_TAG_CONFIG),
        [tagSettings],
    );
    const [humanConfig, setHumanConfig] = useState<HumanFlowConfigState>(savedHumanConfig);

    useEffect(() => {
        setHumanConfig(savedHumanConfig);
    }, [savedHumanConfig]);

    const mergedLabels = useMemo(
        () =>
            normalizeList([
                ...allAvailableLabels,
                ...savedHumanConfig.humanFollowupQueueTags,
                savedHumanConfig.humanAppointmentTargetLabel,
                ...savedHumanConfig.humanSalesQueueTags,
                savedHumanConfig.humanSaleTargetLabel,
            ]),
        [allAvailableLabels, savedHumanConfig],
    );

    const configuredAppointmentFields = useMemo(
        () => resolveConfiguredFields(savedHumanConfig.humanAppointmentFieldKeys, attributeDefinitionMap),
        [attributeDefinitionMap, savedHumanConfig.humanAppointmentFieldKeys],
    );

    const configuredSaleFields = useMemo(
        () => resolveConfiguredFields(savedHumanConfig.humanSaleFieldKeys, attributeDefinitionMap),
        [attributeDefinitionMap, savedHumanConfig.humanSaleFieldKeys],
    );

    const hasHumanConfigChanges = useMemo(
        () => humanFlowConfigChanged(humanConfig, savedHumanConfig),
        [humanConfig, savedHumanConfig],
    );

    const updateHumanConfigList = useCallback((key: HumanFlowListKey, value: string) => {
        setHumanConfig((prev) => ({
            ...prev,
            [key]: prev[key].includes(value)
                ? prev[key].filter((item) => item !== value)
                : [...prev[key], value],
        }));
    }, []);

    const updateHumanConfigLabel = useCallback((key: HumanFlowLabelKey, value: string) => {
        setHumanConfig((prev) => ({
            ...prev,
            [key]: value,
        }));
    }, []);

    const saveHumanConfig = useCallback(async () => {
        try {
            await updateTagSettings({
                ...tagSettings,
                ...humanConfig,
            });
            toast.success("Configuracion del flujo humano actualizada");
        } catch (configError) {
            console.error("Error saving human flow config:", configError);
            toast.error("No se pudo guardar la configuracion del flujo humano");
        }
    }, [humanConfig, tagSettings, updateTagSettings]);

    return {
        humanConfig,
        updateHumanConfigList,
        updateHumanConfigLabel,
        saveHumanConfig,
        hasHumanConfigChanges,
        mergedLabels,
        configuredAppointmentFields,
        configuredSaleFields,
        humanFollowupQueueTags: savedHumanConfig.humanFollowupQueueTags,
        humanAppointmentTargetLabel: savedHumanConfig.humanAppointmentTargetLabel,
        humanSalesQueueTags: savedHumanConfig.humanSalesQueueTags,
        humanSaleTargetLabel: savedHumanConfig.humanSaleTargetLabel,
    };
};
