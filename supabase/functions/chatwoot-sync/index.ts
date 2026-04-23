import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHATWOOT_PAGE_SIZE = 15;
const MAX_CHATWOOT_PAGES = 200;

const toIso = (value: unknown) => {
    if (!value) return null;
    const n = Number(value);
    const date = Number.isNaN(n)
        ? new Date(String(value))
        : new Date(n < 10000000000 ? n * 1000 : n);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const parseNumber = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isNaN(value) ? null : value;
    const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
    return Number.isNaN(parsed) ? null : parsed;
};

const uniqueBy = <T extends Record<string, unknown>>(rows: T[], key: keyof T) => {
    const map = new Map<unknown, T>();
    rows.forEach((row) => {
        if (row[key] !== undefined && row[key] !== null) map.set(row[key], row);
    });
    return Array.from(map.values());
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

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        const chatwootBase = Deno.env.get("VITE_CHATWOOT_BASE_URL");
        const accountId = Deno.env.get("VITE_CHATWOOT_ACCOUNT_ID");
        const apiToken = Deno.env.get("VITE_CHATWOOT_API_TOKEN");

        if (!supabaseUrl || !serviceRoleKey || !chatwootBase || !accountId || !apiToken) {
            throw new Error("Missing required Supabase or Chatwoot environment variables.");
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const chatwootUrl = `${chatwootBase}/api/v1/accounts/${accountId}`;
        const body = await req.json().catch(() => ({}));
        const windowHours = Number(body.window_hours || 48);
        const untilUnix = Math.floor(Date.now() / 1000);
        const sinceUnix = untilUnix - windowHours * 60 * 60;

        const apiGet = async (endpoint: string, params: Record<string, string | number> = {}) => {
            const url = new URL(`${chatwootUrl}${endpoint}`);
            Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));

            const response = await fetch(url.toString(), {
                headers: { api_access_token: apiToken },
            });

            if (!response.ok) {
                throw new Error(`Chatwoot ${endpoint} failed: ${response.status} ${await response.text()}`);
            }

            const json = await response.json();
            const rawBody = json.data || json;
            return Array.isArray(rawBody) ? rawBody : (rawBody.payload || rawBody);
        };

        const { data: run, error: runError } = await supabase
            .schema("cw")
            .from("sync_runs")
            .insert({
                sync_type: "daily_48h",
                status: "running",
                stats: { window_hours: windowHours },
            })
            .select("id")
            .single();

        if (runError) throw runError;

        const runId = run.id;
        const stats = {
            window_hours: windowHours,
            inboxes: 0,
            contacts: 0,
            conversations: 0,
            label_events: 0,
            messages: 0,
            pages: 0,
        };

        try {
            const inboxes = await apiGet("/inboxes");
            if (Array.isArray(inboxes) && inboxes.length > 0) {
                const inboxRows = inboxes.map((inbox: any) => ({
                    chatwoot_inbox_id: inbox.id,
                    name: inbox.name,
                    website_url: inbox.website_url,
                    channel_type: inbox.channel_type,
                    avatar_url: inbox.avatar_url,
                    widget_color: inbox.widget_color,
                    website_token: inbox.website_token,
                    enable_auto_assignment: inbox.enable_auto_assignment,
                    web_widget_script: inbox.web_widget_script,
                    welcome_title: inbox.welcome_title,
                    welcome_tagline: inbox.welcome_tagline,
                    greeting_enabled: inbox.greeting_enabled,
                    raw_payload: inbox,
                    updated_at: new Date().toISOString(),
                }));

                const { error } = await supabase
                    .schema("cw")
                    .from("inboxes")
                    .upsert(inboxRows, { onConflict: "chatwoot_inbox_id" });
                if (error) throw error;
                stats.inboxes = inboxRows.length;
            }

            let page = 1;
            while (page <= MAX_CHATWOOT_PAGES) {
                const conversations = await apiGet("/conversations", {
                    page,
                    status: "all",
                    assignee_type: "all",
                    sort_by: "last_activity_at_desc",
                    since: sinceUnix,
                    until: untilUnix,
                });

                if (!Array.isArray(conversations) || conversations.length === 0) break;
                stats.pages += 1;

                const conversationIds = conversations.map((conv: any) => Number(conv.id)).filter(Boolean);
                const existingLabels = new Map<number, string[]>();
                if (conversationIds.length > 0) {
                    const { data: existingRows, error: existingError } = await supabase
                        .schema("cw")
                        .from("conversations_current")
                        .select("chatwoot_conversation_id, labels")
                        .in("chatwoot_conversation_id", conversationIds);

                    if (existingError) throw existingError;
                    (existingRows || []).forEach((row: any) => {
                        existingLabels.set(Number(row.chatwoot_conversation_id), normalizeLabels(row.labels));
                    });
                }

                const labelEventRows = conversations
                    .map((conv: any) => {
                        const conversationId = Number(conv.id);
                        const delta = labelDelta(existingLabels.get(conversationId) || [], conv.labels || []);
                        if (delta.added.length === 0 && delta.removed.length === 0) return null;

                        const occurredAt = toIso(conv.updated_at || conv.last_activity_at || conv.timestamp || Date.now()) || new Date().toISOString();
                        const eventKey = [
                            "sync_diff",
                            conversationId,
                            occurredAt,
                            delta.previous.join("|"),
                            delta.next.join("|"),
                        ].join(":");

                        return {
                            chatwoot_conversation_id: conversationId,
                            previous_labels: delta.previous,
                            next_labels: delta.next,
                            added_labels: delta.added,
                            removed_labels: delta.removed,
                            event_source: "sync_diff",
                            occurred_at: occurredAt,
                            detected_at: new Date().toISOString(),
                            raw_payload: {
                                source: "chatwoot-sync",
                                page,
                                previous_labels: delta.previous,
                                next_labels: delta.next,
                            },
                            event_key: eventKey,
                        };
                    })
                    .filter(Boolean);

                if (labelEventRows.length > 0) {
                    const { error: labelEventError } = await supabase
                        .schema("cw")
                        .from("conversation_label_events")
                        .upsert(labelEventRows, { onConflict: "event_key", ignoreDuplicates: true });

                    if (labelEventError) throw labelEventError;
                    stats.label_events += labelEventRows.length;
                }

                const contactRows = conversations
                    .filter((conv: any) => conv.meta?.sender?.id)
                    .map((conv: any) => {
                        const sender = conv.meta.sender;
                        const identityKey = sender.phone_number || sender.email || sender.identifier || `cw_${sender.id}`;

                        return {
                            chatwoot_contact_id: sender.id,
                            lead_identity_key: identityKey,
                            identifier: sender.identifier,
                            name: sender.name,
                            phone_number: sender.phone_number,
                            email: sender.email,
                            blocked: sender.blocked,
                            thumbnail: sender.thumbnail,
                            availability_status: sender.availability_status,
                            additional_attributes: sender.additional_attributes || {},
                            custom_attributes: sender.custom_attributes || {},
                            created_at_chatwoot: toIso(sender.created_at),
                            last_activity_at_chatwoot: toIso(sender.last_activity_at),
                            raw_payload: sender,
                            updated_at: new Date().toISOString(),
                        };
                    });

                const uniqueContacts = uniqueBy(contactRows, "chatwoot_contact_id");
                if (uniqueContacts.length > 0) {
                    const { error } = await supabase
                        .schema("cw")
                        .from("contacts_current")
                        .upsert(uniqueContacts, { onConflict: "chatwoot_contact_id" });
                    if (error) throw error;
                    stats.contacts += uniqueContacts.length;
                }

                const conversationRows = conversations.map((conv: any) => {
                    const contactAttrs = conv.meta?.sender?.custom_attributes || {};
                    const convAttrs = conv.custom_attributes || {};
                    const attrs = { ...contactAttrs, ...convAttrs };
                    const lastNonActivity = conv.last_non_activity_message || {};

                    return {
                        chatwoot_conversation_id: conv.id,
                        chatwoot_contact_id: conv.meta?.sender?.id || conv.contact_id,
                        chatwoot_account_id: conv.account_id,
                        chatwoot_inbox_id: conv.inbox_id,
                        chatwoot_team_id: conv.team_id,
                        assignee_id: conv.assignee_id,
                        uuid: conv.uuid,
                        status: conv.status,
                        priority: conv.priority,
                        can_reply: conv.can_reply,
                        muted: conv.muted,
                        snoozed_until: toIso(conv.snoozed_until),
                        unread_count: conv.unread_count,
                        labels: conv.labels || [],
                        business_stage_current: attrs.business_stage,
                        additional_attributes: conv.additional_attributes || {},
                        custom_attributes: attrs,
                        meta: conv.meta || {},
                        applied_sla: conv.applied_sla || {},
                        sla_events: conv.sla_events || [],
                        first_reply_created_at_chatwoot: toIso(conv.first_reply_created_at),
                        waiting_since_chatwoot: toIso(conv.waiting_since),
                        last_activity_at_chatwoot: toIso(conv.last_activity_at || conv.timestamp),
                        created_at_chatwoot: toIso(conv.created_at || conv.timestamp),
                        updated_at_chatwoot: new Date().toISOString(),
                        last_non_activity_message_id: lastNonActivity.id,
                        last_non_activity_message_preview: lastNonActivity.content,
                        last_message_at: toIso(lastNonActivity.created_at || conv.timestamp),
                        raw_payload: conv,
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
                        fecha_monto_operacion: toIso(attrs.fecha_monto_operacion),
                        updated_at: new Date().toISOString(),
                    };
                });

                const { error: conversationError } = await supabase
                    .schema("cw")
                    .from("conversations_current")
                    .upsert(conversationRows, { onConflict: "chatwoot_conversation_id" });
                if (conversationError) throw conversationError;
                stats.conversations += conversationRows.length;

                for (const conv of conversations) {
                    const messages = await apiGet(`/conversations/${conv.id}/messages`);
                    if (!Array.isArray(messages) || messages.length === 0) continue;

                    const messageRows = messages.map((msg: any) => {
                        const numericType = Number(msg.message_type);
                        const messageDirection = numericType === 1
                            ? "outgoing"
                            : numericType === 0
                                ? "incoming"
                                : "activity";

                        return {
                            chatwoot_message_id: msg.id,
                            chatwoot_conversation_id: msg.conversation_id,
                            chatwoot_contact_id: msg.sender?.id,
                            chatwoot_account_id: msg.account_id,
                            chatwoot_inbox_id: msg.inbox_id,
                            sender_id: msg.sender?.id,
                            sender_type: msg.sender_type,
                            message_type: String(msg.message_type ?? ""),
                            message_direction: messageDirection,
                            content: msg.content,
                            content_type: msg.content_type,
                            content_attributes: msg.content_attributes || {},
                            additional_attributes: msg.additional_attributes || {},
                            external_source_ids: msg.external_source_ids || {},
                            attachments: msg.attachments || [],
                            sender: msg.sender || {},
                            sentiment: msg.sentiment || {},
                            status: msg.status,
                            is_private: msg.private || false,
                            created_at_chatwoot: toIso(msg.created_at),
                            updated_at_chatwoot: toIso(msg.updated_at),
                            raw_payload: msg,
                        };
                    });

                    const { error: messageError } = await supabase
                        .schema("cw")
                        .from("messages")
                        .upsert(messageRows, { onConflict: "chatwoot_message_id" });
                    if (messageError) throw messageError;
                    stats.messages += messageRows.length;
                }

                const oldestActivity = Math.min(
                    ...conversations
                        .map((conv: any) => Number(conv.last_activity_at || conv.timestamp || conv.created_at || 0))
                        .filter(Boolean)
                );

                if (oldestActivity && oldestActivity < sinceUnix) break;
                if (conversations.length < CHATWOOT_PAGE_SIZE) break;
                page += 1;
            }

            await supabase
                .schema("cw")
                .from("sync_cursor")
                .upsert({
                    cursor_name: "daily_delta",
                    last_since_ts: toIso(sinceUnix),
                    last_until_ts: toIso(untilUnix),
                    cursor_payload: { window_hours: windowHours },
                    updated_at: new Date().toISOString(),
                }, { onConflict: "cursor_name" });

            await supabase
                .schema("cw")
                .from("sync_runs")
                .update({
                    status: "success",
                    finished_at: new Date().toISOString(),
                    stats,
                })
                .eq("id", runId);

            return new Response(JSON.stringify({
                success: true,
                since: toIso(sinceUnix),
                until: toIso(untilUnix),
                stats,
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            });
        } catch (syncError) {
            await supabase
                .schema("cw")
                .from("sync_runs")
                .update({
                    status: "error",
                    finished_at: new Date().toISOString(),
                    stats,
                    error_message: syncError instanceof Error ? syncError.message : String(syncError),
                })
                .eq("id", runId);

            throw syncError;
        }
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
