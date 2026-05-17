import { getAiReportPromptTemplate } from "./ai-report-prompts.ts";
import { AI_REPORT_PROFILES, type AiReportProfile, type CriticalProfileKey, type ReportFormat } from "./ai-report-profiles.ts";
export { AI_REPORT_PROFILES } from "./ai-report-profiles.ts";
export type { AiReportProfile, CriticalProfileKey, ReportFormat } from "./ai-report-profiles.ts";

export type AiReportBuildParams = {
    profileKey: CriticalProfileKey;
    format: ReportFormat;
    rows: Record<string, unknown>[];
    auditEvents?: Record<string, unknown>[];
    rangeLabel: string;
    companyContext?: string;
    filters?: AiReportFilters;
    openAiApiKey: string;
    model?: string;
};

export type AiReportFile = {
    filename: string;
    mimeType: string;
    contentBase64: string;
};

export type AiReportAttachment = {
    filename: string;
    content: string;
};

type AiReportInsight = {
    title: string;
    evidence: string;
    impact: string;
    recommendation: string;
    priority: string;
};

type AiReportRecommendation = {
    action: string;
    owner: string;
    priority: string;
    rationale: string;
};

type AiReportTable = {
    name: string;
    columns: string[];
    rows: string[][];
};

type AiReportNarrative = {
    title: string;
    executiveSummary: string[];
    insights: AiReportInsight[];
    risks: string[];
    recommendations: AiReportRecommendation[];
    tables: AiReportTable[];
};

type DetailRow = {
    id: string;
    nombre: string;
    telefono: string;
    correo: string;
    canal: string;
    campana: string;
    ciudad: string;
    responsable: string;
    estado: string;
    etapa: string;
    etiquetas: string;
    puntaje: number | "";
    nivel: string;
    monto: number;
    fecha_ingreso: string;
    ultima_interaccion: string;
    intentos_llamada: string;
    fecha_primera_llamada: string;
    tiempo_primer_contacto: string;
    resultado_llamada: string;
    duracion_llamada: string;
    proxima_accion: string;
    observaciones: string;
    motivo_perdida: string;
    producto_interes: string;
    origen_dato: string;
    sin_respuesta: boolean;
    primer_contacto_segundos: number | null;
};

export type AiReportFilters = {
    startDate?: string;
    endDate?: string;
    selectedInboxes?: number[];
};

type AiReportAvailability = {
    key: string;
    label: string;
    available: boolean;
    reason: string;
    fields: string[];
};

export type AiReportDataset = {
    reporte: string;
    formato_solicitado: ReportFormat;
    periodo: string;
    pestanas_incluidas: string[];
    filtros_aplicados: Array<{ filtro: string; valor: string }>;
    contexto_empresarial: string;
    data_availability: AiReportAvailability[];
    resumen_base: {
        leads: number;
        ventas_detectadas: number;
        citas_detectadas: number;
        seguimiento_detectado: number;
        sql_detectados: number;
        no_calificados: number;
        monto_total_detectado: number;
        ticket_promedio_detectado: number | null;
        leads_con_puntaje: number;
        puntaje_promedio: number | null;
        cambios_comerciales_relevantes: number;
        leads_sin_contactar: number;
        leads_contactados: number;
        tasa_contactabilidad: number;
        tiempo_promedio_primer_contacto_segundos: number | null;
        muestras_primer_contacto: number;
    };
    distribucion_por_etapa: Array<{ label: string; value: number }>;
    distribucion_por_canal: Array<{ label: string; value: number }>;
    distribucion_por_responsable: Array<{ label: string; value: number }>;
    distribucion_por_campana: Array<{ label: string; value: number }>;
    distribucion_por_calidad: Array<{ label: string; value: number }>;
    distribucion_por_estado: Array<{ label: string; value: number }>;
    distribucion_por_dia: Array<{ label: string; value: number }>;
    detalle: DetailRow[];
    detalle_muestra: DetailRow[];
    nota_recorte: string;
};

type AiReportSheet = {
    name: string;
    columns: string[];
    rows: string[][];
    kind?: "metadata" | "table";
    autoFilter?: boolean;
    headerStyle?: boolean;
    wrapText?: boolean;
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_REASONING_EFFORT = "low";
const DEFAULT_OPENAI_TIMEOUT_MS = 140_000;
const DEFAULT_OPENAI_START_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8000;
const TIMEZONE = "America/Guayaquil";
const PDF_WIDTH = 595;
const PDF_HEIGHT = 842;
const PDF_MARGIN = 42;

const TAB_LABELS: Record<string, string> = {
    overview: "Estrategia",
    funnel: "Embudo",
    operational: "Operación",
    followup: "Seguimiento",
    performance: "Rendimiento Humano",
    trends: "Tendencias",
    scoring: "Calidad",
    chats: "Conversaciones",
};

const OUTPUT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["title", "executiveSummary", "insights", "risks", "recommendations", "tables"],
    properties: {
        title: { type: "string" },
        executiveSummary: { type: "array", items: { type: "string" } },
        insights: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["title", "evidence", "impact", "recommendation", "priority"],
                properties: {
                    title: { type: "string" },
                    evidence: { type: "string" },
                    impact: { type: "string" },
                    recommendation: { type: "string" },
                    priority: { type: "string" },
                },
            },
        },
        risks: { type: "array", items: { type: "string" } },
        recommendations: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["action", "owner", "priority", "rationale"],
                properties: {
                    action: { type: "string" },
                    owner: { type: "string" },
                    priority: { type: "string" },
                    rationale: { type: "string" },
                },
            },
        },
        tables: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "columns", "rows"],
                properties: {
                    name: { type: "string" },
                    columns: { type: "array", items: { type: "string" } },
                    rows: {
                        type: "array",
                        items: { type: "array", items: { type: "string" } },
                    },
                },
            },
        },
    },
};

const cleanText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const getEnv = (name: string) =>
    (globalThis as unknown as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno?.env?.get?.(name);

const normalizeText = (value: unknown) =>
    cleanText(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

const safeEnvPart = (value: string) =>
    normalizeText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();

export const resolveOpenAiReportModel = (profileKey?: CriticalProfileKey, format?: ReportFormat) => {
    const exactKey = profileKey && format
        ? `OPENAI_REPORT_MODEL_${safeEnvPart(profileKey)}_${safeEnvPart(format)}`
        : "";
    const groupKey = format === "pdf" ? "OPENAI_REPORT_MODEL_PDF" : "OPENAI_REPORT_MODEL_TABLE";
    return cleanText(
        (exactKey && getEnv(exactKey)) ||
        getEnv(groupKey) ||
        getEnv("OPENAI_REPORT_MODEL") ||
        DEFAULT_MODEL,
    );
};

export const resolveOpenAiReportReasoningEffort = () =>
    cleanText(getEnv("OPENAI_REPORT_REASONING_EFFORT")) || DEFAULT_REASONING_EFFORT;

const parseAmount = (value: unknown) => {
    const raw = cleanText(value);
    if (!raw) return 0;
    const normalized = raw.includes(",") && !raw.includes(".") ? raw.replace(",", ".") : raw.replace(/,/g, "");
    const parsed = Number.parseFloat(normalized.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
};

const parseScore = (value: unknown) => {
    const raw = cleanText(value);
    if (!raw) return null;
    const parsed = Number.parseFloat(raw.replace(",", ".").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
};

const rowLabels = (row: Record<string, unknown>) =>
    Array.isArray(row.labels)
        ? row.labels.map(cleanText).filter(Boolean)
        : [];

const resolvedAttrs = (row: Record<string, unknown>) => ({
    ...asRecord(row.contact_custom_attributes),
    ...asRecord(row.conversation_custom_attributes),
    ...asRecord(row.custom_attributes),
    ...asRecord(row.resolved_custom_attributes),
});

const resolveStage = (row: Record<string, unknown>) => {
    const labels = rowLabels(row).map(normalizeText);
    if (labels.some((label) => ["venta_exitosa", "venta"].includes(label))) return "Venta";
    if (labels.some((label) => ["cita_agendada", "cita_agendada_humano", "cita"].includes(label))) return "Cita";
    if (labels.includes("seguimiento_humano")) return "Seguimiento";
    if (labels.some((label) => ["interesado", "crear_confianza", "crear_urgencia"].includes(label))) return "SQL";
    if (labels.some((label) => ["desinteresado", "descartado", "no_calificado", "rechazo", "rechazado"].includes(label))) return "No calificado";
    return "Otro";
};

const resolveChannel = (row: Record<string, unknown>, attrs: Record<string, unknown>) => {
    const raw = asRecord(row.raw_payload);
    const inbox = asRecord(raw.inbox || raw.channel);
    const hints = [
        row.canal,
        attrs.canal,
        raw.channel_type,
        raw.channel_name,
        raw.source,
        raw.provider,
        inbox.name,
        inbox.channel_type,
        inbox.provider,
        inbox.slug,
    ].map(cleanText).join(" ");
    const normalized = normalizeText(hints);
    if (normalized.includes("whatsapp") || normalized.includes("wa.me")) return "WhatsApp";
    if (normalized.includes("instagram")) return "Instagram";
    if (normalized.includes("facebook") || normalized.includes("messenger")) return "Facebook";
    if (normalized.includes("tiktok") || normalized.includes("tik tok")) return "TikTok";
    if (normalized.includes("web") || normalized.includes("widget")) return "Sitio web";
    return cleanText(row.canal || attrs.canal) || "Otro";
};

const scoreBucket = (score: number | null) => {
    if (score === null) return "No calificable: falta score o criterio de calificación";
    if (score >= 70) return "Alta calidad";
    if (score >= 45) return "Calidad media";
    return "Baja calidad";
};

const nestedValue = (source: Record<string, unknown>, key: string): unknown => {
    if (!key.includes(".")) return source[key];
    return key.split(".").reduce<unknown>((current, part) => asRecord(current)[part], source);
};

const firstFieldValue = (
    row: Record<string, unknown>,
    attrs: Record<string, unknown>,
    fields: string[],
) => {
    const raw = asRecord(row.raw_payload);
    const meta = asRecord(row.meta);
    const additional = asRecord(raw.additional_attributes);
    const custom = asRecord(raw.custom_attributes);
    const assignee = asRecord(meta.assignee || raw.assignee);
    const sender = asRecord(meta.sender || raw.sender);
    const containers = [row, attrs, raw, additional, custom, meta, assignee, sender];

    for (const field of fields) {
        for (const container of containers) {
            const value = nestedValue(container, field);
            if (cleanText(value)) return value;
        }
    }
    return "";
};

const FIELD_GROUPS = {
    leadName: ["name", "nombre", "contact_name", "sender.name"],
    phone: ["phone", "telefono", "phone_number", "contact_phone", "sender.phone_number"],
    email: ["email", "correo", "contact_email", "sender.email"],
    campaign: ["campana", "campaign", "utm_campaign", "campaign_name"],
    city: ["ciudad", "city", "country", "pais", "país_mercado"],
    assignee: ["responsable", "asesor", "assignee", "name"],
    callAttempts: ["intentos_llamada", "numero_intentos", "número_intentos", "call_attempts", "attempts", "llamadas_realizadas"],
    firstCall: ["fecha_primera_llamada", "first_call_at", "first_contact_at", "first_response_at", "primera_llamada"],
    firstContactTime: ["tiempo_primer_contacto", "time_to_first_contact", "first_response_time", "sla_first_response"],
    callResult: ["resultado_llamada", "call_result", "estado_llamada", "motivo_no_contacto"],
    callDuration: ["duracion_llamada", "call_duration", "duration", "duración_llamada"],
    nextAction: ["proxima_accion", "próxima_acción", "next_action", "next_activity_at", "followup_due_at"],
    observations: ["observaciones", "notes", "summary", "last_message", "ultimo_mensaje", "content"],
    lossReason: ["motivo_perdida", "motivo_pérdida", "loss_reason", "motivo_no_conversion", "motivo_descalificacion"],
    product: ["producto_interes", "producto_interés", "product", "service", "servicio"],
    score: ["score", "lead_score", "puntaje", "score_interes"],
    amount: ["monto_operacion", "amount", "deal_amount", "monto", "valor"],
} as const;

const availabilityCatalog: Array<{ key: string; label: string; fields: readonly string[] }> = [
    { key: "calls", label: "Llamadas e intentos", fields: FIELD_GROUPS.callAttempts },
    { key: "first_contact", label: "Primera llamada o primer contacto", fields: [...FIELD_GROUPS.firstCall, ...FIELD_GROUPS.firstContactTime] },
    { key: "call_result", label: "Resultado de llamada/contacto", fields: FIELD_GROUPS.callResult },
    { key: "next_action", label: "Próxima acción o seguimiento", fields: FIELD_GROUPS.nextAction },
    { key: "score", label: "Lead score / calificación", fields: FIELD_GROUPS.score },
    { key: "campaign", label: "Campaña / UTM campaign", fields: FIELD_GROUPS.campaign },
    { key: "assignee", label: "Asesor o responsable", fields: FIELD_GROUPS.assignee },
    { key: "amount", label: "Monto / valor comercial", fields: FIELD_GROUPS.amount },
    { key: "city", label: "Ciudad / mercado", fields: FIELD_GROUPS.city },
    { key: "observations", label: "Observaciones / notas comerciales", fields: FIELD_GROUPS.observations },
    { key: "loss_reason", label: "Motivo de pérdida o descalificación", fields: FIELD_GROUPS.lossReason },
];

const buildDataAvailability = (rows: Record<string, unknown>[]): AiReportAvailability[] =>
    availabilityCatalog.map((item) => {
        const available = rows.some((row) => cleanText(firstFieldValue(row, resolvedAttrs(row), [...item.fields])));
        return {
            key: item.key,
            label: item.label,
            available,
            fields: [...item.fields],
            reason: available
                ? "Disponible en al menos un registro filtrado."
                : `Esta lectura todavía no se mide porque la data filtrada no incluye ${item.label.toLowerCase()}. Para activarla se debe registrar alguno de estos campos: ${item.fields.slice(0, 4).join(", ")}.`,
        };
    });

const availabilityReason = (dataset: AiReportDataset, key: string, fallback: string) =>
    dataset.data_availability.find((item) => item.key === key)?.reason || fallback;

const valueOrReason = (
    value: unknown,
    dataset: AiReportDataset,
    key: string,
    fallback = "Pendiente de medir con la data filtrada actual.",
) => {
    const text = cleanText(value);
    if (text && text !== "N/A" && text !== "No disponible") return value;
    return availabilityReason(dataset, key, fallback);
};

const parseTimestampSeconds = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value)) {
        return value > 10_000_000_000 ? Math.round(value / 1000) : Math.round(value);
    }
    const text = cleanText(value);
    if (!text) return null;
    const numeric = Number(text);
    if (Number.isFinite(numeric)) return numeric > 10_000_000_000 ? Math.round(numeric / 1000) : Math.round(numeric);
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? Math.round(parsed / 1000) : null;
};

const messageTimestampSeconds = (message: Record<string, unknown>) =>
    parseTimestampSeconds(message.created_at_chatwoot || message.created_at || message.timestamp);

const isIncomingMessage = (message: Record<string, unknown>) =>
    message.message_direction === "incoming" ||
    Number(message.message_type) === 0 ||
    cleanText(message.message_type).toLowerCase() === "incoming" ||
    cleanText(message.sender_type).toLowerCase() === "contact";

const hasMessageSenderSignal = (message: Record<string, unknown>) =>
    message.message_direction !== undefined ||
    message.message_type !== undefined ||
    message.sender_type !== undefined;

const rowMessages = (row: Record<string, unknown>) => {
    const raw = asRecord(row.raw_payload);
    const candidates = [
        row.messages,
        raw.messages,
        asRecord(raw.conversation).messages,
    ];
    const source = candidates.find(Array.isArray);
    return Array.isArray(source)
        ? source
            .map(asRecord)
            .filter((message) => !message.private && !message.is_private && Number(messageTimestampSeconds(message) || 0) > 0)
            .sort((a, b) => Number(messageTimestampSeconds(a) || 0) - Number(messageTimestampSeconds(b) || 0))
        : [];
};

const firstResponseSeconds = (row: Record<string, unknown>) => {
    const raw = asRecord(row.raw_payload);
    const firstReply = parseTimestampSeconds(
        row.first_reply_created_at ||
        row.first_reply_created_at_chatwoot ||
        raw.first_reply_created_at ||
        raw.first_reply_created_at_chatwoot,
    );
    const created = parseTimestampSeconds(row.created_at_chatwoot || row.created_at || raw.created_at_chatwoot || raw.created_at);
    if (firstReply !== null && created !== null) {
        const diff = firstReply - created;
        if (diff >= 0 && diff <= 86_400) return diff;
    }
    return null;
};

const hasUnansweredCustomerMessage = (row: Record<string, unknown>) => {
    const raw = asRecord(row.raw_payload);
    if (row.waiting_since || row.waiting_since_chatwoot || raw.waiting_since || raw.waiting_since_chatwoot) return true;

    const lastNonActivityMessage = asRecord(row.last_non_activity_message || raw.last_non_activity_message);
    if (Object.keys(lastNonActivityMessage).length > 0 && hasMessageSenderSignal(lastNonActivityMessage)) {
        return isIncomingMessage(lastNonActivityMessage);
    }

    const messages = rowMessages(row);
    if (messages.length > 0) return isIncomingMessage(messages[messages.length - 1]);

    const hasFirstReply = cleanText(
        row.first_reply_created_at ||
        row.first_reply_created_at_chatwoot ||
        raw.first_reply_created_at ||
        raw.first_reply_created_at_chatwoot,
    );
    if (cleanText(lastNonActivityMessage.content) && !hasFirstReply) {
        return true;
    }

    return firstResponseSeconds(row) === null;
};

const detailRow = (row: Record<string, unknown>): DetailRow => {
    const attrs = resolvedAttrs(row);
    const score = parseScore(attrs.score ?? attrs.lead_score ?? attrs.puntaje ?? attrs.score_interes ?? row.score_interes);
    const amount = parseAmount(row.monto_operacion ?? attrs.monto_operacion);
    const meta = asRecord(row.meta);
    const assignee = asRecord(meta.assignee);
    const sinRespuesta = hasUnansweredCustomerMessage(row);
    const primerContactoSegundos = firstResponseSeconds(row);

    return {
        id: cleanText(row.chatwoot_conversation_id || row.id),
        nombre: cleanText(firstFieldValue(row, attrs, [...FIELD_GROUPS.leadName])) || "Sin nombre registrado",
        telefono: cleanText(firstFieldValue(row, attrs, [...FIELD_GROUPS.phone])) || "Sin teléfono registrado",
        correo: cleanText(firstFieldValue(row, attrs, [...FIELD_GROUPS.email])) || "Sin correo registrado",
        canal: resolveChannel(row, attrs),
        campana: cleanText(firstFieldValue(row, attrs, [...FIELD_GROUPS.campaign])) || "Sin campaña registrada",
        ciudad: cleanText(firstFieldValue(row, attrs, [...FIELD_GROUPS.city])) || "Sin ciudad registrada",
        responsable: cleanText(attrs.responsable || assignee.name || firstFieldValue(row, attrs, [...FIELD_GROUPS.assignee])) || "Sin responsable asignado",
        estado: cleanText(row.status || row.conversation_status) || "Sin estado",
        etapa: resolveStage(row),
        etiquetas: rowLabels(row).join(" | ") || "Sin etiquetas",
        puntaje: score === null ? "" : score,
        nivel: scoreBucket(score),
        monto: amount,
        fecha_ingreso: cleanText(row.created_at_chatwoot || row.created_at),
        ultima_interaccion: cleanText(row.last_activity_at_chatwoot || row.updated_at_chatwoot || row.updated_at),
        intentos_llamada: cleanText(firstFieldValue(row, attrs, [...FIELD_GROUPS.callAttempts])),
        fecha_primera_llamada: cleanText(firstFieldValue(row, attrs, [...FIELD_GROUPS.firstCall])),
        tiempo_primer_contacto: cleanText(firstFieldValue(row, attrs, [...FIELD_GROUPS.firstContactTime])),
        resultado_llamada: cleanText(firstFieldValue(row, attrs, [...FIELD_GROUPS.callResult])),
        duracion_llamada: cleanText(firstFieldValue(row, attrs, [...FIELD_GROUPS.callDuration])),
        proxima_accion: cleanText(firstFieldValue(row, attrs, [...FIELD_GROUPS.nextAction])),
        observaciones: cleanText(firstFieldValue(row, attrs, [...FIELD_GROUPS.observations])),
        motivo_perdida: cleanText(firstFieldValue(row, attrs, [...FIELD_GROUPS.lossReason])),
        producto_interes: cleanText(firstFieldValue(row, attrs, [...FIELD_GROUPS.product])),
        origen_dato: cleanText(row.source || "supabase"),
        sin_respuesta: sinRespuesta,
        primer_contacto_segundos: primerContactoSegundos,
    };
};

const groupCount = <T extends Record<string, unknown>>(rows: T[], key: keyof T, limit = 20) => {
    const groups = new Map<string, number>();
    rows.forEach((row) => {
        const label = cleanText(row[key]) || "Sin dato";
        groups.set(label, (groups.get(label) || 0) + 1);
    });
    return Array.from(groups.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
        .slice(0, limit);
};

const groupByDate = (rows: DetailRow[]) => {
    const groups = new Map<string, number>();
    rows.forEach((row) => {
        const label = cleanText(row.fecha_ingreso).slice(0, 10) || "Sin fecha";
        groups.set(label, (groups.get(label) || 0) + 1);
    });
    return Array.from(groups.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => a.label.localeCompare(b.label));
};

export const buildAiReportDataset = (params: {
    profile: AiReportProfile;
    format: ReportFormat;
    rows: Record<string, unknown>[];
    auditEvents: Record<string, unknown>[];
    rangeLabel: string;
    companyContext?: string;
    filters?: AiReportFilters;
}): AiReportDataset => {
    const details = params.rows.map(detailRow);
    const availability = buildDataAvailability(params.rows);
    const totalRevenue = details.reduce((sum, row) => sum + Number(row.monto || 0), 0);
    const sales = details.filter((row) => row.etapa === "Venta");
    const appointments = details.filter((row) => row.etapa === "Cita");
    const followups = details.filter((row) => row.etapa === "Seguimiento");
    const sqls = details.filter((row) => row.etapa === "SQL");
    const unqualified = details.filter((row) => row.etapa === "No calificado");
    const scored = details.filter((row) => row.puntaje !== "");
    const unanswered = details.filter((row) => row.sin_respuesta).length;
    const contacted = Math.max(0, details.length - unanswered);
    const firstResponseSamples = details
        .map((row) => row.primer_contacto_segundos)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const averageFirstResponse = firstResponseSamples.length > 0
        ? Math.round(firstResponseSamples.reduce((sum, value) => sum + value, 0) / firstResponseSamples.length)
        : null;
    const averageScore = scored.length > 0
        ? Number((scored.reduce((sum, row) => sum + Number(row.puntaje || 0), 0) / scored.length).toFixed(2))
        : null;

    return {
        reporte: params.profile.label,
        formato_solicitado: params.format,
        periodo: params.rangeLabel,
        pestanas_incluidas: params.profile.tabIds.map((tabId) => TAB_LABELS[tabId] || tabId),
        filtros_aplicados: [
            { filtro: "Periodo", valor: params.rangeLabel },
            { filtro: "Fecha inicio", valor: cleanText(params.filters?.startDate) || "Derivada del periodo del dashboard" },
            { filtro: "Fecha fin", valor: cleanText(params.filters?.endDate) || "Derivada del periodo del dashboard" },
            {
                filtro: "Canales / inboxes",
                valor: Array.isArray(params.filters?.selectedInboxes) && params.filters.selectedInboxes.length > 0
                    ? params.filters.selectedInboxes.join(", ")
                    : "Todos los canales",
            },
            { filtro: "Contexto empresarial", valor: cleanText(params.companyContext) ? "Configurado y aplicado al prompt" : "No configurado" },
        ],
        contexto_empresarial: cleanText(params.companyContext) || "No se configuró contexto empresarial.",
        data_availability: availability,
        resumen_base: {
            leads: details.length,
            ventas_detectadas: sales.length,
            citas_detectadas: appointments.length,
            seguimiento_detectado: followups.length,
            sql_detectados: sqls.length,
            no_calificados: unqualified.length,
            monto_total_detectado: Number(totalRevenue.toFixed(2)),
            ticket_promedio_detectado: sales.length > 0 ? Number((totalRevenue / sales.length).toFixed(2)) : null,
            leads_con_puntaje: scored.length,
            puntaje_promedio: averageScore,
            cambios_comerciales_relevantes: params.auditEvents.length,
            leads_sin_contactar: unanswered,
            leads_contactados: contacted,
            tasa_contactabilidad: details.length > 0 ? Number(((contacted / details.length) * 100).toFixed(1)) : 0,
            tiempo_promedio_primer_contacto_segundos: averageFirstResponse,
            muestras_primer_contacto: firstResponseSamples.length,
        },
        distribucion_por_etapa: groupCount(details, "etapa"),
        distribucion_por_canal: groupCount(details, "canal"),
        distribucion_por_responsable: groupCount(details, "responsable"),
        distribucion_por_campana: groupCount(details, "campana"),
        distribucion_por_calidad: groupCount(details, "nivel"),
        distribucion_por_estado: groupCount(details, "estado"),
        distribucion_por_dia: groupByDate(details),
        detalle: details,
        detalle_muestra: details.slice(0, 40),
        nota_recorte: details.length > 40
            ? `Se entrega una muestra de 40 filas para el análisis narrativo. Los archivos finales usan las ${details.length} filas filtradas.`
            : "La muestra de análisis incluye todo el universo filtrado.",
    };
};

const promptDataset = (dataset: AiReportDataset) => ({
    reporte: dataset.reporte,
    formato_solicitado: dataset.formato_solicitado,
    periodo: dataset.periodo,
    pestanas_incluidas: dataset.pestanas_incluidas,
    filtros_aplicados: dataset.filtros_aplicados,
    disponibilidad_datos: dataset.data_availability,
    resumen_base: dataset.resumen_base,
    distribucion_por_etapa: dataset.distribucion_por_etapa,
    distribucion_por_canal: dataset.distribucion_por_canal,
    distribucion_por_responsable: dataset.distribucion_por_responsable,
    distribucion_por_campana: dataset.distribucion_por_campana,
    distribucion_por_calidad: dataset.distribucion_por_calidad,
    distribucion_por_estado: dataset.distribucion_por_estado,
    distribucion_por_dia: dataset.distribucion_por_dia,
    detalle_muestra: dataset.detalle_muestra,
    nota_recorte: dataset.nota_recorte,
});

export const composeAiReportPrompt = (params: {
    profile: AiReportProfile;
    format: ReportFormat;
    companyContext?: string;
    rangeLabel: string;
    dataset: unknown;
}) => {
    const promptTemplate = cleanText(getAiReportPromptTemplate(params.profile.key)) || [
        `Usa la estructura del reporte ${params.profile.label}.`,
        `Prompt fuente esperado: ${params.profile.promptFileName}.`,
    ].join("\n");

    return [
        "INSTRUCCIÓN BASE OBLIGATORIA",
        "Usa únicamente la información entregada. No inventes métricas, porcentajes, nombres, resultados ni causas. Si falta información, decláralo como limitación. Distingue datos observados, inferencias y recomendaciones.",
        "",
        "CONTEXTO EMPRESARIAL",
        cleanText(params.companyContext) || "No se configuró contexto empresarial. Indica esta limitación y adapta el análisis solo a los datos disponibles.",
        "",
        "BLUEPRINT DEL REPORTE DERIVADO DEL TXT",
        promptTemplate,
        "",
        "PERIODO Y FORMATO",
        `Periodo analizado: ${params.rangeLabel}`,
        `Formato final requerido: ${params.format}`,
        `Pestañas base: ${params.profile.tabIds.map((tabId) => TAB_LABELS[tabId] || tabId).join(", ")}`,
        "",
        "DATOS ESENCIALES FILTRADOS",
        JSON.stringify(params.dataset, null, 2),
        "",
        "FORMATO DE RESPUESTA PARA EL SISTEMA",
        "Devuelve JSON estricto y compacto con title, executiveSummary, insights, risks, recommendations y tables. No devuelvas filas completas del Excel/CSV; el backend construye archivos con la data real. Limita el texto a lo accionable.",
    ].join("\n");
};

const extractResponseText = (body: Record<string, unknown>) => {
    const direct = cleanText(body.output_text);
    if (direct) return direct;

    const output = Array.isArray(body.output) ? body.output : [];
    for (const item of output) {
        const content = Array.isArray(asRecord(item).content) ? asRecord(item).content as unknown[] : [];
        for (const contentItem of content) {
            const record = asRecord(contentItem);
            const text = cleanText(record.text);
            if (text) return text;
        }
    }

    return "";
};

export const openAiReportStatus = (body: Record<string, unknown>) => cleanText(body.status);

export const isOpenAiReportPending = (body: Record<string, unknown>) => {
    const status = openAiReportStatus(body);
    return status === "queued" || status === "in_progress";
};

export const isOpenAiReportTruncatedButUsable = (body: Record<string, unknown>) => {
    const status = openAiReportStatus(body);
    const incompleteReason = cleanText(asRecord(body.incomplete_details).reason);
    return status === "incomplete" && incompleteReason === "max_output_tokens";
};

export const isOpenAiReportFailed = (body: Record<string, unknown>) => {
    const status = openAiReportStatus(body);
    return status === "failed" || status === "cancelled" || (status === "incomplete" && !isOpenAiReportTruncatedButUsable(body));
};

const stringifyForMessage = (value: unknown) => {
    const text = cleanText(value);
    if (!value || (typeof value !== "object" && text !== "[object Object]")) return text;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

export const openAiReportErrorMessage = (body: Record<string, unknown>) => {
    const incomplete = asRecord(body.incomplete_details);
    const incompleteReason = cleanText(incomplete.reason);
    if (incompleteReason === "max_output_tokens") {
        return "La lectura narrativa llegó al límite de salida, pero el archivo se construirá completo con la data disponible.";
    }

    const error = asRecord(body.error);
    const message = cleanText(error.message || error.code) || stringifyForMessage(body.error);
    const details = stringifyForMessage(body.incomplete_details || body.details);
    return message || details || incompleteReason;
};

export const formatAiReportError = (error: unknown, details?: unknown) => {
    const message = error instanceof Error ? error.message : stringifyForMessage(error);
    const detailsText = stringifyForMessage(details);
    if (message && message !== "[object Object]") return message;
    return detailsText || "No se pudo completar el reporte IA.";
};

const emptyNarrative = (fallbackTitle: string): AiReportNarrative => ({
    title: fallbackTitle,
    executiveSummary: [],
    insights: [],
    risks: [],
    recommendations: [],
    tables: [],
});

const normalizeAiReport = (value: unknown, fallbackTitle: string): AiReportNarrative => {
    const record = asRecord(value);
    const insights = Array.isArray(record.insights)
        ? record.insights.map((item) => {
            const source = asRecord(item);
            return {
                title: cleanText(source.title) || "Insight",
                evidence: cleanText(source.evidence),
                impact: cleanText(source.impact),
                recommendation: cleanText(source.recommendation),
                priority: cleanText(source.priority) || "Media",
            };
        }).filter((item) => item.title || item.evidence || item.recommendation)
        : [];

    const recommendations = Array.isArray(record.recommendations)
        ? record.recommendations.map((item) => {
            const source = asRecord(item);
            return {
                action: cleanText(source.action),
                owner: cleanText(source.owner) || "Equipo comercial",
                priority: cleanText(source.priority) || "Media",
                rationale: cleanText(source.rationale),
            };
        }).filter((item) => item.action)
        : [];

    const tables = Array.isArray(record.tables)
        ? record.tables.map((table) => {
            const source = asRecord(table);
            return {
                name: cleanText(source.name) || "Tabla IA",
                columns: Array.isArray(source.columns) ? source.columns.map(cleanText).filter(Boolean) : [],
                rows: Array.isArray(source.rows)
                    ? source.rows.map((row) => Array.isArray(row) ? row.map(cleanText) : [cleanText(row)]).filter((row) => row.length > 0)
                    : [],
            };
        }).filter((table) => table.columns.length > 0)
        : [];

    return {
        title: cleanText(record.title) || fallbackTitle,
        executiveSummary: Array.isArray(record.executiveSummary)
            ? record.executiveSummary.map(cleanText).filter(Boolean)
            : Array.isArray(record.summary)
                ? record.summary.map(cleanText).filter(Boolean)
                : [],
        insights,
        risks: Array.isArray(record.risks) ? record.risks.map(cleanText).filter(Boolean) : [],
        recommendations,
        tables,
    };
};

const parseOpenAiReport = (body: Record<string, unknown>, fallbackTitle: string) => {
    const status = openAiReportStatus(body);
    if (isOpenAiReportPending(body)) {
        throw new Error("El reporte IA sigue en proceso.");
    }
    if (isOpenAiReportFailed(body)) {
        throw new Error(openAiReportErrorMessage(body) || `OpenAI terminó el reporte con estado ${status}.`);
    }

    const text = extractResponseText(body);
    if (!text) return emptyNarrative(fallbackTitle);

    try {
        return normalizeAiReport(JSON.parse(text), fallbackTitle);
    } catch {
        return normalizeAiReport({
            title: fallbackTitle,
            executiveSummary: [text],
            insights: [],
            risks: [],
            recommendations: [],
            tables: [],
        }, fallbackTitle);
    }
};

const openAiRequestTimeout = (timeoutMs: number, label: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const onAbortError = (error: unknown) => {
        if (cleanText(asRecord(error).name) === "AbortError" || (error instanceof Error && error.name === "AbortError")) {
            throw new Error(label);
        }
        throw error;
    };
    return { controller, timeoutId, onAbortError };
};

export const createOpenAiReportResponse = async (params: {
    apiKey: string;
    model: string;
    prompt: string;
    background?: boolean;
}) => {
    const timeoutMs = Number(getEnv(params.background ? "OPENAI_REPORT_START_TIMEOUT_MS" : "OPENAI_REPORT_TIMEOUT_MS") || (params.background ? DEFAULT_OPENAI_START_TIMEOUT_MS : DEFAULT_OPENAI_TIMEOUT_MS));
    const maxOutputTokens = Number(getEnv("OPENAI_REPORT_MAX_OUTPUT_TOKENS") || DEFAULT_MAX_OUTPUT_TOKENS);
    const reasoningEffort = resolveOpenAiReportReasoningEffort();
    const { controller, timeoutId, onAbortError } = openAiRequestTimeout(
        Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_OPENAI_TIMEOUT_MS,
        params.background
            ? "No se pudo iniciar el reporte IA a tiempo. Intenta nuevamente."
            : "OpenAI tardó demasiado generando el reporte. Intenta nuevamente o reduce el rango de fechas.",
    );

    const response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
            Authorization: `Bearer ${params.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: params.model,
            input: [
                {
                    role: "system",
                    content: "Eres un analista senior de revenue operations. Generas análisis ejecutivos compactos en español, basados solo en datos entregados y con salida JSON estricta.",
                },
                { role: "user", content: params.prompt },
            ],
            reasoning: { effort: reasoningEffort },
            text: {
                format: {
                    type: "json_schema",
                    name: "simplia_ai_report_narrative",
                    strict: true,
                    schema: OUTPUT_SCHEMA,
                },
            },
            max_output_tokens: Number.isFinite(maxOutputTokens) ? maxOutputTokens : DEFAULT_MAX_OUTPUT_TOKENS,
            background: Boolean(params.background),
            store: Boolean(params.background) || undefined,
        }),
    }).catch(onAbortError).finally(() => clearTimeout(timeoutId));

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`OpenAI ${response.status}: ${formatAiReportError(body)}`);
    }

    return asRecord(body);
};

export const retrieveOpenAiReportResponse = async (params: {
    apiKey: string;
    responseId: string;
}) => {
    const { controller, timeoutId, onAbortError } = openAiRequestTimeout(
        30_000,
        "No se pudo consultar el estado del reporte IA. Intenta nuevamente.",
    );
    const response = await fetch(`${OPENAI_RESPONSES_URL}/${encodeURIComponent(params.responseId)}`, {
        method: "GET",
        signal: controller.signal,
        headers: {
            Authorization: `Bearer ${params.apiKey}`,
            "Content-Type": "application/json",
        },
    }).catch(onAbortError).finally(() => clearTimeout(timeoutId));

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`OpenAI ${response.status}: ${formatAiReportError(body)}`);
    }
    return asRecord(body);
};

const safeFilePart = (value: string) =>
    cleanText(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase() || "reporte";

const htmlEscape = (value: unknown) => cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const csvEscape = (value: unknown) => {
    const text = cellText(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
};

const cellText = (value: unknown) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return stringifyForMessage(value);
    return cleanText(value);
};

const numberText = (value: unknown) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toLocaleString("es-EC", { maximumFractionDigits: 2 }) : cellText(value);
};

const pct = (value: number, total: number) => total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "0%";

const durationText = (seconds: number | null) => {
    if (seconds === null || !Number.isFinite(seconds)) return "";
    if (seconds < 60) return `${Math.round(seconds)} seg`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Number((minutes / 60).toFixed(1));
    return `${hours} h`;
};

const filterRows = (dataset: AiReportDataset) => [
    { Campo: "Reporte", Valor: dataset.reporte },
    { Campo: "Formato", Valor: dataset.formato_solicitado.toUpperCase() },
    { Campo: "Pestañas incluidas", Valor: dataset.pestanas_incluidas.join(", ") },
    { Campo: "Total filas filtradas", Valor: dataset.resumen_base.leads },
    { Campo: "Generado", Valor: new Date().toLocaleString("es-EC", { timeZone: TIMEZONE }) },
    ...dataset.filtros_aplicados.map((item) => ({ Campo: item.filtro, Valor: item.valor })),
    { Campo: "Contexto empresarial aplicado", Valor: dataset.contexto_empresarial },
];

const chunkTextByWords = (value: unknown, maxLength = 96) => {
    const text = cellText(value).replace(/\s+/g, " ").trim();
    if (text.length <= maxLength) return text ? [text] : [""];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > maxLength) {
        const splitAt = remaining.lastIndexOf(" ", maxLength);
        const index = splitAt > Math.floor(maxLength * 0.45) ? splitAt : maxLength;
        chunks.push(remaining.slice(0, index).trim());
        remaining = remaining.slice(index).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
};

const readableFilterRows = (dataset: AiReportDataset) =>
    filterRows(dataset).flatMap((row) => {
        const chunks = chunkTextByWords(row.Valor, 90);
        if (chunks.length <= 1) return [{ Campo: row.Campo, Valor: chunks[0] || "" }];
        return chunks.map((chunk, index) => ({
            Campo: `${row.Campo} ${index + 1}`,
            Valor: chunk,
        }));
    });

const alertLevel = (value: number, high = 0.35, medium = 0.15) => {
    if (value >= high) return "Alerta Alta";
    if (value >= medium) return "Alerta Media";
    return "Baja";
};

const limitRows = (dataset: AiReportDataset) => {
    const rows = dataset.data_availability
        .filter((item) => !item.available)
        .map((item) => ({
            "Limitación detectada": item.label,
            "Impacto en el análisis": item.reason,
            "Recomendación para mejorar la captura de datos": `Capturar al menos uno de estos campos: ${item.fields.slice(0, 5).join(", ")}.`,
        }));
    if (!cleanText(dataset.contexto_empresarial) || dataset.contexto_empresarial === "No se configuró contexto empresarial.") {
        rows.unshift({
            "Limitación detectada": "Contexto empresarial",
            "Impacto en el análisis": "No se configuró contexto empresarial; las recomendaciones por industria, ICP y oferta pierden precisión.",
            "Recomendación para mejorar la captura de datos": "Completar nombre de empresa, industria, mercado, ICP, oferta, canales, objetivos y ciclo comercial.",
        });
    }
    return rows.length > 0 ? rows : [{
        "Limitación detectada": "Sin limitaciones críticas detectadas",
        "Impacto en el análisis": "Las métricas principales se calcularon con la data filtrada disponible.",
        "Recomendación para mejorar la captura de datos": "Mantener consistencia de campos, campañas, responsables y estados comerciales.",
    }];
};

const topDistribution = (items: Array<{ label: string; value: number }>, fallback = "sin dato dominante") =>
    items.length > 0 ? `${items[0].label} (${items[0].value})` : fallback;

const deterministicExecutiveSummary = (dataset: AiReportDataset) => {
    const base = dataset.resumen_base;
    const lowQuality = dataset.distribucion_por_calidad.find((item) => item.label === "Baja calidad")?.value || 0;
    return [
        `Durante el periodo ${dataset.periodo} se analizaron ${base.leads} leads, con ${base.sql_detectados} SQL, ${base.citas_detectadas} citas y ${base.ventas_detectadas} ventas detectadas.`,
        `La contactabilidad observada es ${base.tasa_contactabilidad}%: ${base.leads_contactados} leads aparecen atendidos y ${base.leads_sin_contactar} requieren respuesta o revisión de seguimiento.`,
        `El canal con mayor volumen es ${topDistribution(dataset.distribucion_por_canal)} y la campaña principal es ${topDistribution(dataset.distribucion_por_campana)}.`,
        `La calidad baja concentra ${lowQuality} leads; esto sugiere revisar origen, mensaje, formulario y criterios de calificación antes de escalar inversión.`,
        "La prioridad del siguiente periodo es ordenar trazabilidad de contacto, reforzar seguimiento y mejorar calidad de entrada para aumentar conversión.",
    ];
};

const deterministicConclusion = (dataset: AiReportDataset) => {
    const base = dataset.resumen_base;
    return `El periodo muestra ${base.leads} leads con ${base.tasa_contactabilidad}% de contactabilidad observada, ${base.sql_detectados} SQL, ${base.citas_detectadas} citas y ${base.ventas_detectadas} ventas detectadas. La prioridad gerencial es mejorar la calidad de entrada y asegurar seguimiento oportuno de los ${base.leads_sin_contactar} leads que aún requieren respuesta o revisión. El siguiente paso recomendado es ordenar responsables, campañas y señales de contacto para que la operación pueda priorizar leads con mayor intención y reducir pérdida de oportunidades.`;
};

const summaryRows = (dataset: AiReportDataset, narrative: AiReportNarrative) => {
    const base = dataset.resumen_base;
    return [
        {
            "Métrica": "Leads totales",
            Resultado: base.leads,
            "Interpretación": "Volumen total filtrado para el periodo.",
            "Nivel de alerta": base.leads === 0 ? "Alerta Alta" : "Baja",
            "Recomendación ejecutiva": base.leads === 0 ? "Revisar filtros o sincronización de datos." : "Mantener monitoreo por canal y etapa.",
        },
        {
            "Métrica": "Ventas detectadas",
            Resultado: base.ventas_detectadas,
            "Interpretación": "Cierres identificados por etiquetas/etapas disponibles.",
            "Nivel de alerta": base.ventas_detectadas === 0 && base.leads > 0 ? "Alerta Alta" : "Media",
            "Recomendación ejecutiva": base.ventas_detectadas === 0 ? "Auditar cierre, seguimiento y registro de ventas." : "Analizar patrones de los cierres para replicarlos.",
        },
        {
            "Métrica": "Calidad baja",
            Resultado: `${dataset.distribucion_por_calidad.find((item) => item.label === "Baja calidad")?.value || 0} leads`,
            "Interpretación": "Proporción de leads con score bajo según data disponible.",
            "Nivel de alerta": alertLevel((dataset.distribucion_por_calidad.find((item) => item.label === "Baja calidad")?.value || 0) / Math.max(1, base.leads)),
            "Recomendación ejecutiva": "Revisar origen, campaña, formulario y criterio de calificación.",
        },
        {
            "Métrica": "Lectura ejecutiva",
            Resultado: narrative.executiveSummary[0] || deterministicExecutiveSummary(dataset)[0],
            "Interpretación": "Lectura ejecutiva derivada del contexto empresarial y datos filtrados.",
            "Nivel de alerta": "Media",
            "Recomendación ejecutiva": narrative.recommendations[0]?.action || "Priorizar las acciones con evidencia más fuerte.",
        },
    ];
};

const kpiRows = (dataset: AiReportDataset) => {
    const base = dataset.resumen_base;
    const callsAvailable = Boolean(dataset.data_availability.find((item) => item.key === "calls")?.available);
    const callResultAvailable = Boolean(dataset.data_availability.find((item) => item.key === "call_result")?.available);
    const callAttempts = dataset.detalle
        .map((row) => parseAmount(row.intentos_llamada))
        .filter((value) => value > 0);
    const totalCallAttempts = callAttempts.reduce((sum, value) => sum + value, 0);
    const effectiveCallResults = dataset.detalle.filter((row) => cleanText(row.resultado_llamada)).length;
    const firstContactStatus = base.muestras_primer_contacto > 0
        ? `Calculado con ${base.muestras_primer_contacto} conversaciones con primera respuesta registrada.`
        : "Todavía no se mide velocidad de primer contacto porque falta registrar la primera respuesta comercial.";
    const assignees = dataset.distribucion_por_responsable.filter((item) => !item.label.startsWith("Sin responsable")).length;
    const rows: Array<Record<string, unknown>> = [
        { KPI: "Leads totales", Valor: base.leads, "Fórmula usada": "Conteo de leads filtrados", "Benchmark sugerido": "Depende del plan comercial", Estado: "Observado", Comentario: "Dato disponible en conversaciones filtradas." },
        { KPI: "Leads contactados", Valor: base.leads_contactados, "Fórmula usada": "Leads totales - leads sin contactar", "Benchmark sugerido": "> 60% referencial", Estado: "Derivado del dashboard", Comentario: "Se considera contactado cuando la conversación no queda pendiente de respuesta del equipo comercial." },
        { KPI: "Tasa de contactabilidad", Valor: `${base.tasa_contactabilidad}%`, "Fórmula usada": "Leads contactados / leads totales", "Benchmark sugerido": "Depende del canal", Estado: "Derivado del dashboard", Comentario: "Calculado con la misma señal de conversación usada para detectar leads pendientes de respuesta." },
        { KPI: "Leads sin contactar", Valor: base.leads_sin_contactar, "Fórmula usada": "Conversaciones pendientes de primera respuesta o revisión", "Benchmark sugerido": "Menor posible", Estado: "Derivado del dashboard", Comentario: "Representa conversaciones que requieren gestión o revisión de respuesta." },
        { KPI: "Tiempo promedio a primer contacto", Valor: base.tiempo_promedio_primer_contacto_segundos !== null ? durationText(base.tiempo_promedio_primer_contacto_segundos) : "Pendiente de medición", "Fórmula usada": "Diferencia entre ingreso del lead y primera respuesta registrada", "Benchmark sugerido": "< 5 min ideal", Estado: base.muestras_primer_contacto > 0 ? "Observado" : "Por integrar", Comentario: firstContactStatus },
    ];

    if (callsAvailable) {
        rows.push(
            { KPI: "Intentos promedio por lead", Valor: totalCallAttempts > 0 ? Number((totalCallAttempts / Math.max(1, base.leads)).toFixed(2)) : "Pendiente de normalización", "Fórmula usada": "Intentos totales / leads", "Benchmark sugerido": "2 a 4 intentos", Estado: totalCallAttempts > 0 ? "Observado" : "Por completar", Comentario: totalCallAttempts > 0 ? "Calculado desde campos de intentos registrados." : "Existen campos de intentos, pero no tienen valores numéricos consolidados." },
            { KPI: "Llamadas totales", Valor: totalCallAttempts > 0 ? totalCallAttempts : "Pendiente de normalización", "Fórmula usada": "Suma de intentos o llamadas registradas", "Benchmark sugerido": "Depende de dotación", Estado: totalCallAttempts > 0 ? "Observado" : "Por completar", Comentario: totalCallAttempts > 0 ? "Calculado desde la data de intentos disponible." : "Existen campos de llamadas, pero falta registrar valores numéricos." },
        );
    }
    if (callResultAvailable) {
        rows.push({ KPI: "Llamadas efectivas", Valor: effectiveCallResults, "Fórmula usada": "Leads con resultado de llamada/contacto registrado", "Benchmark sugerido": "Depende del canal", Estado: "Observado", Comentario: "Calculado desde resultados de llamada/contacto disponibles en la data." });
    }

    rows.push(
        { KPI: "Tasa de conversión a cita", Valor: pct(base.citas_detectadas, base.leads), "Fórmula usada": "Citas / Leads totales", "Benchmark sugerido": "Depende del canal", Estado: "Observado", Comentario: "Calculado por etapa/etiqueta detectada." },
        { KPI: "Tasa de conversión a SQL", Valor: pct(base.sql_detectados, base.leads), "Fórmula usada": "SQL / Leads totales", "Benchmark sugerido": "Depende del canal", Estado: "Observado", Comentario: "Calculado por etapa/etiqueta detectada." },
        { KPI: "Tasa de conversión a venta", Valor: pct(base.ventas_detectadas, base.leads), "Fórmula usada": "Ventas / Leads totales", "Benchmark sugerido": "Depende del ticket", Estado: "Observado", Comentario: "Calculado por etapa/etiqueta detectada." },
        { KPI: "Leads en seguimiento", Valor: base.seguimiento_detectado, "Fórmula usada": "Leads en etapa/etiqueta de seguimiento", "Benchmark sugerido": "Revisar capacidad diaria", Estado: "Observado", Comentario: "Calculado por etapa comercial y etiquetas disponibles." },
        { KPI: "Carga promedio por asesor", Valor: assignees > 0 ? Number((base.leads / assignees).toFixed(2)) : "Pendiente de asignación", "Fórmula usada": "Leads / responsables con data", "Benchmark sugerido": "Equilibrio entre asesores", Estado: assignees > 0 ? "Observado" : "Por completar", Comentario: assignees > 0 ? "Calculado con responsables detectados." : "Para activar este KPI se debe asignar responsable o asesor a los leads." },
    );

    return rows;
};

const groupRows = (items: Array<{ label: string; value: number }>, labelName = "Categoría") =>
    items.map((item) => ({ [labelName]: item.label, Total: item.value }));

const groupDetails = (rows: DetailRow[], getKey: (row: DetailRow) => string) => {
    const groups = new Map<string, DetailRow[]>();
    rows.forEach((row) => {
        const key = cleanText(getKey(row)) || "Sin dato registrado";
        groups.set(key, [...(groups.get(key) || []), row]);
    });
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
};

const advisorRows = (dataset: AiReportDataset) =>
    groupDetails(dataset.detalle, (row) => row.responsable).map(([advisor, rows]) => {
        const citas = rows.filter((row) => row.etapa === "Cita").length;
        const sqls = rows.filter((row) => row.etapa === "SQL").length;
        const ventas = rows.filter((row) => row.etapa === "Venta").length;
        const sinRespuesta = rows.filter((row) => row.sin_respuesta).length;
        const contactados = Math.max(0, rows.length - sinRespuesta);
        return {
            Asesor: advisor,
            "Leads asignados": rows.length,
            "Leads contactados": contactados,
            "Llamadas realizadas": availabilityReason(dataset, "calls", "Requiere integración o registro de llamadas."),
            "Intentos promedio": availabilityReason(dataset, "calls", "Requiere integración o registro de intentos."),
            Contactabilidad: pct(contactados, rows.length),
            "Citas agendadas": citas,
            "SQLs generados": sqls,
            "Ventas cerradas": ventas,
            Conversión: pct(ventas, rows.length),
            Diagnóstico: ventas > 0 ? "Tiene cierres detectados; revisar prácticas replicables." : "Sin ventas detectadas en el periodo filtrado.",
            Recomendación: rows.length > dataset.resumen_base.leads / Math.max(1, dataset.distribucion_por_responsable.length) * 1.5 ? "Redistribuir carga o crear respaldo operativo." : "Mantener seguimiento y medir SLA de contacto.",
        };
    });

const channelCampaignRows = (dataset: AiReportDataset) =>
    groupDetails(dataset.detalle, (row) => `${row.canal} / ${row.campana}`).map(([label, rows]) => {
        const alta = rows.filter((row) => row.nivel === "Alta calidad").length;
        const baja = rows.filter((row) => row.nivel === "Baja calidad").length;
        const ventas = rows.filter((row) => row.etapa === "Venta").length;
        const contactados = rows.filter((row) => !row.sin_respuesta).length;
        return {
            "Canal / Campaña": label,
            "Leads recibidos": rows.length,
            "% del total": pct(rows.length, dataset.resumen_base.leads),
            Contactabilidad: pct(contactados, rows.length),
            "Conversión a cita": pct(rows.filter((row) => row.etapa === "Cita").length, rows.length),
            "Conversión a SQL": pct(rows.filter((row) => row.etapa === "SQL").length, rows.length),
            "Conversión a venta": pct(ventas, rows.length),
            "Calidad estimada": alta >= baja ? "Media/Alta según score disponible" : "Baja según score disponible",
            "Problema detectado": baja > alta ? "Alta proporción de leads de baja calidad." : "Revisar escalabilidad y consistencia de conversión.",
            Recomendación: ventas > 0 ? "Analizar mensajes y segmentación que generaron cierres." : "Ajustar calificación, campaña o cadencia de seguimiento.",
        };
    });

const insightsRows = (narrative: AiReportNarrative) =>
    narrative.insights.length > 0
        ? narrative.insights.map((insight) => ({
            Insight: insight.title,
            "Evidencia numérica": insight.evidence,
            "Impacto comercial": insight.impact,
            "Causa probable": insight.impact || "Inferencia basada en el patrón observado.",
            "Acción recomendada": insight.recommendation,
            Prioridad: insight.priority,
            "Responsable sugerido": "Gerencia comercial / supervisor",
        }))
        : [{ Insight: "Lectura ejecutiva pendiente de enriquecer", "Evidencia numérica": "Se generaron KPIs determinísticos con la data filtrada.", "Impacto comercial": "El reporte conserva la lectura operativa aunque falte narrativa adicional.", "Causa probable": "Narrativa externa incompleta", "Acción recomendada": "Revisar KPIs observados y completar datos operativos críticos.", Prioridad: "Media", "Responsable sugerido": "Administrador" }];

const recommendationRows = (narrative: AiReportNarrative) =>
    narrative.recommendations.length > 0
        ? narrative.recommendations.map((item) => ({
            Accion: item.action,
            Responsable: item.owner,
            Prioridad: item.priority,
            Justificacion: item.rationale,
        }))
        : [{ Accion: "Priorizar revisión de contactabilidad, calidad y seguimiento", Responsable: "Gerencia comercial", Prioridad: "Alta", Justificacion: "Las recomendaciones deben partir de los KPIs observados y de las brechas de datos operativos." }];

const risksRows = (narrative: AiReportNarrative) =>
    narrative.risks.length > 0
        ? narrative.risks.map((risk, index) => ({ Riesgo: index + 1, Detalle: risk }))
        : [{ Riesgo: "Riesgo operativo", Detalle: "Si no se corrige la trazabilidad de contacto y seguimiento, la gerencia tendrá menos visibilidad para priorizar leads, asesores y campañas." }];

const callRecommendationRows = (dataset: AiReportDataset) => [
    {
        Situación: "Primer contacto",
        "Problema detectado": availabilityReason(dataset, "first_contact", "No se puede medir velocidad de respuesta con la data actual."),
        "Recomendación operativa": "Capturar fecha/hora de primera llamada y medir SLA por asesor.",
        "Guion sugerido": "Hola, soy del equipo comercial. Vi tu solicitud y quiero ayudarte a avanzar con la opción más adecuada.",
        "Objetivo de la llamada": "Contactar rápido, validar necesidad y mover a cita o siguiente paso.",
        Prioridad: "Alta",
    },
    {
        Situación: "Leads de baja calidad",
        "Problema detectado": `${dataset.distribucion_por_calidad.find((item) => item.label === "Baja calidad")?.value || 0} leads clasificados como baja calidad.`,
        "Recomendación operativa": "Crear cadencia separada para leads fríos y priorizar leads con score alto o etapa SQL/Cita.",
        "Guion sugerido": "Para recomendarte bien, necesito validar dos datos rápidos sobre tu necesidad y tiempos.",
        "Objetivo de la llamada": "Calificar antes de invertir más tiempo operativo.",
        Prioridad: "Media",
    },
];

const leadRecommendationRows = (dataset: AiReportDataset) => dataset.detalle
    .filter((row) => row.etapa === "Seguimiento" || row.nivel === "Alta calidad" || row.responsable.startsWith("Sin responsable"))
    .slice(0, 80)
    .map((row) => ({
        "ID Lead": row.id,
        Asesor: row.responsable,
        "Estado actual": `${row.estado} / ${row.etapa}`,
        "Problema / oportunidad": row.responsable.startsWith("Sin responsable") ? "Lead sin responsable asignado." : row.nivel === "Alta calidad" ? "Lead de alta calidad con potencial." : "Lead en seguimiento.",
        "Acción sugerida": row.responsable.startsWith("Sin responsable") ? "Asignar responsable y definir próxima acción." : "Priorizar gestión y documentar resultado.",
        Urgencia: row.nivel === "Alta calidad" ? "Alta" : "Media",
        "Razón de priorización": `${row.nivel}; canal ${row.canal}; campaña ${row.campana}.`,
    }));

const planRows = (narrative: AiReportNarrative) =>
    recommendationRows(narrative).slice(0, 10).map((row) => ({
        Acción: row.Accion,
        "Responsable sugerido": row.Responsable,
        Prioridad: row.Prioridad,
        "Impacto esperado": row.Justificacion,
        Dificultad: row.Prioridad === "Alta" ? "Media" : "Baja",
        "Plazo sugerido": row.Prioridad === "Alta" ? "7 días" : "30 días",
        "KPI afectado": "Conversión / contactabilidad / calidad",
    }));

const marketingCampaignRows = (dataset: AiReportDataset) =>
    groupDetails(dataset.detalle, (row) => row.campana).map(([campaign, rows]) => {
        const scored = rows.filter((row) => row.puntaje !== "");
        const avgScore = scored.length > 0 ? Number((scored.reduce((sum, row) => sum + Number(row.puntaje || 0), 0) / scored.length).toFixed(2)) : "";
        const high = rows.filter((row) => row.nivel === "Alta calidad").length;
        const low = rows.filter((row) => row.nivel === "Baja calidad").length;
        return {
            Campaña: campaign,
            Leads: rows.length,
            "Score promedio": avgScore || availabilityReason(dataset, "score", "Para medir score por campaña se debe registrar una calificación por lead."),
            "% Alta calidad": pct(high, rows.length),
            "% Baja calidad": pct(low, rows.length),
            Diagnóstico: low > high ? "Genera volumen con baja calidad relativa." : "Tiene señales de calidad aprovechables.",
            "Acción recomendada": low > high ? "Revisar segmentación, copy, landing y filtros del formulario." : "Escalar con control de conversión y feedback comercial.",
        };
    });

const marketingChannelRows = (dataset: AiReportDataset) =>
    groupDetails(dataset.detalle, (row) => row.canal).map(([channel, rows]) => {
        const high = rows.filter((row) => row.nivel === "Alta calidad").length;
        const low = rows.filter((row) => row.nivel === "Baja calidad").length;
        return {
            Canal: channel,
            Leads: rows.length,
            "% del total": pct(rows.length, dataset.resumen_base.leads),
            "Alta calidad": high,
            "Baja calidad": low,
            Diagnóstico: high >= low ? "Canal con calidad defendible según score disponible." : "Canal con riesgo de atraer leads poco calificados.",
            Recomendación: high >= low ? "Mantener y medir costo por lead calificado." : "Ajustar audiencia, mensaje o criterio de entrada.",
        };
    });

const detailRowsForExport = (dataset: AiReportDataset) => dataset.detalle.map((row) => ({
    ID: row.id,
    Nombre: row.nombre,
    Telefono: row.telefono,
    Correo: row.correo,
    Canal: row.canal,
    Campana: row.campana,
    Ciudad: row.ciudad,
    Responsable: row.responsable,
    Estado: row.estado,
    Etapa: row.etapa,
    Etiquetas: row.etiquetas,
    Puntaje: row.puntaje,
    Calidad: row.nivel,
    Monto: row.monto,
    "Fecha ingreso": row.fecha_ingreso,
    "Ultima interaccion": row.ultima_interaccion,
    "Intentos llamada": row.intentos_llamada || availabilityReason(dataset, "calls", "Para ver intentos por lead se debe registrar la gestión telefónica o de contacto."),
    "Fecha primera llamada": row.fecha_primera_llamada || availabilityReason(dataset, "first_contact", "Para ver primera llamada se debe registrar la primera gestión de contacto."),
    "Tiempo primer contacto": row.tiempo_primer_contacto || availabilityReason(dataset, "first_contact", "Para medir velocidad de contacto se debe registrar ingreso del lead y primera respuesta."),
    "Resultado llamada": row.resultado_llamada || availabilityReason(dataset, "call_result", "Para medir resultado de contacto se debe registrar si la llamada fue efectiva, no contestada u otro resultado."),
    "Duracion llamada": row.duracion_llamada || availabilityReason(dataset, "calls", "Para medir duración se requiere integración o registro de llamadas."),
    "Proxima accion": row.proxima_accion || availabilityReason(dataset, "next_action", "Para controlar seguimiento se debe registrar próxima acción o fecha de gestión."),
    Observaciones: row.observaciones || availabilityReason(dataset, "observations", "Para enriquecer la lectura comercial se deben registrar notas u observaciones del asesor."),
    "Motivo perdida": row.motivo_perdida || availabilityReason(dataset, "loss_reason", "Para explicar pérdidas se debe registrar motivo de pérdida o descalificación."),
    "Producto interes": row.producto_interes || "No aplica: no se registró producto de interés en este lead.",
    "Origen dato": row.origen_dato,
}));

const objectSheet = (
    name: string,
    rows: Record<string, unknown>[],
    options: Pick<AiReportSheet, "kind" | "autoFilter" | "headerStyle" | "wrapText"> = {},
): AiReportSheet => {
    const safeRows = rows.length > 0 ? rows : [{ Nota: "No hay filas para esta sección con los filtros actuales." }];
    const columns = Array.from(new Set(safeRows.flatMap((row) => Object.keys(row))));
    return {
        name,
        columns,
        rows: safeRows.map((row) => columns.map((column) => cellText(row[column]))),
        kind: options.kind || "table",
        autoFilter: options.autoFilter ?? true,
        headerStyle: options.headerStyle ?? true,
        wrapText: options.wrapText ?? true,
    };
};

const metadataSheet = (dataset: AiReportDataset) =>
    objectSheet("00 Filtros aplicados", readableFilterRows(dataset), {
        kind: "metadata",
        autoFilter: false,
        headerStyle: false,
        wrapText: true,
    });

export const buildAiReportSheets = (params: {
    profileKey: CriticalProfileKey;
    dataset: AiReportDataset;
    narrative: AiReportNarrative;
}): AiReportSheet[] => {
    const { profileKey, dataset, narrative } = params;

    if (profileKey === "daily_operations") {
        return [
            metadataSheet(dataset),
            objectSheet("00 Resumen Ejecutivo", summaryRows(dataset, narrative)),
            objectSheet("01 KPIs Operativos", kpiRows(dataset)),
            objectSheet("02 Analisis por Asesor", advisorRows(dataset)),
            objectSheet("03 Canal Campana", channelCampaignRows(dataset)),
            objectSheet("04 Insights Accionables", insightsRows(narrative)),
            objectSheet("05 Recomendaciones Llamadas", callRecommendationRows(dataset)),
            objectSheet("06 Recomendaciones Leads", leadRecommendationRows(dataset)),
            objectSheet("07 Plan de Accion", planRows(narrative)),
            objectSheet("08 Limitaciones Data", limitRows(dataset)),
            objectSheet("99 Detalle Leads", detailRowsForExport(dataset)),
        ];
    }

    if (profileKey === "marketing_quality") {
        return [
            metadataSheet(dataset),
            objectSheet("00 Resumen Ejecutivo", summaryRows(dataset, narrative)),
            objectSheet("01 Diagnostico Calidad", [
                ...kpiRows(dataset),
                ...groupRows(dataset.distribucion_por_calidad, "Calidad"),
            ]),
            objectSheet("02 Campanas", marketingCampaignRows(dataset)),
            objectSheet("03 Canales", marketingChannelRows(dataset)),
            objectSheet("04 Causas Score", risksRows(narrative).map((row) => ({
                "Hallazgo en la data": row.Detalle,
                "Posible causa": "Inferencia analítica conectada a la data disponible.",
                "Impacto comercial": "Puede afectar calidad, costo y conversión.",
                "Recomendación concreta": narrative.recommendations[0]?.action || "Revisar segmentación, mensaje, formulario y feedback comercial.",
            }))),
            objectSheet("05 Que Funciona Bien", marketingChannelRows(dataset).filter((row) => Number(row["Alta calidad"]) >= Number(row["Baja calidad"]))),
            objectSheet("06 Recomendaciones Industria", recommendationRows(narrative).map((row) => ({
                Recomendación: row.Accion,
                "Justificación": row.Justificacion,
                "Responsable": row.Responsable,
                "Prioridad": row.Prioridad,
            }))),
            objectSheet("07 Plan Marketing", [
                ...planRows(narrative).map((row) => ({ ...row, Etapa: row.Prioridad === "Alta" ? "0 a 7 días" : "8 a 30 días" })),
                { Etapa: "31 a 90 días", Acción: "Rediseñar modelo de scoring y nutrir leads no calificados.", "Responsable sugerido": "Marketing + ventas", Prioridad: "Media", "Impacto esperado": "Mejorar calidad y trazabilidad", Dificultad: "Media", "Plazo sugerido": "90 días", "KPI afectado": "Score, SQL y venta" },
            ]),
            objectSheet("08 KPIs Recomendados", [
                { KPI: "Leads totales", "Qué mide": "Volumen de captación", "Por qué importa": "Base para evaluar escalabilidad", "Frecuencia recomendada": "Semanal" },
                { KPI: "% leads de alta calidad", "Qué mide": "Calidad del tráfico/campaña", "Por qué importa": "Evita optimizar solo volumen", "Frecuencia recomendada": "Semanal" },
                { KPI: "Score promedio por campaña", "Qué mide": "Calidad por campaña", "Por qué importa": "Permite mover presupuesto", "Frecuencia recomendada": "Semanal" },
                { KPI: "Conversión a SQL", "Qué mide": "Avance comercial", "Por qué importa": "Conecta marketing con ventas", "Frecuencia recomendada": "Semanal" },
                { KPI: "Tiempo promedio de respuesta", "Qué mide": "Velocidad comercial", "Por qué importa": availabilityReason(dataset, "first_contact", "Afecta contactabilidad y cierre."), "Frecuencia recomendada": "Diaria" },
            ]),
            objectSheet("09 Conclusion", [
                { Elemento: "Hallazgos principales", Detalle: narrative.executiveSummary.slice(0, 3).join(" | ") || "Se requiere revisar datos y volver a generar narrativa IA." },
                { Elemento: "Riesgos comerciales", Detalle: narrative.risks.slice(0, 3).join(" | ") || "Riesgo de baja calidad o trazabilidad incompleta." },
                { Elemento: "Decisiones recomendadas", Detalle: narrative.recommendations.slice(0, 3).map((item) => item.action).join(" | ") || "Revisar campañas, canales y scoring." },
                { Elemento: "Próximo paso", Detalle: narrative.recommendations[0]?.action || "Priorizar campañas/canales con mayor calidad observada." },
            ]),
            objectSheet("10 Limitaciones Data", limitRows(dataset)),
            objectSheet("99 Detalle Leads", detailRowsForExport(dataset)),
        ];
    }

    return [
        metadataSheet(dataset),
        objectSheet("00 Resumen Ejecutivo", summaryRows(dataset, narrative)),
        objectSheet("01 KPIs", kpiRows(dataset)),
        objectSheet("02 Funnel", groupRows(dataset.distribucion_por_etapa, "Etapa")),
        objectSheet("03 Canales", groupRows(dataset.distribucion_por_canal, "Canal")),
        objectSheet("04 Equipo", groupRows(dataset.distribucion_por_responsable, "Responsable")),
        objectSheet("05 Insights IA", insightsRows(narrative)),
        objectSheet("99 Detalle Leads", detailRowsForExport(dataset)),
    ];
};

const sheetName = (value: string) =>
    cleanText(value).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Reporte";

const uniqueSheetName = (value: string, usedNames: Set<string>) => {
    const base = sheetName(value);
    if (!usedNames.has(base)) {
        usedNames.add(base);
        return base;
    }
    let index = 2;
    while (true) {
        const suffix = ` ${index}`;
        const candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
        if (!usedNames.has(candidate)) {
            usedNames.add(candidate);
            return candidate;
        }
        index += 1;
    }
};

const csvRowsForSheet = (sheet: AiReportSheet) => {
    if (sheet.kind !== "metadata") return sheet.rows;

    return sheet.rows.flatMap((row) => {
        const valueIndex = Math.max(0, sheet.columns.findIndex((column) => normalizeText(column) === "valor"));
        const value = row[valueIndex] || "";
        const chunks = chunkTextByWords(value, 90);
        if (chunks.length <= 1) return [row];
        return chunks.map((chunk, index) => row.map((cell, cellIndex) => {
            if (cellIndex === 0) return `${row[0]} ${index + 1}`;
            if (cellIndex === valueIndex) return chunk;
            return index === 0 ? cell : "";
        }));
    });
};

const toCsv = (sheets: AiReportSheet[]) => `\ufeff${sheets.map((sheet) => [
    [csvEscape("Hoja"), csvEscape(sheet.name)].join(","),
    sheet.columns.map(csvEscape).join(","),
    ...csvRowsForSheet(sheet).map((row) => sheet.columns.map((_, index) => csvEscape(row[index] || "")).join(",")),
].join("\n")).join("\n\n")}`;

const textEncoder = new TextEncoder();

const utf8Bytes = (value: string) => textEncoder.encode(value);

const concatBytes = (parts: Uint8Array[]) => {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    parts.forEach((part) => {
        output.set(part, offset);
        offset += part.length;
    });
    return output;
};

const le16 = (value: number) => new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
const le32 = (value: number) => new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);

const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let c = index;
        for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[index] = c >>> 0;
    }
    return table;
})();

const crc32 = (bytes: Uint8Array) => {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
};

const zipDosTimeDate = () => {
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const date = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    return { time, date };
};

const zipStore = (files: Array<{ name: string; content: string | Uint8Array }>) => {
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
    let offset = 0;
    const { time, date } = zipDosTimeDate();

    files.forEach((file) => {
        const nameBytes = utf8Bytes(file.name);
        const data = typeof file.content === "string" ? utf8Bytes(file.content) : file.content;
        const crc = crc32(data);
        const flags = 0x0800;
        const localHeader = concatBytes([
            le32(0x04034b50),
            le16(20),
            le16(flags),
            le16(0),
            le16(time),
            le16(date),
            le32(crc),
            le32(data.length),
            le32(data.length),
            le16(nameBytes.length),
            le16(0),
            nameBytes,
        ]);
        localParts.push(localHeader, data);

        centralParts.push(concatBytes([
            le32(0x02014b50),
            le16(20),
            le16(20),
            le16(flags),
            le16(0),
            le16(time),
            le16(date),
            le32(crc),
            le32(data.length),
            le32(data.length),
            le16(nameBytes.length),
            le16(0),
            le16(0),
            le16(0),
            le16(0),
            le32(0),
            le32(offset),
            nameBytes,
        ]));

        offset += localHeader.length + data.length;
    });

    const central = concatBytes(centralParts);
    const end = concatBytes([
        le32(0x06054b50),
        le16(0),
        le16(0),
        le16(files.length),
        le16(files.length),
        le32(central.length),
        le32(offset),
        le16(0),
    ]);

    return concatBytes([...localParts, central, end]);
};

const columnName = (index: number) => {
    let value = index + 1;
    let name = "";
    while (value > 0) {
        const mod = (value - 1) % 26;
        name = String.fromCharCode(65 + mod) + name;
        value = Math.floor((value - mod) / 26);
    }
    return name;
};

const worksheetColumnWidths = (sheet: AiReportSheet, columns: string[]) =>
    columns.map((column, index) => {
        if (sheet.kind === "metadata") return index === 0 ? 34 : 96;

        const maxLength = Math.max(
            column.length,
            ...sheet.rows.slice(0, 600).map((row) => cellText(row[index]).length),
        );
        return Math.min(82, Math.max(14, maxLength + 3));
    });

const rowHeight = (row: string[], widths: number[], isHeader: boolean, wrapText: boolean) => {
    if (isHeader) return 21;
    if (!wrapText) return 18;
    const maxLines = row.reduce((max, cell, index) => {
        const width = Math.max(16, widths[index] || 16);
        const text = cellText(cell);
        return Math.max(max, Math.ceil(text.length / Math.max(18, width * 1.25)));
    }, 1);
    return Math.min(96, Math.max(18, maxLines * 16));
};

const worksheetXml = (sheet: AiReportSheet) => {
    const columns = sheet.columns.length > 0 ? sheet.columns : ["Campo", "Valor"];
    const rows = [columns, ...sheet.rows];
    const widths = worksheetColumnWidths(sheet, columns);
    const rowXml = rows.map((row, rowIndex) => {
        const cells = columns.map((_, columnIndex) => {
            const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
            const text = rowIndex === 0 ? columns[columnIndex] : (row[columnIndex] || "");
            const needsWrap = Boolean(sheet.wrapText) && (sheet.kind === "metadata" || cellText(text).length > Math.max(40, (widths[columnIndex] || 20) * 1.3));
            const styleId = rowIndex === 0 && sheet.headerStyle !== false ? 1 : needsWrap ? 2 : 0;
            const style = styleId > 0 ? ` s="${styleId}"` : "";
            return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${htmlEscape(text)}</t></is></c>`;
        }).join("");
        const height = rowHeight(row, widths, rowIndex === 0, Boolean(sheet.wrapText));
        return `<row r="${rowIndex + 1}" ht="${height}" customHeight="1">${cells}</row>`;
    }).join("");
    const lastRef = `${columnName(columns.length - 1)}${rows.length}`;
    const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
    const sheetView = sheet.kind === "metadata"
        ? "<sheetViews><sheetView workbookViewId=\"0\"/></sheetViews>"
        : "<sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews>";
    const autoFilter = sheet.autoFilter === false ? "" : `<autoFilter ref="A1:${lastRef}"/>`;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${sheetView}
<cols>${cols}</cols>
<sheetData>${rowXml}</sheetData>
${autoFilter}
<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
};

const toXlsx = (sheets: AiReportSheet[]) => {
    const usedNames = new Set<string>();
    const resolvedSheets = sheets.map((sheet, index) => ({
        ...sheet,
        safeName: uniqueSheetName(sheet.name, usedNames),
        id: index + 1,
    }));

    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${resolvedSheets.map((sheet) => `<sheet name="${htmlEscape(sheet.safeName)}" sheetId="${sheet.id}" r:id="rId${sheet.id}"/>`).join("")}</sheets>
</workbook>`;

    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${resolvedSheets.map((sheet) => `<Relationship Id="rId${sheet.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheet.id}.xml"/>`).join("")}
<Relationship Id="rId${resolvedSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${resolvedSheets.map((sheet) => `<Override PartName="/xl/worksheets/sheet${sheet.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`;

    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FF000000"/><sz val="11"/><name val="Aptos"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>
</styleSheet>`;

    return zipStore([
        { name: "[Content_Types].xml", content: contentTypes },
        { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
        { name: "xl/workbook.xml", content: workbookXml },
        { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
        { name: "xl/styles.xml", content: styles },
        ...resolvedSheets.map((sheet) => ({ name: `xl/worksheets/sheet${sheet.id}.xml`, content: worksheetXml(sheet) })),
    ]);
};

const removePdfControlChars = (value: string) => Array.from(value)
    .map((char) => {
        const code = char.charCodeAt(0);
        return code < 32 && code !== 9 && code !== 10 && code !== 13 ? " " : char;
    })
    .join("");

const toPdfLineText = (value: unknown) => removePdfControlChars(cellText(value))
    .replace(/\s+/g, " ")
    .trim();

const toWinAnsiText = (value: unknown) => toPdfLineText(value)
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const pdfText = (value: unknown) => {
    const text = toWinAnsiText(value).slice(0, 1200);
    return `(${text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
};

const wrapText = (value: unknown, maxChars: number) => {
    const text = toWinAnsiText(value);
    if (text.length <= maxChars) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > maxChars) {
        const splitAt = remaining.lastIndexOf(" ", maxChars);
        const index = splitAt > 16 ? splitAt : maxChars;
        chunks.push(remaining.slice(0, index));
        remaining = remaining.slice(index).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
};

const truncateText = (value: unknown, maxChars: number) => {
    const text = toWinAnsiText(value);
    return text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 1))}…` : text;
};

const rgb = {
    blue: "0.055 0.157 0.471",
    blue2: "0.098 0.259 0.627",
    lightBlue: "0.925 0.953 1",
    border: "0.82 0.86 0.92",
    text: "0.05 0.10 0.22",
    muted: "0.36 0.42 0.52",
    white: "1 1 1",
    row: "0.965 0.975 0.99",
    green: "0.06 0.55 0.32",
};

type PdfBlock = {
    title: string;
    paragraphs?: string[];
    table?: { title: string; columns: string[]; rows: string[][]; limit?: number };
};

const tableRowsFromObjects = (rows: Record<string, unknown>[], columns: string[]) =>
    rows.map((row) => columns.map((column) => cellText(row[column])));

const funnelRows = (dataset: AiReportDataset) =>
    ["Entrada de leads", "Calificación", "Contactabilidad", "Agendamiento", "Asistencia a citas", "Cierre comercial", "Seguimiento"].map((stage) => {
        const value = stage === "Entrada de leads"
            ? dataset.resumen_base.leads
            : stage === "Calificación"
                ? dataset.resumen_base.sql_detectados + dataset.resumen_base.no_calificados
                : stage === "Contactabilidad"
                    ? `${dataset.resumen_base.tasa_contactabilidad}% (${dataset.resumen_base.leads_contactados} contactados / ${dataset.resumen_base.leads_sin_contactar} pendientes)`
                    : stage === "Agendamiento"
                        ? dataset.resumen_base.citas_detectadas
                        : stage === "Asistencia a citas"
                            ? "Pendiente de medir asistencia si no existe resultado de cita integrado."
                            : stage === "Cierre comercial"
                                ? dataset.resumen_base.ventas_detectadas
                                : dataset.resumen_base.seguimiento_detectado;
        return [
            stage,
            cellText(value),
            stage === "Entrada de leads" ? "Volumen observado." : "Revisar avance y trazabilidad de la etapa.",
            stage === "Contactabilidad" ? "Priorizar leads pendientes y mantener registro consistente de primera respuesta." : "Optimizar criterios, cadencia y responsables.",
        ];
    });

const buildPdfBlocks = (params: {
    profileKey: CriticalProfileKey;
    profile: AiReportProfile;
    dataset: AiReportDataset;
    narrative: AiReportNarrative;
}): PdfBlock[] => {
    const { profileKey, profile, dataset, narrative } = params;
    const summary = Array.from(new Set([
        ...narrative.executiveSummary,
        ...deterministicExecutiveSummary(dataset),
    ])).filter(Boolean);
    const kpiTable = {
        title: "KPIs principales",
        columns: ["KPI", "Valor", "Estado", "Comentario"],
        rows: tableRowsFromObjects(kpiRows(dataset), ["KPI", "Valor", "Estado", "Comentario"]),
        limit: 14,
    };
    const insightTable = {
        title: "Hallazgos principales",
        columns: ["Insight", "Evidencia", "Impacto", "Prioridad"],
        rows: tableRowsFromObjects(insightsRows(narrative), ["Insight", "Evidencia numérica", "Impacto comercial", "Prioridad"]),
        limit: 7,
    };
    const recommendationParagraphs = recommendationRows(narrative)
        .slice(0, 8)
        .map((item) => `${item.Accion}. Responsable: ${item.Responsable}. Prioridad: ${item.Prioridad}. ${item.Justificacion}`);

    if (profileKey === "management") {
        return [
            { title: "1. Resumen ejecutivo", paragraphs: summary.slice(0, 5) },
            {
                title: "2. Lectura general del desempeño",
                paragraphs: [
                    `Embudo actual: ${dataset.resumen_base.leads} leads, ${dataset.resumen_base.sql_detectados} SQL, ${dataset.resumen_base.citas_detectadas} citas y ${dataset.resumen_base.ventas_detectadas} ventas detectadas.`,
                    `Canal principal: ${dataset.distribucion_por_canal[0]?.label || "sin canal dominante"} con ${dataset.distribucion_por_canal[0]?.value || 0} leads.`,
                    `Requiere atención: ${limitRows(dataset)[0]?.["Impacto en el análisis"] || "mantener monitoreo de conversión y calidad."}`,
                ],
            },
            { title: "3. KPIs principales", table: kpiTable },
            { title: "4. Análisis del embudo comercial", table: { title: "Etapas del embudo", columns: ["Etapa", "Resultado", "Lectura", "Acción"], rows: funnelRows(dataset), limit: 12 } },
            { title: "5. Hallazgos principales", table: insightTable },
            { title: "6. Problemas o cuellos de botella", table: { title: "Cuellos de botella", columns: ["Riesgo", "Evidencia", "Impacto", "Urgencia"], rows: risksRows(narrative).slice(0, 8).map((row) => [cellText(row.Riesgo), cellText(row.Detalle), "Puede afectar conversión o eficiencia.", "Media/Alta"]), limit: 8 } },
            { title: "7. Recomendaciones gerenciales", paragraphs: recommendationParagraphs },
            { title: "8. Plan de acción sugerido", table: { title: "Plan de acción", columns: ["Acción", "Responsable", "Plazo", "KPI", "Prioridad"], rows: planRows(narrative).map((row) => [cellText(row.Acción), cellText(row["Responsable sugerido"]), cellText(row["Plazo sugerido"]), cellText(row["KPI afectado"]), cellText(row.Prioridad)]), limit: 10 } },
            { title: "9. Riesgos comerciales", paragraphs: risksRows(narrative).map((row) => cellText(row.Detalle)).slice(0, 6) },
            { title: "10. Limitaciones del análisis", table: { title: "Limitaciones", columns: ["Limitación", "Impacto", "Mejora sugerida"], rows: tableRowsFromObjects(limitRows(dataset), ["Limitación detectada", "Impacto en el análisis", "Recomendación para mejorar la captura de datos"]), limit: 10 } },
            { title: "11. Conclusión gerencial", paragraphs: [deterministicConclusion(dataset)] },
        ];
    }

    if (profileKey === "team_performance") {
        return [
            { title: "1. Portada", paragraphs: [`${profile.label}. Periodo: ${dataset.periodo}. Autor: Gerente IA de Call Center. Empresa/contexto: ${dataset.contexto_empresarial.slice(0, 240)}`] },
            { title: "2. Resumen ejecutivo", paragraphs: summary.slice(0, 8) },
            { title: "3. Calidad y alcance de la data", table: { title: "Alcance", columns: ["Campo", "Valor"], rows: tableRowsFromObjects(filterRows(dataset), ["Campo", "Valor"]), limit: 12 } },
            { title: "4. Dashboard ejecutivo de KPIs", table: kpiTable },
            { title: "5. Análisis de desempeño por agente", table: { title: "Ranking de agentes", columns: ["Asesor", "Leads", "Citas", "SQLs", "Ventas", "Diagnóstico"], rows: tableRowsFromObjects(advisorRows(dataset), ["Asesor", "Leads asignados", "Citas agendadas", "SQLs generados", "Ventas cerradas", "Diagnóstico"]), limit: 10 } },
            { title: "6. Análisis por campaña", table: { title: "Canal / campaña", columns: ["Canal/Campaña", "Leads", "% total", "Conv. venta", "Calidad", "Recomendación"], rows: tableRowsFromObjects(channelCampaignRows(dataset), ["Canal / Campaña", "Leads recibidos", "% del total", "Conversión a venta", "Calidad estimada", "Recomendación"]), limit: 10 } },
            { title: "7. Análisis de horarios y días", table: { title: "Evolución diaria", columns: ["Día", "Leads"], rows: dataset.distribucion_por_dia.map((item) => [item.label, cellText(item.value)]), limit: 12 } },
            { title: "8. Análisis de seguimiento y reactivación", paragraphs: [availabilityReason(dataset, "next_action", "El seguimiento se mide por etapa y etiquetas disponibles; para medir vencimientos se debe registrar próxima acción o fecha de seguimiento."), `Leads en seguimiento detectados por etapa/etiqueta: ${dataset.resumen_base.seguimiento_detectado}. Leads pendientes de respuesta o revisión: ${dataset.resumen_base.leads_sin_contactar}.`] },
            { title: "9. Insights sobre scripts y objeciones", paragraphs: [availabilityReason(dataset, "observations", "Para analizar scripts y objeciones se deben registrar observaciones, notas o transcripciones de conversaciones."), ...risksRows(narrative).map((row) => cellText(row.Detalle)).slice(0, 3)] },
            { title: "10. Recomendaciones gerenciales", paragraphs: recommendationParagraphs },
            { title: "11. Plan de acción operativo", table: { title: "Plan operativo", columns: ["Acción", "Responsable", "Prioridad", "Impacto", "Plazo", "KPI"], rows: tableRowsFromObjects(planRows(narrative), ["Acción", "Responsable sugerido", "Prioridad", "Impacto esperado", "Plazo sugerido", "KPI afectado"]), limit: 10 } },
            { title: "12. Conclusión ejecutiva", paragraphs: [deterministicConclusion(dataset)] },
            { title: "Anexo técnico", table: { title: "Campos y limitaciones", columns: ["Limitación", "Impacto", "Mejora sugerida"], rows: tableRowsFromObjects(limitRows(dataset), ["Limitación detectada", "Impacto en el análisis", "Recomendación para mejorar la captura de datos"]), limit: 20 } },
        ];
    }

    return [
        { title: "Resumen ejecutivo", paragraphs: summary.slice(0, 6) },
        { title: "KPIs principales", table: kpiTable },
        { title: "Hallazgos", table: insightTable },
        { title: "Recomendaciones", paragraphs: recommendationParagraphs },
        { title: "Limitaciones", table: { title: "Limitaciones", columns: ["Limitación", "Impacto", "Mejora sugerida"], rows: tableRowsFromObjects(limitRows(dataset), ["Limitación detectada", "Impacto en el análisis", "Recomendación para mejorar la captura de datos"]), limit: 10 } },
    ];
};

const toPdf = (params: {
    profile: AiReportProfile;
    dataset: AiReportDataset;
    narrative: AiReportNarrative;
}) => {
    const pages: string[][] = [];
    let ops: string[] = [];
    let y = 0;
    let pageNumber = 0;

    const addOp = (value: string) => ops.push(value);
    const rect = (x: number, bottom: number, width: number, height: number, fillColor?: string, strokeColor?: string) => {
        if (fillColor) addOp(`${fillColor} rg ${x} ${bottom} ${width} ${height} re f`);
        if (strokeColor) addOp(`${strokeColor} RG ${x} ${bottom} ${width} ${height} re S`);
    };
    const textLine = (text: unknown, x: number, baseline: number, size = 9, font = "F1", color = rgb.text) => {
        addOp(`${color} rg BT /${font} ${size} Tf ${x} ${baseline} Td ${pdfText(text)} Tj ET`);
    };
    const charsForWidth = (width: number, size: number) => Math.max(12, Math.floor(width / (size * 0.52)));
    const textBlock = (text: unknown, x: number, size = 9, font = "F1", color = rgb.text, maxWidth = PDF_WIDTH - PDF_MARGIN * 2, lineHeight = Math.ceil(size * 1.35)) => {
        const lines = wrapText(text, charsForWidth(maxWidth, size));
        lines.forEach((line) => {
            ensure(lineHeight + 4);
            textLine(line, x, y, size, font, color);
            y -= lineHeight;
        });
        y -= 2;
    };
    const footer = () => {
        textLine(`Página ${pageNumber}`, PDF_WIDTH - PDF_MARGIN - 52, 22, 8, "F1", rgb.muted);
        textLine("SIMPLIA Control Comercial", PDF_MARGIN, 22, 8, "F1", rgb.muted);
    };
    const header = () => {
        pageNumber += 1;
        ops = [];
        y = 760;
        rect(0, 792, PDF_WIDTH, 50, rgb.blue);
        textLine("SIMPLIA", PDF_MARGIN, 813, 22, "F2", rgb.white);
        textLine("CONTROL COMERCIAL", PDF_MARGIN, 801, 7, "F1", rgb.white);
        textLine(truncateText(params.dataset.periodo, 32), PDF_WIDTH - PDF_MARGIN - 150, 812, 9, "F1", rgb.white);
        footer();
    };
    const finishPage = () => {
        if (ops.length > 0) pages.push(ops);
    };
    const newPage = () => {
        if (ops.length > 0) finishPage();
        header();
    };
    const ensure = (height: number) => {
        if (y - height < 55) newPage();
    };
    const paragraph = (text: unknown, x = PDF_MARGIN, size = 9, maxChars = 92, lineHeight = 13, color = rgb.text) => {
        const lines = wrapText(text, maxChars);
        lines.forEach((line) => {
            ensure(lineHeight + 4);
            textLine(line, x, y, size, "F1", color);
            y -= lineHeight;
        });
        y -= 2;
    };
    const heading = (value: unknown) => {
        ensure(30);
        textBlock(value, PDF_MARGIN, 13, "F2", rgb.blue, PDF_WIDTH - PDF_MARGIN * 2, 16);
        rect(PDF_MARGIN, y + 8, PDF_WIDTH - PDF_MARGIN * 2, 0.5, rgb.border);
        y -= 8;
    };
    const tableAsCards = (title: string, columns: string[], rows: string[][], limit = 10) => {
        const displayRows = rows.slice(0, limit);
        const width = PDF_WIDTH - PDF_MARGIN * 2;
        textLine(title, PDF_MARGIN, y, 11, "F2", rgb.text);
        y -= 16;
        displayRows.forEach((row, rowIndex) => {
            const titleLine = `${columns[0] || "Elemento"}: ${row[0] || "Sin dato"}`;
            const fields = columns.slice(1).map((column, index) => `${column}: ${row[index + 1] || "Sin dato"}`);
            const fieldLines = fields.flatMap((field) => wrapText(field, charsForWidth(width - 24, 8)));
            const titleLines = wrapText(titleLine, charsForWidth(width - 24, 9));
            const cardHeight = 20 + titleLines.length * 12 + fieldLines.length * 10;
            if (cardHeight > 620) {
                textBlock(titleLine, PDF_MARGIN + 4, 9, "F2", rgb.blue, width - 8, 12);
                fields.forEach((field) => textBlock(field, PDF_MARGIN + 10, 8, "F1", rgb.text, width - 18, 10));
                y -= 4;
                return;
            }
            ensure(cardHeight + 8);
            rect(PDF_MARGIN, y - cardHeight + 8, width, cardHeight, rowIndex % 2 === 0 ? rgb.row : "0.99 0.995 1", rgb.border);
            y -= 10;
            titleLines.forEach((line) => {
                textLine(line, PDF_MARGIN + 10, y, 9, "F2", rgb.blue);
                y -= 12;
            });
            fieldLines.forEach((line) => {
                textLine(line, PDF_MARGIN + 10, y, 8, "F1", rgb.text);
                y -= 10;
            });
            y -= 8;
        });
        if (rows.length > limit) {
            textLine(`Filas adicionales disponibles en Excel/CSV: ${rows.length - limit}`, PDF_MARGIN, y - 4, 8, "F1", rgb.muted);
            y -= 14;
        }
        y -= 6;
    };
    const table = (title: string, columns: string[], rows: string[][], limit = 10) => {
        const displayRows = rows.slice(0, limit);
        const shouldUseCards = columns.length >= 4 || displayRows.some((row) => row.some((cell) => toWinAnsiText(cell).length > 42));
        if (shouldUseCards) {
            tableAsCards(title, columns, rows, limit);
            return;
        }

        const width = PDF_WIDTH - PDF_MARGIN * 2;
        const colWidth = width / Math.max(1, columns.length);
        textLine(title, PDF_MARGIN, y, 11, "F2", rgb.text);
        y -= 16;
        const headerLines = columns.map((column) => wrapText(column, charsForWidth(colWidth - 10, 7)));
        const headerHeight = Math.max(18, Math.max(...headerLines.map((lines) => lines.length)) * 9 + 9);
        ensure(headerHeight + 8);
        rect(PDF_MARGIN, y - headerHeight + 5, width, headerHeight, rgb.blue2);
        headerLines.forEach((lines, index) => {
            lines.forEach((line, lineIndex) => textLine(line, PDF_MARGIN + index * colWidth + 5, y - 8 - lineIndex * 9, 7, "F2", rgb.white));
        });
        y -= headerHeight;
        displayRows.forEach((row, rowIndex) => {
            const cellLines = columns.map((_, index) => wrapText(row[index] || "", charsForWidth(colWidth - 10, 7)));
            const rowHeight = Math.max(18, Math.max(...cellLines.map((lines) => lines.length)) * 9 + 9);
            ensure(rowHeight + 4);
            if (rowIndex % 2 === 0) rect(PDF_MARGIN, y - rowHeight + 5, width, rowHeight, rgb.row);
            rect(PDF_MARGIN, y - rowHeight + 5, width, rowHeight, undefined, rgb.border);
            cellLines.forEach((lines, index) => {
                lines.forEach((line, lineIndex) => textLine(line, PDF_MARGIN + index * colWidth + 5, y - 8 - lineIndex * 9, 7, "F1", rgb.text));
            });
            y -= rowHeight;
        });
        if (rows.length > limit) {
            textLine(`Filas adicionales disponibles en Excel/CSV: ${rows.length - limit}`, PDF_MARGIN, y - 4, 8, "F1", rgb.muted);
            y -= 14;
        }
        y -= 6;
    };

    header();
    textBlock(params.narrative.title || params.profile.label, PDF_MARGIN, 18, "F2", rgb.blue, PDF_WIDTH - PDF_MARGIN * 2, 22);
    textLine(`Generado: ${new Date().toLocaleString("es-EC", { timeZone: TIMEZONE })}`, PDF_MARGIN, y, 8, "F1", rgb.muted);
    y -= 18;

    const base = params.dataset.resumen_base;
    const kpis = [
        ["Leads", numberText(base.leads)],
        ["Ventas", numberText(base.ventas_detectadas)],
        ["Monto", `$${numberText(base.monto_total_detectado)}`],
        ["Score prom.", numberText(base.puntaje_promedio ?? "N/D")],
    ];
    const cardWidth = (PDF_WIDTH - PDF_MARGIN * 2 - 24) / 4;
    kpis.forEach(([label, value], index) => {
        const x = PDF_MARGIN + index * (cardWidth + 8);
        rect(x, y - 54, cardWidth, 48, rgb.lightBlue, rgb.border);
        textLine(label, x + 9, y - 21, 8, "F1", rgb.muted);
        textLine(value, x + 9, y - 39, 15, "F2", rgb.blue);
    });
    y -= 70;

    const blocks = buildPdfBlocks({
        profileKey: params.profile.key,
        profile: params.profile,
        dataset: params.dataset,
        narrative: params.narrative,
    });
    blocks.forEach((block) => {
        heading(block.title);
        block.paragraphs?.forEach((item) => paragraph(`• ${item}`, PDF_MARGIN, 9, 95, 13));
        if (block.table) {
            table(block.table.title, block.table.columns, block.table.rows, block.table.limit || 10);
        }
    });

    finishPage();

    const objects: string[] = [];
    const addObject = (body: string) => {
        objects.push(body);
        return objects.length;
    };

    const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
    const pagesId = addObject("__PAGES__");
    const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const boldFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const pageIds: number[] = [];

    pages.forEach((pageOps) => {
        const stream = pageOps.join("\n");
        const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
        const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
        pageIds.push(pageId);
    });

    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((body, index) => {
        offsets.push(pdf.length);
        pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => {
        pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return pdf;
};

const bytesToBase64 = (bytes: Uint8Array) => {
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
};

const stringToBase64 = (value: string) => bytesToBase64(new TextEncoder().encode(value));

const winAnsiStringToBase64 = (value: string) => {
    const bytes = new Uint8Array(value.length);
    for (let index = 0; index < value.length; index += 1) {
        bytes[index] = value.charCodeAt(index) & 0xff;
    }
    return bytesToBase64(bytes);
};

const renderFile = (params: {
    profile: AiReportProfile;
    profileKey: CriticalProfileKey;
    format: ReportFormat;
    rangeLabel: string;
    dataset: AiReportDataset;
    narrative: AiReportNarrative;
}): AiReportFile => {
    const baseName = `${safeFilePart(params.profile.label)}_${safeFilePart(params.rangeLabel)}`;
    if (params.format === "pdf") {
        return {
            filename: `${baseName}.pdf`,
            mimeType: "application/pdf",
            contentBase64: winAnsiStringToBase64(toPdf({
                profile: params.profile,
                dataset: params.dataset,
                narrative: params.narrative,
            })),
        };
    }

    const sheets = buildAiReportSheets({
        profileKey: params.profileKey,
        dataset: params.dataset,
        narrative: params.narrative,
    });

    if (params.format === "csv") {
        return {
            filename: `${baseName}.csv`,
            mimeType: "text/csv;charset=utf-8",
            contentBase64: stringToBase64(toCsv(sheets)),
        };
    }
    return {
        filename: `${baseName}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        contentBase64: bytesToBase64(toXlsx(sheets)),
    };
};

export const renderAiReportFileFromOpenAiResponse = (params: {
    responseBody: Record<string, unknown>;
    profileKey: CriticalProfileKey;
    format: ReportFormat;
    rangeLabel: string;
    rows: Record<string, unknown>[];
    auditEvents?: Record<string, unknown>[];
    companyContext?: string;
    filters?: AiReportFilters;
}): AiReportFile => {
    const profile = AI_REPORT_PROFILES[params.profileKey];
    if (!profile) throw new Error("Perfil de reporte IA no soportado.");
    if (!profile.formats.includes(params.format)) {
        throw new Error(`El formato ${params.format} no está permitido para ${profile.label}.`);
    }
    const dataset = buildAiReportDataset({
        profile,
        format: params.format,
        rows: params.rows,
        auditEvents: params.auditEvents || [],
        rangeLabel: params.rangeLabel,
        companyContext: params.companyContext,
        filters: params.filters,
    });
    const narrative = parseOpenAiReport(params.responseBody, profile.label);
    return renderFile({ profile, profileKey: params.profileKey, format: params.format, rangeLabel: params.rangeLabel, dataset, narrative });
};

export const createAiReportOpenAiResponse = async (params: AiReportBuildParams & { background?: boolean }) => {
    const profile = AI_REPORT_PROFILES[params.profileKey];
    if (!profile) throw new Error("Perfil de reporte IA no soportado.");
    if (!profile.formats.includes(params.format)) {
        throw new Error(`El formato ${params.format} no está permitido para ${profile.label}.`);
    }
    if (!params.openAiApiKey) throw new Error("Missing OPENAI_API_KEY.");

    const dataset = buildAiReportDataset({
        profile,
        format: params.format,
        rows: params.rows,
        auditEvents: params.auditEvents || [],
        rangeLabel: params.rangeLabel,
        companyContext: params.companyContext,
        filters: params.filters,
    });
    const prompt = composeAiReportPrompt({
        profile,
        format: params.format,
        companyContext: params.companyContext,
        rangeLabel: params.rangeLabel,
        dataset: promptDataset(dataset),
    });

    return createOpenAiReportResponse({
        apiKey: params.openAiApiKey,
        model: params.model || resolveOpenAiReportModel(params.profileKey, params.format),
        prompt,
        background: params.background,
    });
};

export const buildAiReportFile = async (params: AiReportBuildParams): Promise<AiReportFile> => {
    const profile = AI_REPORT_PROFILES[params.profileKey];
    if (!profile) throw new Error("Perfil de reporte IA no soportado.");
    if (!profile.formats.includes(params.format)) {
        throw new Error(`El formato ${params.format} no está permitido para ${profile.label}.`);
    }
    if (!params.openAiApiKey) throw new Error("Missing OPENAI_API_KEY.");

    const responseBody = await createAiReportOpenAiResponse({ ...params, background: false });
    return renderAiReportFileFromOpenAiResponse({
        responseBody,
        profileKey: params.profileKey,
        format: params.format,
        rangeLabel: params.rangeLabel,
        rows: params.rows,
        auditEvents: params.auditEvents || [],
        companyContext: params.companyContext,
        filters: params.filters,
    });
};

export const buildAiReportAttachments = async (
    params: Omit<AiReportBuildParams, "format"> & { formats: ReportFormat[] },
): Promise<AiReportAttachment[]> => {
    const attachments: AiReportAttachment[] = [];
    for (const format of params.formats) {
        const file = await buildAiReportFile({ ...params, format });
        attachments.push({ filename: file.filename, content: file.contentBase64 });
    }
    return attachments;
};
