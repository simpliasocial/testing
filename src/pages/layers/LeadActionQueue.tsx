import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import {
    Loader2,
    ListTodo,
    ExternalLink,
    Clock,
    MessageSquare,
    RefreshCw,
    Phone,
    UserCircle,
    CheckCircle2,
    AlertTriangle,
    Search,
    DollarSign,
    FileSpreadsheet,
    CalendarDays,
    Check,
    Settings2,
    ChevronDown,
    ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    DEFAULT_TAG_CONFIG,
    TagConfig,
    useDashboardContext
} from "@/context/DashboardDataContext";
import { useAuth } from "@/context/AuthContext";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { ChannelSelector } from "@/components/dashboard/ChannelSelector";
import { ExportToExcel } from "@/components/dashboard/ExportToExcel";
import { chatwootService } from "@/services/ChatwootService";
import { SupabaseService } from "@/services/SupabaseService";
import { LabelEventService } from "@/services/LabelEventService";
import { supabase } from "@/lib/supabase";
import { getGuayaquilDateString } from "@/lib/guayaquilTime";
import { MinifiedConversation } from "@/services/StorageService";
import { DateRange } from "react-day-picker";
import {
    getConversationMessageRole,
    getDisplayMessages,
    formatDateTime,
    getAttrs,
    getChatwootUrl,
    getInitials,
    getLastMessage,
    getLeadChannelName,
    getLeadEmail,
    getLeadExternalUrl,
    getLeadName,
    getLeadOperationDate,
    getLeadPhone,
    getMessageText,
    getMessagePreview,
    getMessageTimestamp,
    getRawLeadPhone,
    money,
    normalize,
    operationDateToIso,
    parseAmount
} from "@/lib/leadDisplay";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type QueueLead = any;
type AppointmentFormValue = string | boolean;

type AttributeDefinition = {
    key: string;
    label: string;
    displayType: string;
    valueType: "text" | "number" | "date" | "boolean" | "textarea";
    options: string[];
    regexPattern?: string;
    regexCue?: string;
    description?: string;
};

type HumanFlowConfigState = {
    humanFollowupQueueTags: string[];
    humanAppointmentTargetLabel: string;
    humanSalesQueueTags: string[];
    humanSaleTargetLabel: string;
    humanAppointmentFieldKeys: string[];
};

const normalizeList = (values: string[] = []) =>
    Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));

const getHumanFlowConfig = (config: TagConfig): HumanFlowConfigState => ({
    humanFollowupQueueTags: normalizeList(config.humanFollowupQueueTags || DEFAULT_TAG_CONFIG.humanFollowupQueueTags || []),
    humanAppointmentTargetLabel: String(
        config.humanAppointmentTargetLabel || DEFAULT_TAG_CONFIG.humanAppointmentTargetLabel || ""
    ).trim(),
    humanSalesQueueTags: normalizeList(config.humanSalesQueueTags || DEFAULT_TAG_CONFIG.humanSalesQueueTags || []),
    humanSaleTargetLabel: String(
        config.humanSaleTargetLabel || DEFAULT_TAG_CONFIG.humanSaleTargetLabel || ""
    ).trim(),
    humanAppointmentFieldKeys: normalizeList(config.humanAppointmentFieldKeys || DEFAULT_TAG_CONFIG.humanAppointmentFieldKeys || [])
});

const arraysEqual = (left: string[], right: string[]) =>
    normalizeList(left).join("||") === normalizeList(right).join("||");

const humanFlowConfigChanged = (left: HumanFlowConfigState, right: HumanFlowConfigState) =>
    !arraysEqual(left.humanFollowupQueueTags, right.humanFollowupQueueTags) ||
    left.humanAppointmentTargetLabel !== right.humanAppointmentTargetLabel ||
    !arraysEqual(left.humanSalesQueueTags, right.humanSalesQueueTags) ||
    left.humanSaleTargetLabel !== right.humanSaleTargetLabel ||
    !arraysEqual(left.humanAppointmentFieldKeys, right.humanAppointmentFieldKeys);

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
    options: string[] = []
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

const isContactAttributeDefinition = (definition: any) => {
    const scopeHint = normalize(
        `${definition?.attribute_scope || ""} ${definition?.attribute_model_type || ""} ${definition?.attribute_model || ""}`
    );

    if (scopeHint.includes("conversation")) return false;
    if (scopeHint.includes("contact")) return true;

    const numericModel = Number(definition?.attribute_model);
    if (!Number.isNaN(numericModel)) return numericModel !== 0;

    return true;
};

const normalizeAttributeDefinitions = (definitions: any[]): AttributeDefinition[] => {
    const byKey = new Map<string, AttributeDefinition>();

    (definitions || []).forEach((definition) => {
        const rawKey = definition?.attribute_key || definition?.key;
        if (!rawKey || !isContactAttributeDefinition(definition)) return;

        const key = String(rawKey).trim();
        if (!key) return;

        const options = normalizeAttributeOptions(
            definition.attribute_values ?? definition.options ?? definition.values
        );
        const displayType = String(
            definition.attribute_display_type || definition.display_type || "text"
        )
            .trim()
            .toLowerCase();

        byKey.set(key, {
            key,
            label: String(definition.attribute_display_name || definition.display_name || rawKey).trim(),
            displayType,
            valueType: getAttributeValueType(displayType, options),
            options,
            regexPattern: String(definition.regex_pattern || definition.regexPattern || "").trim() || undefined,
            regexCue: String(definition.regex_cue || definition.regexCue || "").trim() || undefined,
            description: String(
                definition.attribute_description || definition.description || ""
            ).trim() || undefined
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

const inferAttributeDefinitionsFromConversations = (leads: QueueLead[]): AttributeDefinition[] => {
    const byKey = new Map<string, AttributeDefinition>();

    (leads || []).forEach((lead) => {
        const attrs = getAttrs(lead);
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
                    label: trimmedKey.replace(/_/g, " "),
                    displayType: inferredDisplayType,
                    valueType: inferredValueType,
                    options: []
                });
                return;
            }

            if (existing.valueType === "text" && inferredValueType !== "text") {
                byKey.set(trimmedKey, {
                    ...existing,
                    displayType: inferredDisplayType,
                    valueType: inferredValueType
                });
            }
        });
    });

    return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
};

const mergeAttributeDefinitions = (...groups: AttributeDefinition[][]): AttributeDefinition[] => {
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
            description: definition.description || existing.description
        });
    });

    return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
};

const toDateInputValue = (value: unknown) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toISOString().split("T")[0];
};

const getFieldLabel = (definition: AttributeDefinition | undefined, key: string) =>
    definition?.label || key.replace(/_/g, " ");

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

const getFieldTypeLabel = (definition: AttributeDefinition) => {
    if (definition.options.length > 0) return "lista";
    switch (definition.valueType) {
        case "boolean":
            return "checkbox";
        case "number":
            return "numero";
        case "date":
            return "fecha";
        case "textarea":
            return "texto largo";
        default:
            return "texto";
    }
};

const getAppointmentFieldExample = (definition: AttributeDefinition) => {
    if (isVisitDateField(definition)) return "Ejemplo: 2026-04-23 (YYYY-MM-DD)";
    if (isVisitTimeField(definition)) return "Ejemplo: 21:00 (HH:mm)";
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

const getAppointmentFieldInitialValue = (
    field: AttributeDefinition,
    rawValue: unknown
): AppointmentFormValue => {
    if (field.valueType === "boolean") return coerceBooleanValue(rawValue);
    if (field.valueType === "date") return toDateInputValue(rawValue);
    return rawValue == null ? "" : String(rawValue);
};

const validateAppointmentFieldValue = (
    field: AttributeDefinition,
    value: AppointmentFormValue
) => {
    const label = getFieldLabel(field, field.key);

    if (field.valueType === "boolean") return null;

    const rawText = String(value ?? "").trim();
    if (!rawText) return `Completa el campo ${label}`;

    if (field.valueType === "number" && parseNumericFieldValue(rawText) === null) {
        return `${label} debe ser un numero valido`;
    }

    if (field.valueType === "date" && !toDateInputValue(rawText)) {
        return `${label} debe tener una fecha valida`;
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
            // If Chatwoot stored an invalid regex, we skip hard validation rather than blocking the user.
        }
    }

    return null;
};

const serializeAppointmentFieldValue = (
    field: AttributeDefinition,
    value: AppointmentFormValue
) => {
    if (field.valueType === "boolean") return Boolean(value);
    if (field.valueType === "number") return parseNumericFieldValue(String(value ?? "")) ?? null;
    if (field.valueType === "date") return toDateInputValue(value) || "";
    return String(value ?? "").trim();
};

const formatAppointmentFieldValue = (
    field: AttributeDefinition,
    value: AppointmentFormValue
) => {
    if (field.valueType === "boolean") return value ? "Si" : "No";
    return String(value ?? "").trim();
};

const getEmptyQueueMessage = (title: string, configuredTags: string[]) => {
    if (configuredTags.length === 0) {
        return `Configura primero las etiquetas de ${title.toLowerCase()} para poblar esta tabla.`;
    }
    return `No hay leads disponibles en ${title.toLowerCase()} con los filtros actuales.`;
};

const LeadActionQueue = () => {
    const {
        globalFilters,
        tagSettings,
        labels: allAvailableLabels,
        conversations,
        inboxes,
        setGlobalFilters,
        updateTagSettings,
        refetch: refetchContext
    } = useDashboardContext();
    const { loading, error, data, refetch } = useDashboardData({
        ...globalFilters,
        ...tagSettings
    });
    const { role } = useAuth();

    const savedHumanConfig = useMemo(() => getHumanFlowConfig(tagSettings), [tagSettings]);
    const [humanConfig, setHumanConfig] = useState<HumanFlowConfigState>(savedHumanConfig);

    useEffect(() => {
        setHumanConfig(savedHumanConfig);
    }, [savedHumanConfig]);

    const [loadedAttributeDefinitions, setLoadedAttributeDefinitions] = useState<AttributeDefinition[]>([]);
    const [loadingAttributeDefinitions, setLoadingAttributeDefinitions] = useState(false);
    const [isHumanConfigOpen, setIsHumanConfigOpen] = useState(false);

    const [selectedLead, setSelectedLead] = useState<QueueLead | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [historyMessages, setHistoryMessages] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
    const [isTagConfirmOpen, setIsTagConfirmOpen] = useState(false);
    const [newTag, setNewTag] = useState<string>("");

    const [followUpSearch, setFollowUpSearch] = useState("");
    const [scheduledSearch, setScheduledSearch] = useState("");

    const [operationLead, setOperationLead] = useState<QueueLead | null>(null);
    const [operationAmount, setOperationAmount] = useState("");
    const [operationDate, setOperationDate] = useState(getGuayaquilDateString());
    const [isOperationDialogOpen, setIsOperationDialogOpen] = useState(false);
    const [isOperationConfirmOpen, setIsOperationConfirmOpen] = useState(false);
    const [isSavingOperation, setIsSavingOperation] = useState(false);

    const [appointmentLead, setAppointmentLead] = useState<QueueLead | null>(null);
    const [appointmentValues, setAppointmentValues] = useState<Record<string, AppointmentFormValue>>({});
    const [isAppointmentDialogOpen, setIsAppointmentDialogOpen] = useState(false);
    const [isAppointmentConfirmOpen, setIsAppointmentConfirmOpen] = useState(false);
    const [isSavingAppointment, setIsSavingAppointment] = useState(false);

    const [salesStartDate, setSalesStartDate] = useState("");
    const [salesEndDate, setSalesEndDate] = useState("");
    const [salesSearch, setSalesSearch] = useState("");

    const inboxMap = useMemo(() => new Map(inboxes.map((inbox: any) => [Number(inbox.id), inbox])), [inboxes]);

    const getChannelName = useCallback((lead: Partial<MinifiedConversation> | any) => {
        const inbox = lead?.inbox_id ? inboxMap.get(Number(lead.inbox_id)) : null;
        return getLeadChannelName(lead, inbox);
    }, [inboxMap]);

    const followUpQueue = useMemo(() => {
        const queue = data.operationalMetrics?.followUpQueue || [];
        const query = normalize(followUpSearch);
        if (!query) return queue;

        return queue.filter((lead: QueueLead) => {
            const attrs = getAttrs(lead);
            const haystack = [
                lead.id,
                getLeadName(lead),
                getLeadPhone(lead, getChannelName(lead)),
                getRawLeadPhone(lead),
                getLeadEmail(lead),
                attrs.celular,
                attrs.nombre_completo
            ].map(normalize).join(" ");

            return haystack.includes(query);
        });
    }, [data, followUpSearch, getChannelName]);

    const scheduledAppointmentsQueue = useMemo(() => {
        const queue = data.operationalMetrics?.scheduledAppointmentsQueue || [];
        const query = normalize(scheduledSearch);
        if (!query) return queue;

        return queue.filter((lead: QueueLead) => {
            const attrs = getAttrs(lead);
            const haystack = [
                lead.id,
                getLeadName(lead),
                getLeadPhone(lead, getChannelName(lead)),
                getRawLeadPhone(lead),
                getLeadEmail(lead),
                attrs.celular,
                attrs.nombre_completo
            ].map(normalize).join(" ");

            return haystack.includes(query);
        });
    }, [data, scheduledSearch, getChannelName]);

    const humanFollowupQueueTags = savedHumanConfig.humanFollowupQueueTags;
    const humanAppointmentTargetLabel = savedHumanConfig.humanAppointmentTargetLabel;
    const humanSalesQueueTags = savedHumanConfig.humanSalesQueueTags;
    const humanSaleTargetLabel = savedHumanConfig.humanSaleTargetLabel;


    const mergedLabels = useMemo(
        () =>
            normalizeList([
                ...allAvailableLabels,
                ...savedHumanConfig.humanFollowupQueueTags,
                savedHumanConfig.humanAppointmentTargetLabel,
                ...savedHumanConfig.humanSalesQueueTags,
                savedHumanConfig.humanSaleTargetLabel
            ]),
        [allAvailableLabels, savedHumanConfig]
    );

    const inferredAttributeDefinitions = useMemo(
        () => inferAttributeDefinitionsFromConversations(conversations),
        [conversations]
    );

    const attributeDefinitions = useMemo(
        () => mergeAttributeDefinitions(loadedAttributeDefinitions, inferredAttributeDefinitions),
        [loadedAttributeDefinitions, inferredAttributeDefinitions]
    );

    const attributeDefinitionMap = useMemo(
        () => new Map(attributeDefinitions.map((definition) => [definition.key, definition])),
        [attributeDefinitions]
    );

    const configuredAppointmentFields = useMemo(
        () =>
            savedHumanConfig.humanAppointmentFieldKeys.map((key) => {
                const definition = attributeDefinitionMap.get(key);
                if (definition) return definition;
                return {
                    key,
                    label: key.replace(/_/g, " "),
                    displayType: "text",
                    valueType: "text" as const,
                    options: [] as string[]
                };
            }),
        [attributeDefinitionMap, savedHumanConfig.humanAppointmentFieldKeys]
    );

    const hasHumanConfigChanges = useMemo(
        () => humanFlowConfigChanged(humanConfig, savedHumanConfig),
        [humanConfig, savedHumanConfig]
    );

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
                        .select(
                            "attribute_key, attribute_display_name, attribute_display_type, attribute_values, attribute_scope, attribute_model, regex_pattern, regex_cue, attribute_description"
                        )
                        .order("attribute_display_name", { ascending: true })
                ]);
                const liveRawDefinitions =
                    liveResult.status === "fulfilled" ? liveResult.value : [];
                const fallbackDefinitions =
                    fallbackResult.status === "fulfilled" && !fallbackResult.value.error
                        ? fallbackResult.value.data || []
                        : [];

                const mergedDefinitions = mergeAttributeDefinitions(
                    normalizeAttributeDefinitions(liveRawDefinitions || []),
                    normalizeAttributeDefinitions(fallbackDefinitions)
                );

                if (!cancelled) {
                    setLoadedAttributeDefinitions(mergedDefinitions);
                }
            } catch (attributeError) {
                console.error("Error loading Chatwoot attribute definitions:", attributeError);
                if (!cancelled) {
                    setLoadedAttributeDefinitions([]);
                    toast.error("No se pudieron cargar los contact attributes de Chatwoot");
                }
            } finally {
                if (!cancelled) {
                    setLoadingAttributeDefinitions(false);
                }
            }
        };

        loadAttributeDefinitions();

        return () => {
            cancelled = true;
        };
    }, []);

    const handleQueueDateRangeChange = (range: DateRange | undefined) => {
        setGlobalFilters((prev) => ({ ...prev, startDate: range?.from, endDate: range?.to }));
    };

    const handleQueueInboxesChange = (selectedInboxes: number[]) => {
        setGlobalFilters((prev) => ({ ...prev, selectedInboxes }));
    };

    const updateHumanConfigList = (key: keyof Pick<HumanFlowConfigState, "humanFollowupQueueTags" | "humanSalesQueueTags" | "humanAppointmentFieldKeys">, value: string) => {
        setHumanConfig((prev) => ({
            ...prev,
            [key]: prev[key].includes(value)
                ? prev[key].filter((item) => item !== value)
                : [...prev[key], value]
        }));
    };

    const saveHumanConfig = async () => {
        try {
            await updateTagSettings({
                ...tagSettings,
                ...humanConfig
            });
            toast.success("Configuracion del flujo humano actualizada");
        } catch (configError) {
            console.error("Error saving human flow config:", configError);
            toast.error("No se pudo guardar la configuracion del flujo humano");
        }
    };



    const salesRows = useMemo(() => {
        const query = normalize(salesSearch);
        return conversations
            .filter((lead) => lead.labels?.includes(humanSaleTargetLabel))
            .filter((lead) => {
                if ((globalFilters.selectedInboxes || []).length > 0 && !globalFilters.selectedInboxes?.includes(Number(lead.inbox_id))) {
                    return false;
                }

                const operationDateValue = getLeadOperationDate(lead);
                if (salesStartDate && (!operationDateValue || operationDateValue < salesStartDate)) return false;
                if (salesEndDate && (!operationDateValue || operationDateValue > salesEndDate)) return false;

                if (!query) return true;
                const haystack = [
                    lead.id,
                    getLeadName(lead),
                    getLeadPhone(lead, getChannelName(lead)),
                    getLeadEmail(lead),
                    getChannelName(lead)
                ].map(normalize).join(" ");
                return haystack.includes(query);
            })
            .sort((a, b) => (getLeadOperationDate(b) || "").localeCompare(getLeadOperationDate(a) || ""));
    }, [conversations, globalFilters.selectedInboxes, humanSaleTargetLabel, salesEndDate, salesSearch, salesStartDate, inboxMap]);

    const salesTotal = useMemo(
        () => salesRows.reduce((sum, lead) => sum + parseAmount(getAttrs(lead).monto_operacion), 0),
        [salesRows]
    );

    const applyLeadWorkflowUpdate = async ({
        lead,
        nextLabels,
        contactAttributePatch,
        conversationUpdatePatch,
        rawPayload,
        successMessage
    }: {
        lead: QueueLead;
        nextLabels: string[];
        contactAttributePatch?: Record<string, any>;
        conversationUpdatePatch?: Record<string, any>;
        rawPayload: Record<string, any>;
        successMessage: string;
    }) => {
        const contactId = lead.meta?.sender?.id;
        if (!contactId) {
            throw new Error("No se encontro el ID del contacto de Chatwoot");
        }

        const currentContactAttrs = lead.meta?.sender?.custom_attributes || {};
        const currentConvAttrs = lead.custom_attributes || {};
        const nextContactAttrs = {
            ...currentContactAttrs,
            ...(contactAttributePatch || {})
        };
        const nextMergedAttrs = {
            ...currentConvAttrs,
            ...nextContactAttrs
        };

        if (contactAttributePatch && Object.keys(contactAttributePatch).length > 0) {
            await chatwootService.updateContact(contactId, {
                custom_attributes: nextContactAttrs
            });
        }

        await chatwootService.updateConversationLabels(lead.id, nextLabels);

        await LabelEventService.recordConversationLabelChange({
            conversationId: lead.id,
            previousLabels: lead.labels || [],
            nextLabels,
            eventSource: "dashboard",
            rawPayload
        });

        const { error: supabaseError } = await supabase
            .schema("cw")
            .from("conversations_current")
            .update({
                labels: nextLabels,
                custom_attributes: nextMergedAttrs,
                updated_at: new Date().toISOString(),
                ...(conversationUpdatePatch || {})
            })
            .eq("chatwoot_conversation_id", lead.id);

        if (supabaseError) throw supabaseError;

        toast.success(successMessage);
        await Promise.all([refetchContext(), refetch?.()]);
    };

    const openAppointmentDialog = (lead: QueueLead) => {
        if (configuredAppointmentFields.length === 0) {
            toast.error("Configura primero los campos de cita agendada en la seccion de flujo humano");
            return;
        }

        const attrs = getAttrs(lead);
        const nextValues = configuredAppointmentFields.reduce<Record<string, AppointmentFormValue>>((acc, field) => {
            const rawValue = attrs[field.key];
            acc[field.key] = getAppointmentFieldInitialValue(field, rawValue);
            return acc;
        }, {});

        setAppointmentLead(lead);
        setAppointmentValues(nextValues);
        setIsAppointmentDialogOpen(true);
    };

    const handleAppointmentValueChange = (key: string, value: AppointmentFormValue) => {
        setAppointmentValues((prev) => ({
            ...prev,
            [key]: value
        }));
    };

    const handleAppointmentFormConfirm = () => {
        if (!appointmentLead) return;

        const invalidField = configuredAppointmentFields
            .map((field) => ({
                field,
                error: validateAppointmentFieldValue(field, appointmentValues[field.key])
            }))
            .find((result) => result.error);

        if (invalidField?.error) {
            toast.error(invalidField.error);
            return;
        }

        setIsAppointmentConfirmOpen(true);
    };

    const executeAppointmentConfirm = async () => {
        if (!appointmentLead) return;

        setIsSavingAppointment(true);
        try {
            const appointmentPayload = Object.fromEntries(
                configuredAppointmentFields.map((field) => [
                    field.key,
                    serializeAppointmentFieldValue(field, appointmentValues[field.key])
                ])
            );

            await applyLeadWorkflowUpdate({
                lead: appointmentLead,
                nextLabels: [humanAppointmentTargetLabel],
                contactAttributePatch: appointmentPayload,
                rawPayload: {
                    action: "schedule_human_appointment",
                    fields: appointmentPayload,
                    target_label: humanAppointmentTargetLabel
                },
                successMessage: `Lead actualizado a ${humanAppointmentTargetLabel}`
            });

            setIsAppointmentConfirmOpen(false);
            setIsAppointmentDialogOpen(false);
            setAppointmentLead(null);
            setAppointmentValues({});
        } catch (appointmentError) {
            console.error("Error confirming human appointment:", appointmentError);
            toast.error("No se pudo guardar la cita agendada en Chatwoot");
        } finally {
            setIsSavingAppointment(false);
        }
    };

    const openOperationDialog = (lead: QueueLead) => {
        const attrs = getAttrs(lead);
        setOperationLead(lead);
        setOperationAmount(attrs.monto_operacion ? String(attrs.monto_operacion) : "");
        setOperationDate(getLeadOperationDate(lead) || getGuayaquilDateString());
        setIsOperationDialogOpen(true);
    };

    const handleOperationFormConfirm = () => {
        if (!operationLead) return;
        if (!operationAmount.trim()) {
            toast.error("Ingresa el monto de la operacion");
            return;
        }
        if (!operationDate) {
            toast.error("Ingresa la fecha del monto de operacion");
            return;
        }
        setIsOperationConfirmOpen(true);
    };

    const executeOperationConfirm = async () => {
        if (!operationLead) return;

        setIsSavingOperation(true);
        try {
            await applyLeadWorkflowUpdate({
                lead: operationLead,
                nextLabels: [humanSaleTargetLabel],
                contactAttributePatch: {
                    monto_operacion: operationAmount.trim(),
                    fecha_monto_operacion: operationDate
                },
                conversationUpdatePatch: {
                    monto_operacion: operationAmount.trim(),
                    fecha_monto_operacion: operationDateToIso(operationDate)
                },
                rawPayload: {
                    action: "confirm_operation",
                    monto_operacion: operationAmount.trim(),
                    fecha_monto_operacion: operationDate,
                    target_label: humanSaleTargetLabel
                },
                successMessage: `Operacion confirmada y marcada como ${humanSaleTargetLabel}`
            });

            setIsOperationConfirmOpen(false);
            setIsOperationDialogOpen(false);
            setOperationLead(null);
        } catch (operationError) {
            console.error("Error confirming operation:", operationError);
            toast.error("No se pudo confirmar la operacion en Chatwoot");
        } finally {
            setIsSavingOperation(false);
        }
    };

    const exportSalesReport = () => {
        if (salesRows.length === 0) {
            toast.error("No hay ventas exitosas para exportar con esos filtros");
            return;
        }

        const activeFields = tagSettings?.excelExportFields && tagSettings.excelExportFields.length > 0
            ? tagSettings.excelExportFields
            : ["ID", "Nombre", "Telefono", "Canal", "Etiquetas", "Correo", "Enlace Chatwoot", "Fecha Ingreso", "Ultima Interaccion"];

        const detailRows = salesRows.map((lead) => {
            const attrs = getAttrs(lead);
            const createdAt = lead.created_at ? new Date(lead.created_at * 1000) : null;
            const lastActivity = lead.timestamp ? new Date(lead.timestamp * 1000) : null;
            const canal = getChannelName(lead);

            const row: any = {};

            activeFields.forEach(field => {
                switch (field) {
                    case "ID": row[field] = lead.id; break;
                    case "Nombre": row[field] = getLeadName(lead); break;
                    case "Telefono": row[field] = getLeadPhone(lead, canal); break;
                    case "Canal": row[field] = canal; break;
                    case "Etiquetas": row[field] = (lead.labels || []).join(", "); break;
                    case "Correo": row[field] = getLeadEmail(lead); break;
                    case "Monto": row[field] = attrs.monto_operacion || ""; break;
                    case "Fecha Monto": row[field] = getLeadOperationDate(lead); break;
                    case "Agencia": row[field] = attrs.agencia || ""; break;
                    case "Check-in": row[field] = attrs.checkincat || ""; break;
                    case "Check-out": row[field] = attrs.checkoutcat || ""; break;
                    case "Campana": row[field] = attrs.campana || ""; break;
                    case "Ciudad": row[field] = attrs.ciudad || ""; break;
                    case "Responsable": row[field] = attrs.responsable || lead.meta?.assignee?.name || ""; break;
                    case "URL Red Social": row[field] = getLeadExternalUrl(lead, canal); break;
                    case "Enlace Chatwoot": row[field] = getChatwootUrl(lead.id); break;
                    case "Fecha Ingreso": row[field] = createdAt ? formatDateTime(createdAt.getTime()) : ""; break;
                    case "Ultima Interaccion": row[field] = lastActivity ? formatDateTime(lastActivity.getTime()) : ""; break;
                    case "ID Contacto": row[field] = lead.meta?.sender?.id || ""; break;
                    case "ID Inbox": row[field] = lead.inbox_id || ""; break;
                    case "ID Cuenta": row[field] = (lead as any).account_id || ""; break;
                    case "Origen Dato": row[field] = lead.source || ""; break;
                    default: row[field] = attrs[field] || ""; break;
                }
            });

            // Siempre incluimos Monto Numerico internamente por si acaso, aunque xlsx.utils lo tomara
            // Para mantener compatibilidad con reportes agregados lo usaremos (el dashboard lo calculaba abajo)
            row["Monto Numerico"] = parseAmount(attrs.monto_operacion);
            return row;
        });

        const byChannel = new Map<string, { canal: string; ventas: number; monto: number }>();
        const byMonth = new Map<string, { periodo: string; ventas: number; monto: number }>();

        salesRows.forEach((lead) => {
            const amount = parseAmount(getAttrs(lead).monto_operacion);
            const channel = getChannelName(lead);
            const month = (getLeadOperationDate(lead) || "Sin fecha").slice(0, 7);

            const channelRow = byChannel.get(channel) || { canal: channel, ventas: 0, monto: 0 };
            channelRow.ventas += 1;
            channelRow.monto += amount;
            byChannel.set(channel, channelRow);

            const monthRow = byMonth.get(month) || { periodo: month, ventas: 0, monto: 0 };
            monthRow.ventas += 1;
            monthRow.monto += amount;
            byMonth.set(month, monthRow);
        });

        const summaryRows = [
            ["Generado", new Date().toLocaleString()],
            ["Filtro fecha inicio", salesStartDate || "Todos"],
            ["Filtro fecha fin", salesEndDate || "Todos"],
            ["Filtro busqueda", salesSearch || "Todos"],
            ["Etiqueta venta usada", humanSaleTargetLabel],
            ["Ventas exitosas", salesRows.length],
            ["Monto total", salesTotal],
            ["Ticket promedio", salesRows.length > 0 ? salesTotal / salesRows.length : 0],
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Resumen");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.from(byChannel.values())), "Por Canal");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.from(byMonth.values())), "Por Mes");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Detalle Ventas");
        XLSX.writeFile(wb, `reporte_ventas_exitosas_${getGuayaquilDateString()}.xlsx`);
        toast.success("Reporte de ventas exitosas generado");
    };

    const handleViewHistory = async (lead: QueueLead) => {
        setSelectedLead(lead);
        setIsHistoryOpen(true);
        setLoadingHistory(true);
        try {
            let messages = await chatwootService.getMessages(lead.id);
            if (!messages || messages.length === 0) {
                messages = await SupabaseService.getHistoricalMessages(lead.id);
            }
            if ((!messages || messages.length === 0) && getLastMessage(lead)) {
                messages = [getLastMessage(lead)];
            }
            setHistoryMessages(getDisplayMessages(messages || []));
        } catch (historyError) {
            console.error("Error fetching history:", historyError);
            toast.error("No se pudo cargar el historial");
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleOpenTagChange = (lead: QueueLead) => {
        setSelectedLead(lead);
        setNewTag("");
        setIsTagDialogOpen(true);
    };

    const handleConfirmTagChange = () => {
        if (!newTag) return;
        setIsTagConfirmOpen(true);
    };

    const executeTagChange = async () => {
        if (!selectedLead || !newTag) return;

        try {
            await applyLeadWorkflowUpdate({
                lead: selectedLead,
                nextLabels: [newTag],
                rawPayload: {
                    action: "change_followup_status",
                    selected_label: newTag
                },
                successMessage: `Estado cambiado a: ${newTag}`
            });

            setIsTagDialogOpen(false);
            setIsTagConfirmOpen(false);
            setNewTag("");
            setSelectedLead(null);
        } catch (tagError) {
            console.error("Error changing tag:", tagError);
            toast.error("Error al cambiar la etiqueta en Chatwoot");
        }
    };

    const renderAppointmentField = (field: AttributeDefinition) => {
        const value = appointmentValues[field.key] ?? (field.valueType === "boolean" ? false : "");
        const exampleText = getAppointmentFieldExample(field);
        const commonLabel = (
            <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <label className="text-sm font-medium" htmlFor={`appointment-field-${field.key}`}>
                        {field.label}
                    </label>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        {getFieldTypeLabel(field)}
                    </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground">
                    {field.key}
                    {field.description ? ` · ${field.description}` : ""}
                    {field.regexCue ? ` · ${field.regexCue}` : ""}
                </div>
                {exampleText && (
                    <div className="text-[11px] text-violet-700">
                        {exampleText}
                    </div>
                )}
            </div>
        );

        if (field.options.length > 0) {
            return (
                <div key={field.key} className="space-y-2">
                    {commonLabel}
                    <Select
                        value={String(value || "")}
                        onValueChange={(nextValue) => handleAppointmentValueChange(field.key, nextValue)}
                    >
                        <SelectTrigger id={`appointment-field-${field.key}`}>
                            <SelectValue placeholder={`Selecciona ${field.label.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                            {field.options.map((option) => (
                                <SelectItem key={`${field.key}-${option}`} value={option}>
                                    {option}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            );
        }

        if (field.valueType === "date") {
            return (
                <div key={field.key} className="space-y-2">
                    {commonLabel}
                    <div className="relative">
                        <CalendarDays className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                            id={`appointment-field-${field.key}`}
                            type="date"
                            className="pl-9"
                            value={String(value || "")}
                            onChange={(event) => handleAppointmentValueChange(field.key, event.target.value)}
                        />
                    </div>
                </div>
            );
        }

        if (field.valueType === "boolean") {
            return (
                <div key={field.key} className="space-y-3 rounded-xl border bg-muted/20 p-4">
                    {commonLabel}
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id={`appointment-field-${field.key}`}
                            checked={Boolean(value)}
                            onCheckedChange={(checked) => handleAppointmentValueChange(field.key, checked === true)}
                        />
                        <Label htmlFor={`appointment-field-${field.key}`} className="text-sm">
                            Activado
                        </Label>
                    </div>
                </div>
            );
        }

        if (field.valueType === "textarea") {
            return (
                <div key={field.key} className="space-y-2">
                    {commonLabel}
                    <Textarea
                        id={`appointment-field-${field.key}`}
                        value={String(value)}
                        onChange={(event) => handleAppointmentValueChange(field.key, event.target.value)}
                        placeholder={exampleText || `Ingresa ${field.label.toLowerCase()}`}
                    />
                </div>
            );
        }

        return (
            <div key={field.key} className="space-y-2">
                {commonLabel}
                <Input
                    id={`appointment-field-${field.key}`}
                    type={field.valueType === "number" ? "number" : "text"}
                    step={field.valueType === "number" ? "any" : undefined}
                    value={String(value || "")}
                    onChange={(event) => handleAppointmentValueChange(field.key, event.target.value)}
                    placeholder={exampleText || `Ingresa ${field.label.toLowerCase()}`}
                />
            </div>
        );
    };

    const renderQueueTable = ({
        title,
        description,
        configuredTags,
        leads,
        primaryActionLabel,
        primaryActionIcon,
        primaryActionClassName,
        onPrimaryAction,
        searchValue,
        onSearchChange
    }: {
        title: string;
        description: string;
        configuredTags: string[];
        leads: QueueLead[];
        primaryActionLabel: string;
        primaryActionIcon: typeof DollarSign;
        primaryActionClassName: string;
        onPrimaryAction: (lead: QueueLead) => void;
        searchValue: string;
        onSearchChange: (value: string) => void;
    }) => (
        <Card className="border-primary/20 shadow-sm">
            <CardHeader className="pb-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <ListTodo className="h-6 w-6 text-primary" />
                            {title}
                        </CardTitle>
                        <CardDescription className="mt-2 space-y-2">
                            <span className="block">{description}</span>
                            <span className="flex flex-wrap items-center gap-2">
                                {configuredTags.length > 0 ? (
                                    configuredTags.map((label) => (
                                        <Badge key={`${title}-${label}`} variant="outline">
                                            {label}
                                        </Badge>
                                    ))
                                ) : (
                                    <Badge variant="outline">Sin etiquetas configuradas</Badge>
                                )}
                            </span>
                        </CardDescription>
                    </div>
                    <div className="flex flex-col gap-3 items-end w-full lg:w-auto">
                        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground w-fit">
                            {leads.length} lead{leads.length === 1 ? "" : "s"} filtrados
                        </div>
                        <div className="relative w-full sm:w-64 lg:w-80">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                className="pl-9 h-9 text-sm"
                                placeholder={`Buscar en ${title.toLowerCase()}...`}
                                value={searchValue}
                                onChange={(e) => onSearchChange(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="relative overflow-x-auto border rounded-xl overflow-hidden">
                    <table className="w-full min-w-[1180px] text-sm text-left">
                        <thead className="text-[10px] text-muted-foreground uppercase bg-muted/30 border-b font-bold tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Nombre del lead</th>
                                <th className="px-6 py-4">Canal</th>
                                <th className="px-6 py-4">Numero</th>
                                <th className="px-6 py-4">Historial de mensajes</th>
                                <th className="px-6 py-4">URL</th>
                                <th className="px-6 py-4">Cambiar estado</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-muted/20">
                            {leads.map((lead: QueueLead) => {
                                const displayName = getLeadName(lead);
                                const channelDisplay = getChannelName(lead);
                                const phoneDisplay = getLeadPhone({ ...lead, channel: channelDisplay }, channelDisplay);
                                const lastMessage = getMessagePreview(lead);
                                const lastMessageDate = formatDateTime(getMessageTimestamp(lead));
                                const externalUrl = getLeadExternalUrl(lead, channelDisplay);
                                const ActionIcon = primaryActionIcon;

                                return (
                                    <tr key={`${title}-${lead.id}`} className="bg-background hover:bg-muted/10 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs uppercase">
                                                    {getInitials(displayName)}
                                                </div>
                                                <div className="flex min-w-0 flex-col">
                                                    <span className="font-semibold text-foreground truncate">{displayName}</span>
                                                    <span className="text-[10px] text-muted-foreground">ID {lead.id}</span>
                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                        <UserCircle className="w-3 h-3" />
                                                        {lead.owner}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <Badge variant="secondary" className="px-2 py-0 text-[10px] uppercase font-bold">
                                                {channelDisplay}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col text-xs gap-1">
                                                <span className="flex items-center gap-1.5 text-muted-foreground font-medium italic">
                                                    <Phone className="w-3 h-3" />
                                                    {phoneDisplay || "Sin numero"}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                type="button"
                                                onClick={() => handleViewHistory(lead)}
                                                className="flex max-w-[300px] flex-col text-left hover:text-primary"
                                            >
                                                <span className="text-xs truncate text-foreground font-medium">
                                                    {lastMessage}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                                                    <Clock className="w-3 h-3" />
                                                    {lastMessageDate}
                                                </span>
                                                <span className="text-[10px] text-primary mt-1">Ver historial</span>
                                            </button>
                                        </td>
                                        <td className="px-6 py-4">
                                            {externalUrl ? (
                                                <a href={externalUrl} target="_blank" rel="noreferrer">
                                                    <Button size="sm" variant="outline" className="h-8 gap-2 text-xs">
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                        Abrir URL
                                                    </Button>
                                                </a>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">Sin URL</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 gap-2 text-xs border-primary/30 text-primary hover:bg-primary/5"
                                                onClick={() => handleOpenTagChange(lead)}
                                            >
                                                <RefreshCw className="h-3.5 w-3.5" />
                                                Cambiar estado
                                            </Button>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className={`h-8 gap-2 text-xs ${primaryActionClassName}`}
                                                    onClick={() => onPrimaryAction(lead)}
                                                >
                                                    <ActionIcon className="h-3.5 w-3.5" />
                                                    {primaryActionLabel}
                                                </Button>
                                                <a href={getChatwootUrl(lead.id)} target="_blank" rel="noreferrer">
                                                    <Button size="sm" variant="ghost" className="h-8 gap-2 px-2 text-xs text-muted-foreground hover:text-primary">
                                                        <ExternalLink className="h-4 w-4" />
                                                        Chatwoot
                                                    </Button>
                                                </a>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {leads.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-2 opacity-40">
                                            <CheckCircle2 className="h-12 w-12 text-muted-foreground" />
                                            <span className="text-sm italic font-medium">{getEmptyQueueMessage(title, configuredTags)}</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-96 text-red-500">
                Error: {error}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-card p-4 rounded-xl border shadow-sm">
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    <ChannelSelector
                        selectedInboxes={globalFilters.selectedInboxes || []}
                        onChange={handleQueueInboxesChange}
                    />
                    <DateRangePicker
                        value={{ from: globalFilters.startDate, to: globalFilters.endDate }}
                        onChange={handleQueueDateRangeChange}
                    />
                </div>

                <div className="flex items-center gap-2 w-full lg:w-auto lg:ml-auto justify-end">
                    <ExportToExcel />
                    <Button variant="outline" size="icon" onClick={refetch} title="Actualizar datos">
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {role === 'admin' && (
                <Collapsible open={isHumanConfigOpen} onOpenChange={setIsHumanConfigOpen}>
                    <Card className="border-primary/20 shadow-sm">
                        <CardHeader className="pb-4">
                            <CollapsibleTrigger asChild>
                                <button
                                    type="button"
                                    className="w-full text-left"
                                    aria-label={isHumanConfigOpen ? "Ocultar configuracion del flujo humano" : "Abrir configuracion del flujo humano"}
                                >
                                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                        <div>
                                            <CardTitle className="flex items-center gap-2 text-xl">
                                                <Settings2 className="h-6 w-6 text-primary" />
                                                Configurar flujo humano
                                            </CardTitle>
                                            <CardDescription className="mt-2">
                                                Define qué etiquetas entran a cada cola y qué contact attributes se pedirán al marcar una cita agendada humana.
                                            </CardDescription>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                                            <Badge variant="outline">{humanConfig.humanFollowupQueueTags.length} etiquetas en seguimiento</Badge>
                                            <Badge variant="outline">{humanConfig.humanSalesQueueTags.length} etiquetas en citas agendadas</Badge>
                                            <Badge variant="outline">{humanConfig.humanAppointmentFieldKeys.length} campos para cita</Badge>
                                            <Badge variant="secondary" className="gap-1.5 px-3 py-1">
                                                {isHumanConfigOpen ? (
                                                    <ChevronUp className="h-3.5 w-3.5" />
                                                ) : (
                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                )}
                                                {isHumanConfigOpen ? "Ocultar" : "Abrir"}
                                            </Badge>
                                        </div>
                                    </div>
                                </button>
                            </CollapsibleTrigger>
                        </CardHeader>
                        <CollapsibleContent>
                            <CardContent className="space-y-5">
                                <div className="grid gap-4 xl:grid-cols-2">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Etiqueta destino de cita humana</Label>
                                            <Select
                                                value={humanConfig.humanAppointmentTargetLabel}
                                                onValueChange={(value) => setHumanConfig((prev) => ({ ...prev, humanAppointmentTargetLabel: value }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecciona etiqueta" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {mergedLabels.map((label) => (
                                                        <SelectItem key={`appointment-target-${label}`} value={label}>
                                                            {label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Etiqueta destino de venta</Label>
                                            <Select
                                                value={humanConfig.humanSaleTargetLabel}
                                                onValueChange={(value) => setHumanConfig((prev) => ({ ...prev, humanSaleTargetLabel: value }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecciona etiqueta" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {mergedLabels.map((label) => (
                                                        <SelectItem key={`sale-target-${label}`} value={label}>
                                                            {label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                                        <p className="font-semibold text-foreground">Resumen activo</p>
                                        <div className="mt-3 space-y-2 text-muted-foreground">
                                            <p>
                                                Seguimiento humano:{" "}
                                                <span className="font-medium text-foreground">
                                                    {humanConfig.humanFollowupQueueTags.join(", ") || "Sin etiquetas"}
                                                </span>
                                            </p>
                                            <p>
                                                Cita humana destino:{" "}
                                                <span className="font-medium text-foreground">
                                                    {humanConfig.humanAppointmentTargetLabel || "Sin configurar"}
                                                </span>
                                            </p>
                                            <p>
                                                Cola de ventas:{" "}
                                                <span className="font-medium text-foreground">
                                                    {humanConfig.humanSalesQueueTags.join(", ") || "Sin etiquetas"}
                                                </span>
                                            </p>
                                            <p>
                                                Venta destino:{" "}
                                                <span className="font-medium text-foreground">
                                                    {humanConfig.humanSaleTargetLabel || "Sin configurar"}
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <Accordion type="multiple" className="w-full rounded-xl border px-4">
                                    <AccordionItem value="followup-tags">
                                        <AccordionTrigger className="text-sm">
                                            Etiquetas que entran en Cola de Trabajo Diaria
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <ScrollArea className="h-[220px] rounded-lg border p-4">
                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    {mergedLabels.map((label) => (
                                                        <div key={`followup-label-${label}`} className="flex items-center space-x-2">
                                                            <Checkbox
                                                                id={`followup-label-${label}`}
                                                                checked={humanConfig.humanFollowupQueueTags.includes(label)}
                                                                onCheckedChange={() => updateHumanConfigList("humanFollowupQueueTags", label)}
                                                            />
                                                            <Label htmlFor={`followup-label-${label}`} className="text-sm font-medium">
                                                                {label}
                                                            </Label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                        </AccordionContent>
                                    </AccordionItem>

                                    <AccordionItem value="sales-tags">
                                        <AccordionTrigger className="text-sm">
                                            Etiquetas que entran en Citas Agendadas
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <ScrollArea className="h-[220px] rounded-lg border p-4">
                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    {mergedLabels.map((label) => (
                                                        <div key={`sales-label-${label}`} className="flex items-center space-x-2">
                                                            <Checkbox
                                                                id={`sales-label-${label}`}
                                                                checked={humanConfig.humanSalesQueueTags.includes(label)}
                                                                onCheckedChange={() => updateHumanConfigList("humanSalesQueueTags", label)}
                                                            />
                                                            <Label htmlFor={`sales-label-${label}`} className="text-sm font-medium">
                                                                {label}
                                                            </Label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                        </AccordionContent>
                                    </AccordionItem>

                                    <AccordionItem value="appointment-fields">
                                        <AccordionTrigger className="text-sm">
                                            Campos que se pedirán al marcar Cita agendada
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            {loadingAttributeDefinitions ? (
                                                <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Cargando contact attributes desde Chatwoot...
                                                </div>
                                            ) : attributeDefinitions.length === 0 ? (
                                                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                                                    No se detectaron contact attributes disponibles en Chatwoot ni en Supabase.
                                                </div>
                                            ) : (
                                                <ScrollArea className="h-[260px] rounded-lg border p-4">
                                                    <div className="grid gap-3 sm:grid-cols-2">
                                                        {attributeDefinitions.map((definition) => (
                                                            <div key={definition.key} className="flex items-start space-x-2">
                                                                <Checkbox
                                                                    id={`appointment-field-${definition.key}`}
                                                                    checked={humanConfig.humanAppointmentFieldKeys.includes(definition.key)}
                                                                    onCheckedChange={() => updateHumanConfigList("humanAppointmentFieldKeys", definition.key)}
                                                                />
                                                                <Label htmlFor={`appointment-field-${definition.key}`} className="text-sm font-medium leading-tight">
                                                                    <span className="flex flex-wrap items-center gap-2">
                                                                        <span>{definition.label}</span>
                                                                        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                                                                            {getFieldTypeLabel(definition)}
                                                                        </Badge>
                                                                    </span>
                                                                    <span className="block text-[11px] text-muted-foreground">{definition.key}</span>
                                                                    {definition.description && (
                                                                        <span className="block text-[11px] text-muted-foreground">
                                                                            {definition.description}
                                                                        </span>
                                                                    )}
                                                                </Label>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            )}
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>

                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
                                    <p>
                                        Si no dejas campos configurados para cita agendada, el boton de la cola mostrará un aviso para configurar primero el flujo.
                                    </p>
                                    <Button
                                        onClick={saveHumanConfig}
                                        disabled={!hasHumanConfigChanges}
                                        className="sm:w-auto"
                                    >
                                        Guardar configuracion
                                    </Button>
                                </div>
                            </CardContent>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>
            )}



            {renderQueueTable({
                title: "Cola de Trabajo Diaria",
                description: "Leads que entran al seguimiento humano y deben pasar a cita agendada humana.",
                configuredTags: humanFollowupQueueTags,
                leads: followUpQueue,
                primaryActionLabel: "Cita agendada",
                primaryActionIcon: CalendarDays,
                primaryActionClassName: "border-violet-300 text-violet-700 hover:bg-violet-50",
                onPrimaryAction: openAppointmentDialog,
                searchValue: followUpSearch,
                onSearchChange: setFollowUpSearch
            })}

            {renderQueueTable({
                title: "Citas Agendadas",
                description: "Leads que ya estan en etapa de cita y desde aqui pueden confirmarse como venta exitosa.",
                configuredTags: humanSalesQueueTags,
                leads: scheduledAppointmentsQueue,
                primaryActionLabel: "Venta exitosa",
                primaryActionIcon: DollarSign,
                primaryActionClassName: "border-emerald-300 text-emerald-700 hover:bg-emerald-50",
                onPrimaryAction: openOperationDialog,
                searchValue: scheduledSearch,
                onSearchChange: setScheduledSearch
            })}

            <Card className="border-primary/20 shadow-sm max-w-4xl mx-auto w-full">
                <CardHeader>
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-xl">
                                <FileSpreadsheet className="h-6 w-6 text-primary" />
                                Reporte de ventas exitosas
                            </CardTitle>
                            <CardDescription>
                                Filtra y exporta las ventas y operaciones que han sido marcadas como exitosas.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg border bg-primary/10 px-3 py-2 text-sm text-primary">
                            <CheckCircle2 className="h-4 w-4" />
                            {salesRows.length} ventas filtradas - {money(salesTotal)}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Desde</label>
                            <Input type="date" value={salesStartDate} onChange={(e) => setSalesStartDate(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Hasta</label>
                            <Input type="date" value={salesEndDate} onChange={(e) => setSalesEndDate(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Buscar en ventas</label>
                        <Input
                            placeholder="Nombre, telefono, ID o canal"
                            value={salesSearch}
                            onChange={(e) => setSalesSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 gap-2 border-primary text-primary hover:bg-primary/5" onClick={exportSalesReport}>
                            <FileSpreadsheet className="h-4 w-4" />
                            Exportar Excel completo
                        </Button>
                        {role === 'admin' && (
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="outline" className="gap-2 border-primary text-primary hover:bg-primary/5" title="Configurar Columnas">
                                        <Settings2 className="h-4 w-4" />
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-3xl">
                                    <DialogHeader>
                                        <DialogTitle className="flex items-center gap-2">
                                            <FileSpreadsheet className="w-5 h-5 text-primary" />
                                            Configuración de Columnas Excel
                                        </DialogTitle>
                                        <DialogDescription>
                                            Selecciona qué campos se incluirán en la exportación de ventas.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-6 pt-4 max-h-[60vh] overflow-y-auto pr-2">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-4">
                                                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Campos Base</h3>
                                                <div className="space-y-2">
                                                    {["ID", "Nombre", "Telefono", "Canal", "Etiquetas", "Correo", "Enlace Chatwoot", "Fecha Ingreso", "Ultima Interaccion"].map(field => (
                                                        <div key={`ventas-field-${field}`} className="flex items-center space-x-2">
                                                            <Checkbox
                                                                id={`ventas-field-${field}`}
                                                                checked={tagSettings?.excelExportFields?.includes(field) || false}
                                                                onCheckedChange={(checked) => {
                                                                    const current = tagSettings?.excelExportFields || [];
                                                                    const next = checked
                                                                        ? [...current, field]
                                                                        : current.filter(f => f !== field);
                                                                    updateTagSettings({ ...(tagSettings || DEFAULT_TAG_CONFIG), excelExportFields: next });
                                                                }}
                                                            />
                                                            <Label htmlFor={`ventas-field-${field}`}>{field}</Label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Métricas Operativas</h3>
                                                <div className="space-y-2">
                                                    {["Monto", "Fecha Monto", "Agencia", "Check-in", "Check-out", "Campana", "Ciudad", "Responsable", "URL Red Social"].map(field => (
                                                        <div key={`ventas-field-${field}`} className="flex items-center space-x-2">
                                                            <Checkbox
                                                                id={`ventas-field-${field}`}
                                                                checked={tagSettings?.excelExportFields?.includes(field) || false}
                                                                onCheckedChange={(checked) => {
                                                                    const current = tagSettings?.excelExportFields || [];
                                                                    const next = checked
                                                                        ? [...current, field]
                                                                        : current.filter(f => f !== field);
                                                                    updateTagSettings({ ...(tagSettings || DEFAULT_TAG_CONFIG), excelExportFields: next });
                                                                }}
                                                            />
                                                            <Label htmlFor={`ventas-field-${field}`}>{field}</Label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Atributos Técnicos (IDs)</h3>
                                                <div className="space-y-2">
                                                    {["ID Contacto", "ID Inbox", "ID Cuenta", "Origen Dato"].map(field => (
                                                        <div key={`ventas-field-${field}`} className="flex items-center space-x-2">
                                                            <Checkbox
                                                                id={`ventas-field-${field}`}
                                                                checked={tagSettings?.excelExportFields?.includes(field) || false}
                                                                onCheckedChange={(checked) => {
                                                                    const current = tagSettings?.excelExportFields || [];
                                                                    const next = checked
                                                                        ? [...current, field]
                                                                        : current.filter(f => f !== field);
                                                                    updateTagSettings({ ...(tagSettings || DEFAULT_TAG_CONFIG), excelExportFields: next });
                                                                }}
                                                            />
                                                            <Label htmlFor={`ventas-field-${field}`}>{field}</Label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <DialogFooter className="mt-4">
                                        <DialogTrigger asChild>
                                            <Button variant="outline">Cerrar</Button>
                                        </DialogTrigger>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isAppointmentDialogOpen} onOpenChange={setIsAppointmentDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CalendarDays className="h-5 w-5 text-violet-600" />
                            Marcar cita agendada
                        </DialogTitle>
                        <DialogDescription>
                            Completa los campos configurados para guardar los datos del cliente en Chatwoot y cambiar la etiqueta a {humanAppointmentTargetLabel}.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                            <div className="font-semibold">{appointmentLead ? getLeadName(appointmentLead) : ""}</div>
                            <div className="text-xs text-muted-foreground">
                                ID {appointmentLead?.id} - {appointmentLead ? getLeadPhone(appointmentLead, getChannelName(appointmentLead)) : ""} - {appointmentLead ? getChannelName(appointmentLead) : ""}
                            </div>
                        </div>

                        <ScrollArea className="max-h-[380px] pr-4">
                            <div className="space-y-4">
                                {configuredAppointmentFields.map(renderAppointmentField)}
                            </div>
                        </ScrollArea>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAppointmentDialogOpen(false)}>Cancelar</Button>
                        <Button className="bg-violet-600 hover:bg-violet-700" onClick={handleAppointmentFormConfirm}>
                            Guardar cita
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isAppointmentConfirmOpen} onOpenChange={setIsAppointmentConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Confirmacion final
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-4 pt-2">
                            <p>
                                Vas a guardar la cita agendada de <strong>{appointmentLead ? getLeadName(appointmentLead) : ""}</strong> y cambiar la etiqueta a{" "}
                                <strong>{humanAppointmentTargetLabel}</strong>. Estas seguro?
                            </p>
                            <div className="rounded-lg border bg-amber-50 p-3 text-sm text-amber-900">
                                <p className="font-semibold mb-2">Campos que se guardarán en Chatwoot</p>
                                <div className="space-y-1">
                                    {configuredAppointmentFields.map((field) => (
                                        <div key={`confirm-appointment-${field.key}`}>
                                            <span className="font-medium">{field.label}:</span>{" "}
                                            <span>{formatAppointmentFieldValue(field, appointmentValues[field.key])}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <p>
                                El lead saldrá de la cola actual y quedará con la etiqueta <strong>{humanAppointmentTargetLabel}</strong>.
                            </p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isSavingAppointment}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={executeAppointmentConfirm}
                            disabled={isSavingAppointment}
                            className="bg-violet-600 hover:bg-violet-700"
                        >
                            {isSavingAppointment ? "Guardando..." : "Si, guardar cita"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={isOperationDialogOpen} onOpenChange={setIsOperationDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-emerald-600" />
                            Confirmar operacion
                        </DialogTitle>
                        <DialogDescription>
                            Ingresa el monto y la fecha de la operacion para marcar este lead como {humanSaleTargetLabel}.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                            <div className="font-semibold">{operationLead ? getLeadName(operationLead) : ""}</div>
                            <div className="text-xs text-muted-foreground">
                                ID {operationLead?.id} - {operationLead ? getLeadPhone(operationLead, getChannelName(operationLead)) : ""} - {operationLead ? getChannelName(operationLead) : ""}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Monto operacion</label>
                            <Input
                                value={operationAmount}
                                onChange={(e) => setOperationAmount(e.target.value)}
                                placeholder="Ej: 15000"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Fecha monto operacion</label>
                            <div className="relative">
                                <CalendarDays className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    className="pl-9"
                                    type="date"
                                    value={operationDate}
                                    onChange={(e) => setOperationDate(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsOperationDialogOpen(false)}>Cancelar</Button>
                        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleOperationFormConfirm}>
                            Confirmar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isOperationConfirmOpen} onOpenChange={setIsOperationConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Confirmacion final
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-4 pt-2">
                            <p>
                                Vas a confirmar la venta de <strong>{operationLead ? getLeadName(operationLead) : ""}</strong> por{" "}
                                <strong>{money(parseAmount(operationAmount))}</strong> con fecha <strong>{operationDate}</strong>. Estas seguro?
                            </p>
                            <p>
                                Al confirmar se guardarán <strong>monto_operacion</strong> y <strong>fecha_monto_operacion</strong> en Chatwoot y la conversacion quedará con la etiqueta <strong>{humanSaleTargetLabel}</strong>.
                            </p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isSavingOperation}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={executeOperationConfirm}
                            disabled={isSavingOperation}
                            className="bg-emerald-600 hover:bg-emerald-700"
                        >
                            {isSavingOperation ? "Guardando..." : "Si, confirmar venta"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <DialogContent className="max-w-2xl sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5 text-primary" />
                            Historial de: {selectedLead ? getLeadName(selectedLead) : ""}
                        </DialogTitle>
                        <DialogDescription>
                            Mensajes disponibles del lead. Si necesitas responder o revisar mas contexto, abre la conversacion original.
                        </DialogDescription>
                    </DialogHeader>

                    <ScrollArea className="h-[500px] mt-4 pr-4">
                        {loadingHistory ? (
                            <div className="flex flex-col items-center justify-center h-full">
                                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                                <p className="text-sm text-muted-foreground">Cargando mensajes...</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {historyMessages.length === 0 && (
                                    <div className="py-16 text-center text-sm text-muted-foreground">
                                        No hay mensajes disponibles para este lead.
                                    </div>
                                )}
                                {historyMessages.map((msg: any) => {
                                    const role = getConversationMessageRole(msg);
                                    const isOutgoing = role === "outgoing";
                                    return (
                                        <div key={msg.id} className={`flex ${isOutgoing ? "justify-end" : "justify-start"}`}>
                                            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${isOutgoing
                                                ? "bg-primary text-primary-foreground rounded-tr-none"
                                                : "bg-muted text-foreground rounded-tl-none"
                                                }`}>
                                                <div className="font-bold text-[10px] mb-1 opacity-70 uppercase">
                                                    {isOutgoing ? "Agente / Bot" : "Cliente"}
                                                </div>
                                                {getMessageText(msg)}
                                                <div className="text-[9px] mt-1 text-right opacity-60">
                                                    {formatDateTime(msg.created_at)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </ScrollArea>

                    <DialogFooter className="mt-4 border-t pt-4">
                        <Button variant="outline" onClick={() => setIsHistoryOpen(false)}>Cerrar</Button>
                        <a
                            href={selectedLead ? getChatwootUrl(selectedLead.id) : "#"}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <Button className="gap-2">
                                <ExternalLink className="h-4 w-4" />
                                Ver en Chatwoot
                            </Button>
                        </a>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Cambiar estado</DialogTitle>
                        <DialogDescription>
                            Selecciona una etiqueta. Las etiquetas actuales se borrarán y este lead quedará solo con la etiqueta elegida.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-6 space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Nueva etiqueta</label>
                            <Select onValueChange={setNewTag} value={newTag}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar etiqueta..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {mergedLabels.map((label) => (
                                        <SelectItem key={`manual-label-${label}`} value={label}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsTagDialogOpen(false)}>Cancelar</Button>
                        <Button
                            disabled={!newTag}
                            onClick={handleConfirmTagChange}
                            className="bg-amber-600 hover:bg-amber-700"
                        >
                            Cambiar estado
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isTagConfirmOpen} onOpenChange={setIsTagConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Confirmar cambio de estado
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-4 pt-2">
                            <p>
                                Vas a reemplazar todas las etiquetas actuales de <strong>{selectedLead ? getLeadName(selectedLead) : ""}</strong> por{" "}
                                <Badge variant="secondary">{newTag}</Badge>. Estas seguro?
                            </p>
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-sm">
                                <p className="font-bold mb-1">Recuerda</p>
                                <p>Si cambias a una etiqueta de cita o agendamiento, revisa antes que la informacion necesaria del cliente quede actualizada en sus atributos.</p>
                                <p className="mt-2">Despues del cambio, este lead puede desaparecer de esta vista si ya no coincide con las etiquetas configuradas para la tabla actual.</p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={executeTagChange} className="bg-amber-600 hover:bg-amber-700">
                            Si, confirmar cambio
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default LeadActionQueue;
