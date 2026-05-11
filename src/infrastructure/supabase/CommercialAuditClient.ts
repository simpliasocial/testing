import { asRecord } from "../../domain/common/types";
import { supabase } from "../../lib/supabase";
import type { CommercialAuditEvent, CommercialSaleStatus } from "../../lib/commercialFacts";

const normalizeStatus = (value: unknown): CommercialSaleStatus | undefined => {
    const text = String(value || "").trim();
    if ([
        "venta_actual",
        "monto_no_contable",
        "venta_historica_no_vigente",
        "monto_eliminado",
        "sin_monto",
    ].includes(text)) {
        return text as CommercialSaleStatus;
    }
    return undefined;
};

const asOptionalId = (value: unknown) =>
    typeof value === "number" || typeof value === "string" ? value : undefined;

const asOptionalString = (value: unknown) =>
    value === undefined || value === null ? undefined : String(value);

const asNullableString = (value: unknown) =>
    value === undefined || value === null ? null : String(value);

const mapAuditRow = (rowValue: unknown): CommercialAuditEvent => {
    const row = asRecord(rowValue);

    return {
        id: asOptionalId(row.id) || asOptionalId(row.event_key),
        chatwoot_conversation_id: Number(row.chatwoot_conversation_id),
        status: normalizeStatus(row.status || row.business_impact),
        event_type: asOptionalString(row.event_type),
        field_name: asOptionalString(row.field_name || row.attribute_key),
        attribute_key: asOptionalString(row.attribute_key),
        previous_value: row.previous_value ?? row.old_value,
        current_value: row.current_value ?? row.new_value,
        historical_value: row.historical_value,
        changed_at: asNullableString(row.changed_at || row.occurred_at),
        detected_at: asNullableString(row.detected_at),
        source: asOptionalString(row.source),
        change_source: asOptionalString(row.change_source || row.event_source),
        business_impact: asOptionalString(row.business_impact),
        raw_payload: asRecord(row.raw_payload),
    };
};

export const commercialAuditClient = {
    async fetchAuditEvents(limit = 5000): Promise<CommercialAuditEvent[]> {
        const { data, error } = await supabase
            .schema("cw")
            .from("commercial_audit_events")
            .select("*")
            .order("changed_at", { ascending: false })
            .limit(limit);

        if (error) {
            console.warn("[Dashboard] Could not load commercial audit events:", error);
            return [];
        }

        return (data || [])
            .map(mapAuditRow)
            .filter((event) => Number.isFinite(event.chatwoot_conversation_id));
    },
};

export const CommercialAuditService = commercialAuditClient;
