import { supabase } from "@/lib/supabase";
import type { CommercialAuditEvent, CommercialSaleStatus } from "@/lib/commercialFacts";

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

const mapAuditRow = (row: any): CommercialAuditEvent => ({
    id: row.id || row.event_key,
    chatwoot_conversation_id: Number(row.chatwoot_conversation_id),
    status: normalizeStatus(row.status || row.business_impact),
    event_type: row.event_type,
    field_name: row.field_name || row.attribute_key,
    attribute_key: row.attribute_key,
    previous_value: row.previous_value ?? row.old_value,
    current_value: row.current_value ?? row.new_value,
    historical_value: row.historical_value,
    changed_at: row.changed_at || row.occurred_at,
    detected_at: row.detected_at,
    source: row.source,
    change_source: row.change_source || row.event_source,
    business_impact: row.business_impact,
    raw_payload: row.raw_payload || {},
});

export const CommercialAuditService = {
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
