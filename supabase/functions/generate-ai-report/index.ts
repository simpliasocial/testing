import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
    AI_REPORT_PROFILES,
    createAiReportOpenAiResponse,
    formatAiReportError,
    isOpenAiReportFailed,
    isOpenAiReportPending,
    openAiReportErrorMessage,
    openAiReportStatus,
    renderAiReportFileFromOpenAiResponse,
    retrieveOpenAiReportResponse,
    type CriticalProfileKey,
    type ReportFormat,
} from "../_shared/ai-reporting.ts";
import { canAccessCriticalReportProfile } from "../_shared/report-permissions.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type GenerateAiReportPayload = {
    action?: "start" | "status" | "download";
    profileKey?: CriticalProfileKey;
    formatId?: ReportFormat;
    responseId?: string;
    rangeLabel?: string;
    companyContext?: string;
    filters?: {
        startDate?: string;
        endDate?: string;
        selectedInboxes?: number[];
    };
};

const asObject = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const cleanText = (value: unknown) => String(value ?? "").trim();

const toIsoOrFallback = (value: string | undefined, fallback: Date, endOfDay = false) => {
    const parsed = value ? new Date(value) : fallback;
    if (Number.isNaN(parsed.getTime())) return fallback.toISOString();
    if (endOfDay && parsed.getUTCHours() === 0 && parsed.getUTCMinutes() === 0 && parsed.getUTCSeconds() === 0) {
        parsed.setUTCHours(23, 59, 59, 999);
    }
    return parsed.toISOString();
};

const defaultRange = () => {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
    return { start, end };
};

const rangeFromPayload = (payload: GenerateAiReportPayload) => {
    const fallback = defaultRange();
    const sinceIso = toIsoOrFallback(payload.filters?.startDate, fallback.start);
    const untilIso = toIsoOrFallback(payload.filters?.endDate, fallback.end, true);
    return {
        sinceIso,
        untilIso,
        label: `${sinceIso.slice(0, 10)}_a_${untilIso.slice(0, 10)}`,
    };
};

const fetchConversationRows = async (
    supabase: ReturnType<typeof createClient>,
    payload: GenerateAiReportPayload,
    range: { sinceIso: string; untilIso: string },
) => {
    const selectedInboxes = Array.isArray(payload.filters?.selectedInboxes)
        ? payload.filters.selectedInboxes.map(Number).filter((value) => Number.isFinite(value))
        : [];
    const rows: Record<string, unknown>[] = [];
    const pageSize = 1000;
    let page = 0;

    while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        let query = supabase
            .schema("cw")
            .from("conversations_current")
            .select("*")
            .gte("created_at_chatwoot", range.sinceIso)
            .lte("created_at_chatwoot", range.untilIso)
            .order("created_at_chatwoot", { ascending: false })
            .range(from, to);

        if (selectedInboxes.length > 0) query = query.in("chatwoot_inbox_id", selectedInboxes);

        const { data, error } = await query;
        if (error) throw error;
        rows.push(...((data || []) as Record<string, unknown>[]));
        if (!data || data.length < pageSize) break;
        page += 1;
    }

    return rows;
};

const fetchCommercialAuditEvents = async (
    supabase: ReturnType<typeof createClient>,
    range: { sinceIso: string; untilIso: string },
) => {
    const { data, error } = await supabase
        .schema("cw")
        .from("commercial_audit_events")
        .select("*")
        .gte("changed_at", range.sinceIso)
        .lte("changed_at", range.untilIso)
        .order("changed_at", { ascending: false })
        .limit(5000);

    if (error) return [];
    return (data || []) as Record<string, unknown>[];
};

const fetchDashboardSettings = async (supabase: ReturnType<typeof createClient>) => {
    try {
        const { data, error } = await supabase
            .schema("cw")
            .from("dashboard_tag_settings")
            .select("settings")
            .eq("account_id", 0)
            .maybeSingle();
        if (error) throw error;
        return asObject((data as { settings?: unknown } | null)?.settings);
    } catch {
        const { data } = await supabase
            .from("dashboard_tag_settings")
            .select("settings")
            .eq("account_id", 0)
            .maybeSingle();
        return asObject((data as { settings?: unknown } | null)?.settings);
    }
};

const fetchUserRole = async (
    supabase: ReturnType<typeof createClient>,
    authHeader: string | null,
) => {
    const jwt = cleanText(authHeader).replace(/^Bearer\s+/i, "");
    if (!jwt) return null;

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) return null;

    const { data, error } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", userData.user.id)
        .maybeSingle();

    if (error) return null;
    return cleanText((data as { role?: unknown } | null)?.role) || null;
};

const jsonResponse = (payload: Record<string, unknown>, init?: ResponseInit) =>
    new Response(JSON.stringify(payload), {
        ...init,
        headers: { ...corsHeaders, "Content-Type": "application/json", ...(init?.headers || {}) },
    });

const failedPayload = (error: unknown, details?: unknown) => ({
    ok: false,
    status: "failed",
    error: formatAiReportError(error, details),
    details,
});

const pendingPayload = (body: Record<string, unknown>, rangeLabel: string) => {
    const responseId = cleanText(body.id);
    if (!responseId) throw new Error("OpenAI no devolvió ID para consultar el reporte IA.");
    return {
        ok: true,
        status: openAiReportStatus(body) || "in_progress",
        jobId: responseId,
        responseId,
        rangeLabel,
        pollAfterMs: 3500,
    };
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const openAiApiKey = Deno.env.get("OPENAI_API_KEY") || "";

        if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase service role environment variables.");
        if (!openAiApiKey) throw new Error("Missing OPENAI_API_KEY.");

        const payload = await req.json().catch(() => ({})) as GenerateAiReportPayload;
        const action = payload.action || (payload.responseId ? "download" : "start");
        const profileKey = payload.profileKey;
        const format = payload.formatId;
        const responseId = cleanText(payload.responseId);
        if (!profileKey || !AI_REPORT_PROFILES[profileKey]) throw new Error("Perfil de reporte IA inválido.");
        if (!format) throw new Error("Formato de reporte IA inválido.");

        const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
        const role = await fetchUserRole(supabase, req.headers.get("Authorization"));
        if (!canAccessCriticalReportProfile(role, profileKey)) {
            return jsonResponse(failedPayload("No tienes acceso a este reporte.", { code: "forbidden" }));
        }

        const range = rangeFromPayload(payload);

        if (action === "status" || action === "download") {
            if (!responseId) throw new Error("Falta responseId para consultar el reporte IA.");
            const responseBody = await retrieveOpenAiReportResponse({ apiKey: openAiApiKey, responseId });
            if (isOpenAiReportPending(responseBody)) {
                return jsonResponse(pendingPayload(responseBody, cleanText(payload.rangeLabel) || range.label));
            }
            if (isOpenAiReportFailed(responseBody)) {
                return jsonResponse(failedPayload(
                    openAiReportErrorMessage(responseBody) || `OpenAI terminó con estado ${openAiReportStatus(responseBody)}.`,
                    responseBody,
                ));
            }
            if (action === "status") {
                return jsonResponse({
                    ok: true,
                    status: "completed",
                    jobId: responseId,
                    responseId,
                    rangeLabel: cleanText(payload.rangeLabel) || range.label,
                    pollAfterMs: 0,
                });
            }
            const settings = await fetchDashboardSettings(supabase);
            const file = renderAiReportFileFromOpenAiResponse({
                responseBody,
                profileKey,
                format,
                rangeLabel: cleanText(payload.rangeLabel) || range.label,
                rows: await fetchConversationRows(supabase, payload, range),
                auditEvents: await fetchCommercialAuditEvents(supabase, range),
                companyContext: cleanText(payload.companyContext) || cleanText(settings.companyContext),
                filters: payload.filters,
            });
            return jsonResponse({ ok: true, status: "completed", jobId: responseId, responseId, ...file });
        }

        if (action !== "start") throw new Error(`Acción de reporte IA no soportada: ${action}.`);

        const [rows, auditEvents, settings] = await Promise.all([
            fetchConversationRows(supabase, payload, range),
            fetchCommercialAuditEvents(supabase, range),
            fetchDashboardSettings(supabase),
        ]);

        const responseBody = await createAiReportOpenAiResponse({
            profileKey,
            format,
            rows,
            auditEvents,
            rangeLabel: range.label,
            companyContext: cleanText(payload.companyContext) || cleanText(settings.companyContext),
            filters: payload.filters,
            openAiApiKey,
            background: true,
        });

        if (isOpenAiReportPending(responseBody)) return jsonResponse(pendingPayload(responseBody, range.label));
        if (isOpenAiReportFailed(responseBody)) {
            return jsonResponse(failedPayload(
                openAiReportErrorMessage(responseBody) || `OpenAI terminó con estado ${openAiReportStatus(responseBody)}.`,
                responseBody,
            ));
        }

        const completedId = cleanText(responseBody.id);
        if (!completedId) throw new Error("OpenAI completó el reporte pero no devolvió ID para descargarlo.");
        return jsonResponse({
            ok: true,
            status: "completed",
            jobId: completedId,
            responseId: completedId,
            rangeLabel: range.label,
            pollAfterMs: 0,
        });
    } catch (error) {
        return jsonResponse(failedPayload(error));
    }
});
