import type { ResolvedConversation, TagConfig } from "@/context/DashboardDataContext";
import { formatBusinessLabel } from "@/lib/displayCopy";
import { cleanText, getAttrs, getLeadName } from "@/lib/leadDisplay";

export type CommercialSaleStatus =
    | "venta_actual"
    | "monto_no_contable"
    | "venta_historica_no_vigente"
    | "monto_eliminado"
    | "sin_monto";

export interface CommercialAuditEvent {
    id?: number | string;
    chatwoot_conversation_id: number;
    status?: CommercialSaleStatus;
    event_type?: string;
    field_name?: string;
    attribute_key?: string;
    previous_value?: unknown;
    current_value?: unknown;
    historical_value?: unknown;
    changed_at?: string | null;
    detected_at?: string | null;
    source?: string;
    change_source?: string;
    business_impact?: string;
    raw_payload?: Record<string, unknown>;
}

export interface CommercialAuditSummary {
    currentSalesCount: number;
    currentSalesAmount: number;
    nonAccountableAmountCount: number;
    nonAccountableAmountTotal: number;
    historicalSalesNotCurrentCount: number;
    removedAmountCount: number;
    auditRows: number;
}

const normalizeLabel = (value: unknown) => cleanText(value).toLowerCase();

const normalizeLabels = (labels: unknown): string[] =>
    Array.isArray(labels)
        ? Array.from(new Set(labels.map((label) => cleanText(label)).filter(Boolean)))
        : [];

export const parseAmount = (value: unknown) => {
    const raw = cleanText(value);
    if (!raw) return 0;
    const normalized = raw.includes(",") && !raw.includes(".")
        ? raw.replace(",", ".")
        : raw.replace(/,/g, "");
    const parsed = Number.parseFloat(normalized.replace(/[^0-9.-]/g, ""));
    return Number.isNaN(parsed) ? 0 : parsed;
};

export const getSaleLabels = (tagSettings?: Partial<TagConfig>) =>
    Array.from(new Set([
        ...(tagSettings?.saleTags || []),
        tagSettings?.humanSaleTargetLabel || "venta_exitosa",
        "venta_exitosa",
    ].map((label) => cleanText(label)).filter(Boolean)));

export const getCommercialLabels = (conversation: Partial<ResolvedConversation> | any) =>
    normalizeLabels(
        conversation?.resolvedLabels?.length
            ? conversation.resolvedLabels
            : conversation?.labels,
    );

export const hasCurrentSaleLabel = (
    conversation: Partial<ResolvedConversation> | any,
    tagSettings?: Partial<TagConfig>,
) => {
    const labels = new Set(getCommercialLabels(conversation).map(normalizeLabel));
    return getSaleLabels(tagSettings).some((label) => labels.has(normalizeLabel(label)));
};

export const getCurrentAmount = (conversation: Partial<ResolvedConversation> | any) =>
    parseAmount(getAttrs(conversation).monto_operacion);

export const isCurrentSale = (
    conversation: Partial<ResolvedConversation> | any,
    tagSettings?: Partial<TagConfig>,
) => hasCurrentSaleLabel(conversation, tagSettings) && getCurrentAmount(conversation) > 0;

export const getCurrentSaleAmount = (
    conversation: Partial<ResolvedConversation> | any,
    tagSettings?: Partial<TagConfig>,
) => isCurrentSale(conversation, tagSettings) ? getCurrentAmount(conversation) : 0;

const defaultParseDate = (value: unknown) => {
    if (!value) return new Date(0);
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return new Date(numeric < 10000000000 ? numeric * 1000 : numeric);
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
};

export const getCommercialSaleDate = (
    conversation: Partial<ResolvedConversation> | any,
    parseDate: (value: unknown) => Date = defaultParseDate,
) => {
    const attrs = getAttrs(conversation);
    return parseDate(attrs.fecha_monto_operacion || conversation?.created_at || conversation?.timestamp);
};

export const getSaleAccountingStatus = (
    conversation: Partial<ResolvedConversation> | any,
    tagSettings?: Partial<TagConfig>,
): CommercialSaleStatus => {
    const amount = getCurrentAmount(conversation);
    if (hasCurrentSaleLabel(conversation, tagSettings) && amount > 0) return "venta_actual";
    if (amount > 0) return "monto_no_contable";
    return "sin_monto";
};

export const getAmountAccountingStatus = getSaleAccountingStatus;

const statusLabel: Record<CommercialSaleStatus, string> = {
    venta_actual: "Venta registrada",
    monto_no_contable: "No suma a ventas",
    venta_historica_no_vigente: "Venta retirada",
    monto_eliminado: "Monto eliminado",
    sin_monto: "Sin monto",
};

const statusReason: Record<CommercialSaleStatus, string> = {
    venta_actual: "Está marcada como venta y tiene monto registrado.",
    monto_no_contable: "Tiene monto registrado, pero no está marcada como venta.",
    venta_historica_no_vigente: "Antes estaba marcada como venta y luego se retiró. Por eso no suma en ventas.",
    monto_eliminado: "Antes tenía monto y luego quedó vacío.",
    sin_monto: "No tiene monto registrado.",
};

const valueText = (value: unknown) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return cleanText(value);
};

const eventFieldName = (event: CommercialAuditEvent) =>
    cleanText(event.field_name || event.attribute_key || event.raw_payload?.field_name || event.raw_payload?.attribute_key);

const isBlankAuditValue = (value: unknown) => {
    const text = valueText(value).trim().toLowerCase();
    return !text || text === "null" || text === "\"\"" || text === "[]" || text === "{}";
};

const hasSaleSignal = (value: unknown) => {
    const text = valueText(value).toLowerCase();
    return text.includes("venta_exitosa") || text.includes("\"venta\"") || text.includes(" venta") || text === "venta";
};

type AuditDisplayInfo = {
    status: CommercialSaleStatus;
    situation: string;
    explanation: string;
};

const getAuditEventInfo = (
    event: CommercialAuditEvent,
    conversation?: ResolvedConversation,
    tagSettings?: Partial<TagConfig>,
): AuditDisplayInfo | null => {
    const signature = [
        event.event_type,
        event.business_impact,
        event.status,
        eventFieldName(event),
        event.change_source,
    ].map((value) => cleanText(value).toLowerCase()).join(" ");

    const field = eventFieldName(event).toLowerCase();
    const previousValue = event.previous_value ?? event.historical_value;
    const currentValue = event.current_value;
    const previous = valueText(previousValue);
    const current = valueText(currentValue);
    const isAmountEvent = field.includes("monto") || signature.includes("monto_operacion") || signature.includes("monto_");
    const isLabelEvent = field === "labels" || signature.includes("label") || signature.includes("etiqueta");

    if (isAmountEvent) {
        const previousAmount = parseAmount(previous);
        const currentAmount = parseAmount(current);

        if (!isBlankAuditValue(previousValue) && isBlankAuditValue(currentValue)) {
            return {
                status: "monto_eliminado",
                situation: statusLabel.monto_eliminado,
                explanation: statusReason.monto_eliminado,
            };
        }

        if (
            !isBlankAuditValue(previousValue)
            && !isBlankAuditValue(currentValue)
            && previousAmount !== currentAmount
            && (previousAmount > 0 || currentAmount > 0)
        ) {
            return {
                status: conversation && isCurrentSale(conversation, tagSettings) ? "venta_actual" : "monto_no_contable",
                situation: "Monto cambiado",
                explanation: "El monto cambió; los totales usan el valor que aparece hoy en el lead.",
            };
        }
    }

    const saleWasTouched = hasSaleSignal(previousValue) || hasSaleSignal(currentValue) || hasSaleSignal(event.historical_value);
    const saleWasRemoved = signature.includes("venta_historica")
        || signature.includes("no_vigente")
        || signature.includes("no vigente")
        || signature.includes("removed_sale")
        || (isLabelEvent && saleWasTouched && (!conversation || !isCurrentSale(conversation, tagSettings)));

    if (saleWasRemoved && (!conversation || !isCurrentSale(conversation, tagSettings))) {
        return {
            status: "venta_historica_no_vigente",
            situation: statusLabel.venta_historica_no_vigente,
            explanation: statusReason.venta_historica_no_vigente,
        };
    }

    if (signature.includes("monto_no_contable")) {
        return {
            status: "monto_no_contable",
            situation: statusLabel.monto_no_contable,
            explanation: statusReason.monto_no_contable,
        };
    }

    return null;
};

const latestAuditEventForConversation = (conversationId: number, auditEvents: CommercialAuditEvent[]) =>
    auditEvents
        .filter((event) => Number(event.chatwoot_conversation_id) === conversationId)
        .sort((a, b) =>
            new Date(b.changed_at || b.detected_at || 0).getTime()
            - new Date(a.changed_at || a.detected_at || 0).getTime()
        )[0];

export const getCommercialDetailFields = (
    conversation: ResolvedConversation,
    auditEvents: CommercialAuditEvent[] = [],
    tagSettings?: Partial<TagConfig>,
) => {
    const status = getSaleAccountingStatus(conversation, tagSettings);
    const amount = getCurrentAmount(conversation);
    const event = latestAuditEventForConversation(Number(conversation.id), auditEvents);

    return {
        "Se suma en ventas": status === "venta_actual" ? "Sí" : "No",
        "Explicación ventas": statusReason[status],
        "Monto que suma en ventas": status === "venta_actual" ? amount : 0,
        "Monto registrado": amount > 0 ? amount : "",
        "Monto anterior": event ? valueText(event.previous_value ?? event.historical_value) : "",
        "Fecha cambio comercial": event?.changed_at || event?.detected_at || "",
    };
};

const baseAuditRow = (
    conversation: ResolvedConversation | undefined,
    conversationId: number,
    status: CommercialSaleStatus,
    overrides: Record<string, unknown> = {},
) => ({
    "ID Conversacion": conversationId,
    "Nombre del Lead": conversation ? getLeadName(conversation) : "Lead no disponible en filtro actual",
    Situación: statusLabel[status],
    "Se suma en ventas": status === "venta_actual" ? "Sí" : "No",
    Explicación: statusReason[status],
    ...overrides,
});

export const buildCommercialAuditRows = (
    conversations: ResolvedConversation[],
    auditEvents: CommercialAuditEvent[] = [],
    tagSettings?: Partial<TagConfig>,
) => {
    const conversationMap = new Map(conversations.map((conversation) => [Number(conversation.id), conversation]));
    const rows: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();

    conversations.forEach((conversation) => {
        const amount = getCurrentAmount(conversation);
        if (amount <= 0 || isCurrentSale(conversation, tagSettings)) return;
        const attrs = getAttrs(conversation);
        rows.push(baseAuditRow(conversation, Number(conversation.id), "monto_no_contable", {
            "Monto actual": amount,
            "Monto anterior": "",
            "Monto nuevo": attrs.monto_operacion || amount,
            Campo: "Monto de la operación",
            "Fecha del cambio": attrs.fecha_monto_operacion || "",
        }));
        seen.add(`current:${conversation.id}:monto_no_contable`);
    });

    auditEvents.forEach((event) => {
        const conversationId = Number(event.chatwoot_conversation_id);
        if (!Number.isFinite(conversationId) || !conversationMap.has(conversationId)) return;
        const conversation = conversationMap.get(conversationId);
        const info = getAuditEventInfo(event, conversation, tagSettings);
        if (!info) return;
        const field = eventFieldName(event);
        const key = [
            "event",
            event.id || "",
            conversationId,
            info.situation,
            field,
            event.changed_at || event.detected_at || "",
            valueText(event.previous_value),
            valueText(event.current_value),
        ].join(":");
        if (seen.has(key)) return;
        if (info.situation === statusLabel.monto_no_contable && seen.has(`current:${conversationId}:monto_no_contable`)) return;
        seen.add(key);

        rows.push({
            "ID Conversacion": conversationId,
            "Nombre del Lead": conversation ? getLeadName(conversation) : "Lead no disponible en filtro actual",
            Situación: info.situation,
            "Se suma en ventas": conversation && isCurrentSale(conversation, tagSettings) ? "Sí" : "No",
            Explicación: info.explanation,
            "Monto actual": conversation ? getCurrentAmount(conversation) || "" : "",
            "Monto anterior": valueText(event.previous_value ?? event.historical_value),
            "Monto nuevo": valueText(event.current_value),
            Campo: field === "labels" ? "Venta" : formatBusinessLabel(field) || field || "Dato comercial",
            "Fecha del cambio": event.changed_at || event.detected_at || "",
        });
    });

    return rows.sort((a, b) =>
        cleanText(b["Fecha del cambio"]).localeCompare(cleanText(a["Fecha del cambio"]))
        || Number(b["ID Conversacion"] || 0) - Number(a["ID Conversacion"] || 0)
    );
};

export const getCommercialAuditSummary = (
    conversations: ResolvedConversation[],
    auditEvents: CommercialAuditEvent[] = [],
    tagSettings?: Partial<TagConfig>,
): CommercialAuditSummary => {
    const auditRows = buildCommercialAuditRows(conversations, auditEvents, tagSettings);
    const summary = conversations.reduce((current, conversation) => {
        const amount = getCurrentAmount(conversation);
        if (isCurrentSale(conversation, tagSettings)) {
            current.currentSalesCount += 1;
            current.currentSalesAmount += amount;
        } else if (amount > 0) {
            current.nonAccountableAmountCount += 1;
            current.nonAccountableAmountTotal += amount;
        }
        return current;
    }, {
        currentSalesCount: 0,
        currentSalesAmount: 0,
        nonAccountableAmountCount: 0,
        nonAccountableAmountTotal: 0,
        historicalSalesNotCurrentCount: 0,
        removedAmountCount: 0,
        auditRows: auditRows.length,
    });

    auditRows.forEach((row) => {
        const status = cleanText(row.Situación).toLowerCase();
        if (status.includes("retirada")) summary.historicalSalesNotCurrentCount += 1;
        if (status.includes("eliminado")) summary.removedAmountCount += 1;
    });

    return summary;
};
