import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-chatwoot-webhook-signature, x-webhook-secret",
};

const parseNumber = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isNaN(value) ? null : value;
    const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
    return Number.isNaN(parsed) ? null : parsed;
};

const compactObject = (obj: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined && value !== null && value !== ""));

const normalizeLabels = (labels: unknown): string[] => {
    if (!Array.isArray(labels)) return [];
    return Array.from(new Set(
        labels
            .map((label) => String(label || "").trim())
            .filter(Boolean),
    )).sort();
};

const labelDelta = (previousLabels: unknown, nextLabels: unknown) => {
    const previous = normalizeLabels(previousLabels);
    const next = normalizeLabels(nextLabels);
    const previousSet = new Set(previous);
    const nextSet = new Set(next);

    return {
        previous,
        next,
        added: next.filter((label) => !previousSet.has(label)),
        removed: previous.filter((label) => !nextSet.has(label)),
    };
};

const toIso = (value: unknown) => {
    if (!value) return new Date().toISOString();
    const n = Number(value);
    const date = Number.isNaN(n)
        ? new Date(String(value))
        : new Date(n < 10000000000 ? n * 1000 : n);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const firstArray = (...values: unknown[]) =>
    values.find((value) => Array.isArray(value)) as unknown[] | undefined;

const buildConversationUpsertRow = (conversation: Record<string, any>) => {
    if (!conversation?.id) return null;

    const sender = conversation.meta?.sender || conversation.contact || {};
    const contactAttrs = sender.custom_attributes || {};
    const convAttrs = conversation.custom_attributes || {};
    const attrs = { ...contactAttrs, ...convAttrs };
    const lastNonActivity = conversation.last_non_activity_message || {};

    return {
        chatwoot_conversation_id: Number(conversation.id),
        chatwoot_contact_id: sender.id || conversation.contact_id || null,
        chatwoot_account_id: conversation.account_id || null,
        chatwoot_inbox_id: conversation.inbox_id || null,
        chatwoot_team_id: conversation.team_id || null,
        assignee_id: conversation.assignee_id || null,
        uuid: conversation.uuid || null,
        status: conversation.status || null,
        priority: conversation.priority || null,
        can_reply: conversation.can_reply ?? null,
        muted: conversation.muted ?? null,
        snoozed_until: toIso(conversation.snoozed_until),
        unread_count: conversation.unread_count ?? null,
        labels: normalizeLabels(conversation.labels || []),
        business_stage_current: attrs.business_stage || null,
        additional_attributes: conversation.additional_attributes || {},
        custom_attributes: attrs,
        meta: conversation.meta || {},
        applied_sla: conversation.applied_sla || {},
        sla_events: conversation.sla_events || [],
        first_reply_created_at_chatwoot: toIso(conversation.first_reply_created_at),
        waiting_since_chatwoot: toIso(conversation.waiting_since),
        last_activity_at_chatwoot: toIso(conversation.last_activity_at || conversation.timestamp || conversation.updated_at),
        created_at_chatwoot: toIso(conversation.created_at || conversation.timestamp),
        updated_at_chatwoot: toIso(conversation.updated_at || conversation.last_activity_at || conversation.timestamp),
        last_non_activity_message_id: lastNonActivity.id || null,
        last_non_activity_message_preview: lastNonActivity.content || null,
        last_message_at: toIso(lastNonActivity.created_at || conversation.last_activity_at || conversation.timestamp),
        raw_payload: conversation,
        ...compactObject({
            nombre_completo: attrs.nombre_completo,
            fecha_visita: attrs.fecha_visita,
            hora_visita: attrs.hora_visita,
            agencia: attrs.agencia,
            celular: attrs.celular,
            correo: attrs.correo,
            campana: attrs.campana,
            ciudad: attrs.ciudad,
            edad: attrs.edad,
            canal: attrs.canal,
            agente: attrs.agente === true || attrs.agente === "true",
            score_interes: parseNumber(attrs.score_interes),
            monto_operacion: attrs.monto_operacion,
            fecha_monto_operacion: attrs.fecha_monto_operacion,
        }),
        updated_at: new Date().toISOString(),
    };
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const configuredSecret = Deno.env.get("CHATWOOT_WEBHOOK_SECRET");
        if (configuredSecret) {
            const receivedSecret =
                req.headers.get("x-webhook-secret") ||
                req.headers.get("x-chatwoot-webhook-signature") ||
                new URL(req.url).searchParams.get("secret");

            if (receivedSecret !== configuredSecret) {
                return new Response(JSON.stringify({ success: false, error: "Unauthorized webhook" }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 401,
                });
            }
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error("Missing Supabase environment variables.");
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const body = await req.json();
        const eventName = body.event || body.name || body.event_name || "conversation_label_change";

        let conversation =
            body.conversation ||
            body.current_conversation ||
            body.data?.conversation;

        // If it's a contact_updated event, we might not have a conversation object directly
        if (!conversation && (eventName === "contact_updated" || body.contact)) {
            const contact = body.contact || body.data?.contact || body;
            const contactId = contact.id;

            if (contactId) {
                // Try to find the most recent conversation for this contact to update its attributes
                const { data: latestConv } = await supabase
                    .schema("cw")
                    .from("conversations_current")
                    .select("chatwoot_conversation_id, raw_payload")
                    .eq("chatwoot_contact_id", contactId)
                    .order("last_activity_at_chatwoot", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (latestConv) {
                    conversation = {
                        ...(latestConv.raw_payload as Record<string, any>),
                        id: latestConv.chatwoot_conversation_id,
                        meta: {
                            ...(latestConv.raw_payload as Record<string, any>)?.meta,
                            sender: contact
                        }
                    };
                }
            }
        }

        const conversationId = conversation ? Number(conversation.id || body.conversation_id || body.chatwoot_conversation_id) : null;

        await supabase
            .schema("cw")
            .from("raw_ingest")
            .insert({
                source_type: "webhook",
                endpoint_name: "chatwoot-label-webhook",
                event_name: eventName,
                entity_type: conversationId ? "conversation" : "other",
                chatwoot_entity_id: conversationId,
                payload: body,
            });

        if (!conversationId) {
            return new Response(JSON.stringify({ success: true, message: "No conversation context found for this event" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            });
        }

        const { data: existingRow, error: existingError } = await supabase
            .schema("cw")
            .from("conversations_current")
            .select("labels")
            .eq("chatwoot_conversation_id", conversationId)
            .maybeSingle();

        if (existingError) throw existingError;

        const payloadPreviousLabels = firstArray(
            body.previous_labels,
            body.previous?.labels,
            body.changed_attributes?.labels?.previous_value,
            body.changed_attributes?.labels?.previous,
            body.changes?.labels?.previous,
            body.labels_before,
        );
        const payloadNextLabels = firstArray(
            conversation.labels,
            body.labels,
            body.current_labels,
            body.changed_attributes?.labels?.current_value,
            body.changed_attributes?.labels?.current,
            body.changes?.labels?.current,
            body.labels_after,
        );

        const previousLabels = payloadPreviousLabels || existingRow?.labels || [];
        const nextLabels = payloadNextLabels || (conversation ? normalizeLabels(conversation.labels) : []);
        const delta = labelDelta(previousLabels, nextLabels);

        if (delta.added.length > 0 || delta.removed.length > 0) {
            const occurredAt = toIso(body.event_created_at || body.created_at || body.updated_at || conversation?.updated_at || conversation?.timestamp);
            const eventKey = [
                "webhook",
                conversationId,
                occurredAt,
                delta.previous.join("|"),
                delta.next.join("|"),
            ].join(":");

            const { error: eventError } = await supabase
                .schema("cw")
                .from("conversation_label_events")
                .upsert({
                    chatwoot_conversation_id: conversationId,
                    previous_labels: delta.previous,
                    next_labels: delta.next,
                    added_labels: delta.added,
                    removed_labels: delta.removed,
                    event_source: "webhook",
                    occurred_at: occurredAt,
                    detected_at: new Date().toISOString(),
                    raw_payload: body,
                    event_key: eventKey,
                }, { onConflict: "event_key", ignoreDuplicates: true });

            if (eventError) throw eventError;
        }

        const conversationUpsertRow = buildConversationUpsertRow(conversation);

        if (conversationUpsertRow) {
            const { error: conversationError } = await supabase
                .schema("cw")
                .from("conversations_current")
                .upsert(conversationUpsertRow, { onConflict: "chatwoot_conversation_id" });

            if (conversationError) throw conversationError;
        }

        return new Response(JSON.stringify({
            success: true,
            conversation_id: conversationId,
            event: eventName,
            added_labels: delta.added,
            removed_labels: delta.removed,
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
        });
    }
});
