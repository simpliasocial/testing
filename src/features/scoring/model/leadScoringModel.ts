import type { ContactAttributeDefinition } from "../../../domain/dashboard";
import { formatFieldLabel } from "../../../lib/displayCopy";

export type ScoreDimension = "label" | "campaign";

export interface ScoreAttributeOption {
    key: string;
    label: string;
    description: string;
    type: string;
}

type LabelLead = {
    labels?: unknown[];
    resolvedLabels?: unknown[];
};

type CampaignLead = {
    resolvedAttrs?: {
        utm_campaign?: unknown;
        campana?: unknown;
        origen?: unknown;
    };
};

export const unique = (values: string[]) =>
    Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

export const parseDate = (value: unknown) => {
    if (!value) return new Date(0);
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return new Date(numeric < 10000000000 ? numeric * 1000 : numeric);
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
};

export const scoreAverage = (items: Array<{ score: number | null }>) =>
    items.length > 0
        ? Math.round((items.reduce((sum, item) => sum + (item.score || 0), 0) / items.length) * 10) / 10
        : 0;

export const percent = (count: number, total: number) =>
    total > 0 ? Math.round((count / total) * 100) : 0;

export const isNumericAttributeDefinition = (definition: ContactAttributeDefinition) => {
    const type = String(definition.attribute_display_type || "").trim().toLowerCase();
    return ["number", "integer", "decimal", "float"].some((token) => type.includes(token));
};

export const toAttributeOption = (definition: ContactAttributeDefinition): ScoreAttributeOption | null => {
    const key = String(definition.attribute_key || "").trim();
    if (!key) return null;

    return {
        key,
        label: formatFieldLabel(definition.attribute_display_name || key),
        description: String(definition.attribute_description || "").trim(),
        type: String(definition.attribute_display_type || "number").trim(),
    };
};

export const buildScoreAttributeOptions = (definitions: ContactAttributeDefinition[]) => {
    const byKey = new Map<string, ScoreAttributeOption>();

    definitions
        .filter(isNumericAttributeDefinition)
        .forEach((definition) => {
            const option = toAttributeOption(definition);
            if (!option) return;
            byKey.set(option.key, option);
        });

    return Array.from(byKey.values()).sort((a, b) => {
        if (a.key === "score_interes") return -1;
        if (b.key === "score_interes") return 1;
        return a.label.localeCompare(b.label);
    });
};

export const extractLeadLabels = (lead: LabelLead) =>
    unique([...(lead?.resolvedLabels || []), ...(lead?.labels || [])].map((label) => String(label || "")));

export const resolveLeadCampaign = (lead: CampaignLead) =>
    String(
        lead?.resolvedAttrs?.utm_campaign ||
        lead?.resolvedAttrs?.campana ||
        lead?.resolvedAttrs?.origen ||
        "",
    ).trim() || "Sin campaña";
