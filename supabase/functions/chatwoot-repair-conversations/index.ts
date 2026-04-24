import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_LIMIT = 250;
const DEFAULT_BATCH_SIZE = 5;

const toIso = (value: unknown) => {
    if (!value) return null;
    const numeric = Number(value);
    const date = Number.isNaN(numeric)
        ? new Date(String(value))
        : new Date(numeric < 10000000000 ? numeric * 1000 : numeric);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
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

const uniqueIds = (values: unknown[]) =>
    Array.from(new Set(
        values
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value > 0),
    ));

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

const chunk = <T,>(items: T[], size: number) => {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        const chatwootBaseUrl = Deno.env.get("CHATWOOT_BASE_URL") ?? Deno.env.get("VITE_CHATWOOT_BASE_URL") ?? "";
        const chatwootAccountId = Deno.env.get("CHATWOOT_ACCOUNT_ID") ?? Deno.env.get("VITE_CHATWOOT_ACCOUNT_ID") ?? "";
        const chatwootApiToken = Deno.env.get("CHATWOOT_API_TOKEN") ?? Deno.env.get("VITE_CHATWOOT_API_TOKEN") ?? "";

        if (!supabaseUrl || !serviceRoleKey || !chatwootBaseUrl || !chatwootAccountId || !chatwootApiToken) {
            throw new Error("Missing Supabase or Chatwoot environment variables.");
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const body = await req.json().catch(() => ({}));
        const requestedIds = uniqueIds(Array.isArray(body.ids) ? body.ids : []);
        const limit = Math.max(1, Number(body.limit) || DEFAULT_LIMIT);
        const batchSize = Math.max(1, Number(body.batch_size) || DEFAULT_BATCH_SIZE);

        const idsToRepair = requestedIds.length > 0
            ? requestedIds.slice(0, limit)
            : (() => {
                throw new Error("IDs must be loaded from database first.");
            })();

        if (requestedIds.length === 0) {
            const { data, error } = await supabase
                .schema("cw")
                .from("conversations_current")
                .select("chatwoot_conversation_id")
                .order("chatwoot_conversation_id", { ascending: true })
                .limit(limit);

            if (error) throw error;
            idsToRepair.splice(0, idsToRepair.length, ...uniqueIds((data || []).map((row: any) => row.chatwoot_conversation_id)));
        }

        if (idsToRepair.length === 0) {
            return new Response(JSON.stringify({ success: true, stats: { repaired: 0, label_events: 0 } }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            });
        }

        const { data: existingRows, error: existingError } = await supabase
            .schema("cw")
            .from("conversations_current")
            .select("chatwoot_conversation_id, labels")
            .in("chatwoot_conversation_id", idsToRepair);

        if (existingError) throw existingError;

        const existingLabelsById = new Map<number, string[]>();
        (existingRows || []).forEach((row: any) => {
            existingLabelsById.set(Number(row.chatwoot_conversation_id), normalizeLabels(row.labels));
        });

        const apiGetConversation = async (conversationId: number) => {
            const response = await fetch(`${chatwootBaseUrl}/api/v1/accounts/${chatwootAccountId}/conversations/${conversationId}`, {
                headers: {
                    api_access_token: chatwootApiToken,
                },
            });

            if (!response.ok) {
                throw new Error(`Chatwoot conversation ${conversationId} failed: ${response.status} ${await response.text()}`);
            }

            const json = await response.json();
            const rawBody = json.data || json;
            return Array.isArray(rawBody) ? rawBody[0] : (rawBody.payload || rawBody);
        };

        const conversationRows: Record<string, any>[] = [];
        const labelEventRows: Record<string, any>[] = [];

        for (const idBatch of chunk(idsToRepair, batchSize)) {
            const batchResults = await Promise.all(idBatch.map(async (conversationId) => {
                try {
                    const conversation = await apiGetConversation(conversationId);
                    return { conversationId, conversation, error: null };
                } catch (error) {
                    return { conversationId, conversation: null, error };
                }
            }));

            batchResults.forEach(({ conversationId, conversation, error }) => {
                if (error || !conversation) return;

                const conversationRow = buildConversationUpsertRow(conversation);
                if (conversationRow) {
                    conversationRows.push(conversationRow);
                }

                const delta = labelDelta(existingLabelsById.get(conversationId) || [], conversation.labels || []);
                if (delta.added.length === 0 && delta.removed.length === 0) return;

                const occurredAt = toIso(conversation.updated_at || conversation.last_activity_at || conversation.timestamp) || new Date().toISOString();
                labelEventRows.push({
                    chatwoot_conversation_id: conversationId,
                    previous_labels: delta.previous,
                    next_labels: delta.next,
                    added_labels: delta.added,
                    removed_labels: delta.removed,
                    event_source: "repair",
                    occurred_at: occurredAt,
                    detected_at: new Date().toISOString(),
                    raw_payload: {
                        source: "chatwoot-repair-conversations",
                        conversation,
                    },
                    event_key: ["repair", conversationId, occurredAt, delta.previous.join("|"), delta.next.join("|")].join(":"),
                });
            });
        }

        if (conversationRows.length > 0) {
            const { error } = await supabase
                .schema("cw")
                .from("conversations_current")
                .upsert(conversationRows, { onConflict: "chatwoot_conversation_id" });

            if (error) throw error;
        }

        if (labelEventRows.length > 0) {
            const { error } = await supabase
                .schema("cw")
                .from("conversation_label_events")
                .upsert(labelEventRows, { onConflict: "event_key", ignoreDuplicates: true });

            if (error) throw error;
        }

        return new Response(JSON.stringify({
            success: true,
            stats: {
                requested: idsToRepair.length,
                repaired: conversationRows.length,
                label_events: labelEventRows.length,
            },
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
