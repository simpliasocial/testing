import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-chatwoot-webhook-signature, x-webhook-secret",
};

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
        const conversation =
            body.conversation ||
            body.current_conversation ||
            body.data?.conversation ||
            body.data ||
            body;
        const conversationId = Number(conversation.id || body.conversation_id || body.chatwoot_conversation_id);

        if (!conversationId) {
            throw new Error("Webhook payload does not include a conversation id.");
        }

        await supabase
            .schema("cw")
            .from("raw_ingest")
            .insert({
                source_type: "webhook",
                endpoint_name: "chatwoot-label-webhook",
                event_name: body.event || body.name || body.event_name || "conversation_label_change",
                entity_type: "conversation",
                chatwoot_entity_id: conversationId,
                payload: body,
            });

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
        const nextLabels = payloadNextLabels || [];
        const delta = labelDelta(previousLabels, nextLabels);

        if (delta.added.length > 0 || delta.removed.length > 0) {
            const occurredAt = toIso(body.event_created_at || body.created_at || body.updated_at || conversation.updated_at || conversation.timestamp);
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

        if (payloadNextLabels) {
            await supabase
                .schema("cw")
                .from("conversations_current")
                .upsert({
                    chatwoot_conversation_id: conversationId,
                    labels: normalizeLabels(payloadNextLabels),
                    raw_payload: conversation,
                    updated_at: new Date().toISOString(),
                }, { onConflict: "chatwoot_conversation_id" });
        }

        return new Response(JSON.stringify({
            success: true,
            conversation_id: conversationId,
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
