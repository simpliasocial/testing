import type { ContactAttributeDefinition } from "@/domain/dashboard";
import type { UnknownRecord } from "@/domain/common/types";

const isRecord = (value: unknown): value is UnknownRecord =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeText = (value: unknown) => String(value || "").trim();

const getRawPayload = (definition: UnknownRecord): UnknownRecord => {
    const rawPayload = definition.raw_payload;
    return isRecord(rawPayload) ? rawPayload : definition;
};

const resolveAttributeScope = (definition: UnknownRecord) => {
    const rawPayload = getRawPayload(definition);
    const directScope = normalizeText(definition.attribute_scope || rawPayload.attribute_scope).toLowerCase();

    if (directScope.includes("conversation")) return "conversation";
    if (directScope.includes("contact")) return "contact";

    const directModel = normalizeText(definition.attribute_model || rawPayload.attribute_model_type).toLowerCase();

    if (directModel.includes("conversation")) return "conversation";
    if (directModel.includes("contact")) return "contact";

    const numericModel = Number(rawPayload.attribute_model ?? definition.attribute_model);
    if (!Number.isNaN(numericModel)) {
        return numericModel === 0 ? "conversation" : "contact";
    }

    return "contact";
};

export const normalizeContactAttributeDefinition = (definition: unknown): ContactAttributeDefinition | null => {
    if (!isRecord(definition)) return null;

    const rawPayload = getRawPayload(definition);
    const attributeKey = normalizeText(definition.attribute_key || rawPayload.attribute_key || rawPayload.key);
    if (!attributeKey) return null;

    const chatwootAttributeId = Number(definition.chatwoot_attribute_id ?? rawPayload.id);

    return {
        chatwoot_attribute_id: Number.isNaN(chatwootAttributeId) ? undefined : chatwootAttributeId,
        attribute_key: attributeKey,
        attribute_display_name: normalizeText(
            definition.attribute_display_name || rawPayload.attribute_display_name || attributeKey,
        ),
        attribute_display_type: normalizeText(
            definition.attribute_display_type || rawPayload.attribute_display_type || rawPayload.type,
        ),
        attribute_description: normalizeText(
            definition.attribute_description ||
            rawPayload.attribute_description ||
            rawPayload.description ||
            rawPayload.regex_cue,
        ),
        attribute_scope: resolveAttributeScope(definition),
        regex_pattern: (definition.regex_pattern ?? rawPayload.regex_pattern ?? null) as string | null,
        regex_cue: (definition.regex_cue ?? rawPayload.regex_cue ?? null) as string | null,
        raw_payload: rawPayload,
    };
};

export const dedupeContactAttributeDefinitions = (definitions: unknown[]) => {
    const byKey = new Map<string, ContactAttributeDefinition>();

    definitions.forEach((definition) => {
        const normalizedDefinition = normalizeContactAttributeDefinition(definition);
        if (!normalizedDefinition) return;

        const existing = byKey.get(normalizedDefinition.attribute_key);
        byKey.set(normalizedDefinition.attribute_key, {
            ...existing,
            ...normalizedDefinition,
        });
    });

    return Array.from(byKey.values())
        .filter((definition) => definition.attribute_scope !== "conversation")
        .sort((a, b) =>
            (a.attribute_display_name || a.attribute_key).localeCompare(b.attribute_display_name || b.attribute_key),
        );
};
