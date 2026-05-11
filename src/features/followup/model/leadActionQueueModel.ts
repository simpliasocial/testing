import { resolveLeadAttributes } from "@/domain/lead";
import { formatFieldLabel } from "../../../lib/displayCopy";
import { parseAmount } from "../../../domain/lead";

export type AppointmentFormValue = string | boolean;

export type AttributeDefinition = {
    key: string;
    label: string;
    displayType: string;
    valueType: "text" | "number" | "date" | "boolean" | "textarea";
    options: string[];
    regexPattern?: string;
    regexCue?: string;
    description?: string;
};

export type HumanFlowConfigState = {
    humanFollowupQueueTags: string[];
    humanAppointmentTargetLabel: string;
    humanSalesQueueTags: string[];
    humanSaleTargetLabel: string;
    humanAppointmentFieldKeys: string[];
    humanSaleFieldKeys: string[];
};

type HumanFlowConfigInput = Partial<{
    [Key in keyof HumanFlowConfigState]: HumanFlowConfigState[Key];
}>;

type AttributeDefinitionSource = Record<string, unknown>;

const normalize = (value: unknown) =>
    String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

type LeadSearchValuesGetter<TLead> = (lead: TLead) => unknown[];

export interface SalesRowsFilterParams<TLead> {
    leads: TLead[];
    saleTargetLabel: string;
    selectedInboxes?: number[];
    startDate?: string;
    endDate?: string;
    search?: string;
    getLabels: (lead: TLead) => string[];
    getInboxId: (lead: TLead) => number | undefined;
    getOperationDate: (lead: TLead) => string;
    getSearchValues: LeadSearchValuesGetter<TLead>;
}

export const buildSearchText = (values: unknown[]) =>
    values.map(normalize).join(" ");

export const filterQueueBySearch = <TLead>(
    queue: TLead[],
    search: string,
    getSearchValues: LeadSearchValuesGetter<TLead>,
) => {
    const query = normalize(search);
    if (!query) return queue;

    return queue.filter((lead) => buildSearchText(getSearchValues(lead)).includes(query));
};

export const filterSalesRows = <TLead>({
    leads,
    saleTargetLabel,
    selectedInboxes = [],
    startDate = "",
    endDate = "",
    search = "",
    getLabels,
    getInboxId,
    getOperationDate,
    getSearchValues,
}: SalesRowsFilterParams<TLead>) => {
    const query = normalize(search);

    return leads
        .filter((lead) => getLabels(lead).includes(saleTargetLabel))
        .filter((lead) => {
            if (selectedInboxes.length > 0 && !selectedInboxes.includes(Number(getInboxId(lead)))) {
                return false;
            }

            const operationDateValue = getOperationDate(lead);
            if (startDate && (!operationDateValue || operationDateValue < startDate)) return false;
            if (endDate && (!operationDateValue || operationDateValue > endDate)) return false;
            if (!query) return true;

            return buildSearchText(getSearchValues(lead)).includes(query);
        })
        .sort((a, b) => (getOperationDate(b) || "").localeCompare(getOperationDate(a) || ""));
};

export const calculateSalesTotal = <TLead>(
    rows: TLead[],
    getAmountValue: (lead: TLead) => unknown,
) => rows.reduce((sum, lead) => sum + parseAmount(getAmountValue(lead)), 0);

export const LOCAL_ATTRIBUTE_DEFINITIONS: AttributeDefinition[] = [
    {
        key: "fecha_visita",
        label: "Fecha de visita",
        displayType: "date",
        valueType: "date",
        options: [],
        description: "fecha de agendar cita lead",
    },
    {
        key: "hora_visita",
        label: "Hora de visita",
        displayType: "text",
        valueType: "text",
        options: [],
        description: "hora de visita del lead",
    },
    {
        key: "responsable",
        label: "Responsable",
        displayType: "text",
        valueType: "text",
        options: [],
        description: "nombre de la persona responsable cuando hace el uso manual",
    },
    {
        key: "monto_operacion",
        label: "Monto de la operación",
        displayType: "number",
        valueType: "number",
        options: [],
        description: "valor a ingresar manualmente de cantidad $",
    },
    {
        key: "fecha_monto_operacion",
        label: "Fecha en que se registró el monto",
        displayType: "date",
        valueType: "date",
        options: [],
        description: "fecha de cuando se puso el monto de operacion",
    },
];

export const normalizeList = (values: string[] = []) =>
    Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));

export const getHumanFlowConfig = (
    config: HumanFlowConfigInput,
    defaults: HumanFlowConfigInput,
): HumanFlowConfigState => ({
    humanFollowupQueueTags: normalizeList(
        config.humanFollowupQueueTags || defaults.humanFollowupQueueTags || [],
    ),
    humanAppointmentTargetLabel: String(
        config.humanAppointmentTargetLabel || defaults.humanAppointmentTargetLabel || "",
    ).trim(),
    humanSalesQueueTags: normalizeList(config.humanSalesQueueTags || defaults.humanSalesQueueTags || []),
    humanSaleTargetLabel: String(
        config.humanSaleTargetLabel || defaults.humanSaleTargetLabel || "",
    ).trim(),
    humanAppointmentFieldKeys: normalizeList(
        config.humanAppointmentFieldKeys || defaults.humanAppointmentFieldKeys || [],
    ),
    humanSaleFieldKeys: normalizeList(config.humanSaleFieldKeys || defaults.humanSaleFieldKeys || []),
});

const arraysEqual = (left: string[], right: string[]) =>
    normalizeList(left).join("||") === normalizeList(right).join("||");

export const humanFlowConfigChanged = (left: HumanFlowConfigState, right: HumanFlowConfigState) =>
    !arraysEqual(left.humanFollowupQueueTags, right.humanFollowupQueueTags) ||
    left.humanAppointmentTargetLabel !== right.humanAppointmentTargetLabel ||
    !arraysEqual(left.humanSalesQueueTags, right.humanSalesQueueTags) ||
    left.humanSaleTargetLabel !== right.humanSaleTargetLabel ||
    !arraysEqual(left.humanAppointmentFieldKeys, right.humanAppointmentFieldKeys) ||
    !arraysEqual(left.humanSaleFieldKeys, right.humanSaleFieldKeys);

const normalizeAttributeOptions = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        return normalizeList(value.map((item) => String(item ?? "")));
    }

    if (value && typeof value === "object") {
        return normalizeList(Object.values(value as Record<string, unknown>).map((item) => String(item ?? "")));
    }

    if (typeof value === "string") {
        return normalizeList(value.split(","));
    }

    return [];
};

const getAttributeValueType = (
    displayType: string,
    options: string[] = [],
): AttributeDefinition["valueType"] => {
    if (options.length > 0) return "text";

    const normalizedType = normalize(displayType);
    if (
        normalizedType.includes("checkbox") ||
        normalizedType.includes("boolean") ||
        normalizedType.includes("switch") ||
        normalizedType.includes("toggle")
    ) {
        return "boolean";
    }
    if (normalizedType.includes("date")) return "date";
    if (
        normalizedType.includes("number") ||
        normalizedType.includes("decimal") ||
        normalizedType.includes("float") ||
        normalizedType.includes("currency")
    ) {
        return "number";
    }
    if (
        normalizedType.includes("textarea") ||
        normalizedType.includes("text_area") ||
        normalizedType.includes("long")
    ) {
        return "textarea";
    }
    return "text";
};

const isContactAttributeDefinition = (definition: AttributeDefinitionSource) => {
    const scopeHint = normalize(
        `${definition.attribute_scope || ""} ${definition.attribute_model_type || ""} ${definition.attribute_model || ""}`,
    );

    if (scopeHint.includes("conversation")) return false;
    if (scopeHint.includes("contact")) return true;

    const numericModel = Number(definition.attribute_model);
    if (!Number.isNaN(numericModel)) return numericModel !== 0;

    return true;
};

export const normalizeAttributeDefinitions = (
    definitions: AttributeDefinitionSource[] = [],
): AttributeDefinition[] => {
    const byKey = new Map<string, AttributeDefinition>();

    definitions.forEach((definition) => {
        const rawKey = definition.attribute_key || definition.key;
        if (!rawKey || !isContactAttributeDefinition(definition)) return;

        const key = String(rawKey).trim();
        if (!key) return;

        const options = normalizeAttributeOptions(
            definition.attribute_values ?? definition.options ?? definition.values,
        );
        const displayType = String(
            definition.attribute_display_type || definition.display_type || "text",
        )
            .trim()
            .toLowerCase();

        byKey.set(key, {
            key,
            label: formatFieldLabel(definition.attribute_display_name || definition.display_name || rawKey),
            displayType,
            valueType: getAttributeValueType(displayType, options),
            options,
            regexPattern: String(definition.regex_pattern || definition.regexPattern || "").trim() || undefined,
            regexCue: String(definition.regex_cue || definition.regexCue || "").trim() || undefined,
            description: String(
                definition.attribute_description || definition.description || "",
            ).trim() || undefined,
        });
    });

    return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
};

const inferAttributeValueType = (key: string, rawValue: unknown): AttributeDefinition["valueType"] => {
    if (typeof rawValue === "boolean") return "boolean";
    if (typeof rawValue === "number") return "number";

    const text = String(rawValue ?? "").trim();
    const normalizedKey = normalize(key);
    if (!text) return normalizedKey.includes("fecha") || normalizedKey.includes("date") ? "date" : "text";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return "date";
    if ((normalizedKey.includes("fecha") || normalizedKey.includes("date")) && toDateInputValue(text)) return "date";

    const normalizedText = normalize(text);
    if (["true", "false", "si", "no", "yes", "on", "off"].includes(normalizedText)) return "boolean";
    if (!Number.isNaN(Number(text)) && text !== "") return "number";
    return "text";
};

export const inferAttributeDefinitionsFromConversations = (leads: unknown[]): AttributeDefinition[] => {
    const byKey = new Map<string, AttributeDefinition>();

    (leads || []).forEach((lead) => {
        const attrs = resolveLeadAttributes(lead);
        Object.entries(attrs || {}).forEach(([key, rawValue]) => {
            const trimmedKey = String(key || "").trim();
            if (!trimmedKey) return;

            const inferredValueType = inferAttributeValueType(trimmedKey, rawValue);
            const inferredDisplayType =
                inferredValueType === "boolean"
                    ? "checkbox"
                    : inferredValueType === "number"
                        ? "number"
                        : inferredValueType === "date"
                            ? "date"
                            : "text";

            const existing = byKey.get(trimmedKey);
            if (!existing) {
                byKey.set(trimmedKey, {
                    key: trimmedKey,
                    label: formatFieldLabel(trimmedKey),
                    displayType: inferredDisplayType,
                    valueType: inferredValueType,
                    options: [],
                });
                return;
            }

            if (existing.valueType === "text" && inferredValueType !== "text") {
                byKey.set(trimmedKey, {
                    ...existing,
                    displayType: inferredDisplayType,
                    valueType: inferredValueType,
                });
            }
        });
    });

    return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
};

export const mergeAttributeDefinitions = (...groups: AttributeDefinition[][]): AttributeDefinition[] => {
    const byKey = new Map<string, AttributeDefinition>();

    groups.flat().forEach((definition) => {
        if (!definition?.key) return;

        const existing = byKey.get(definition.key);
        if (!existing) {
            byKey.set(definition.key, definition);
            return;
        }

        const incomingHasSpecificType =
            definition.valueType !== "text" ||
            definition.displayType !== "text" ||
            definition.options.length > 0;
        const existingHasSpecificType =
            existing.valueType !== "text" ||
            existing.displayType !== "text" ||
            existing.options.length > 0;

        byKey.set(definition.key, {
            ...existing,
            ...definition,
            label: definition.label || existing.label,
            displayType:
                incomingHasSpecificType || !existingHasSpecificType
                    ? definition.displayType
                    : existing.displayType,
            valueType:
                incomingHasSpecificType || !existingHasSpecificType
                    ? definition.valueType
                    : existing.valueType,
            options: definition.options.length > 0 ? definition.options : existing.options,
            regexPattern: definition.regexPattern || existing.regexPattern,
            regexCue: definition.regexCue || existing.regexCue,
            description: definition.description || existing.description,
        });
    });

    return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
};

export const toDateInputValue = (value: unknown) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toISOString().split("T")[0];
};

export const getFieldLabel = (definition: AttributeDefinition | undefined, key: string) =>
    formatFieldLabel(definition?.label || key);

const getNormalizedFieldIdentity = (definition: AttributeDefinition) =>
    normalize(`${definition.key} ${definition.label}`);

const isVisitDateField = (definition: AttributeDefinition) => {
    const identity = getNormalizedFieldIdentity(definition);
    return identity.includes("fecha_visita") || identity.includes("fecha visita");
};

const isVisitTimeField = (definition: AttributeDefinition) => {
    const identity = getNormalizedFieldIdentity(definition);
    return identity.includes("hora_visita") || identity.includes("hora visita");
};

export const getFieldTypeLabel = (definition: AttributeDefinition) => {
    if (definition.options.length > 0) return "lista";
    switch (definition.valueType) {
        case "boolean":
            return "checkbox";
        case "number":
            return "número";
        case "date":
            return "fecha";
        case "textarea":
            return "texto largo";
        default:
            return "texto";
    }
};

export const getAppointmentFieldExample = (definition: AttributeDefinition) => {
    if (isVisitDateField(definition)) return "Ejemplo: 2026-04-23 (YYYY-MM-DD)";
    if (isVisitTimeField(definition)) return "Ejemplo: 21:00 (HH:mm)";
    if (definition.key === "monto_operacion") return "Ejemplo: 15000";
    if (definition.key === "fecha_monto_operacion") return "Formato: YYYY-MM-DD";
    if (definition.valueType === "date") return "Formato: YYYY-MM-DD";
    return "";
};

const parseNumericFieldValue = (value: string) => {
    const normalized = String(value || "")
        .trim()
        .replace(",", ".")
        .replace(/[^0-9.-]/g, "");

    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};

const coerceBooleanValue = (value: unknown) => {
    if (typeof value === "boolean") return value;
    const normalizedValue = normalize(value);
    return ["true", "1", "si", "yes", "on", "activo"].includes(normalizedValue);
};

export const getAppointmentFieldInitialValue = (
    field: AttributeDefinition,
    rawValue: unknown,
): AppointmentFormValue => {
    if (field.valueType === "boolean") return coerceBooleanValue(rawValue);
    if (field.valueType === "date") return toDateInputValue(rawValue);
    return rawValue == null ? "" : String(rawValue);
};

export const validateAppointmentFieldValue = (
    field: AttributeDefinition,
    value: AppointmentFormValue,
) => {
    const label = getFieldLabel(field, field.key);

    if (field.valueType === "boolean") return null;

    const rawText = String(value ?? "").trim();
    if (!rawText) return `Completa el campo ${label}`;

    if (field.valueType === "number" && parseNumericFieldValue(rawText) === null) {
        return `${label} debe ser un número válido`;
    }

    if (field.valueType === "date" && !toDateInputValue(rawText)) {
        return `${label} debe tener una fecha válida`;
    }

    if (isVisitDateField(field) && !/^\d{4}-\d{2}-\d{2}$/.test(rawText)) {
        return `${label} debe estar en formato YYYY-MM-DD`;
    }

    if (isVisitTimeField(field) && !/^([01]\d|2[0-3]):[0-5]\d$/.test(rawText)) {
        return `${label} debe estar en formato HH:mm, por ejemplo 21:00`;
    }

    if (field.regexPattern) {
        try {
            const pattern = new RegExp(field.regexPattern);
            if (!pattern.test(rawText)) {
                return field.regexCue || `${label} no cumple el formato esperado`;
            }
        } catch {
            // If the external rule is invalid, skip hard validation rather than blocking the user.
        }
    }

    return null;
};

export const serializeAppointmentFieldValue = (
    field: AttributeDefinition,
    value: AppointmentFormValue,
) => {
    if (field.valueType === "boolean") return Boolean(value);
    if (field.valueType === "number") return parseNumericFieldValue(String(value ?? "")) ?? null;
    if (field.valueType === "date") return toDateInputValue(value) || "";
    return String(value ?? "").trim();
};

export const formatAppointmentFieldValue = (
    field: AttributeDefinition,
    value: AppointmentFormValue,
) => {
    if (field.valueType === "boolean") return value ? "Sí" : "No";
    return String(value ?? "").trim();
};

export const getEmptyQueueMessage = (title: string, configuredTags: string[]) => {
    if (configuredTags.length === 0) {
        return `Configura primero los estados de ${title.toLowerCase()} para poblar esta tabla.`;
    }
    return `No hay leads disponibles en ${title.toLowerCase()} con los filtros actuales.`;
};
