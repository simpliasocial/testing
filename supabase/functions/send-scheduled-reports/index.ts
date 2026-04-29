/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEZONE = "America/Guayaquil";
const RESEND_API_URL = "https://api.resend.com/emails";

type ReportFormat = "excel" | "pdf" | "csv";
type ReportScope = "tab" | "critical_profile";

type ReportSection = {
    title: string;
    rows: any[];
    kind?: "summary" | "kpi" | "analysis" | "detail";
    sheetName?: string;
    description?: string;
};

const TAB_LABELS: Record<string, string> = {
    overview: "Estrategia",
    funnel: "Embudo",
    operational: "Operacion",
    followup: "Seguimiento",
    performance: "Rendimiento Humano",
    trends: "Tendencias",
    scoring: "Calidad",
    chats: "Conversaciones",
};

const CRITICAL_PROFILES: Record<string, { label: string; tabIds: string[]; formats: ReportFormat[] }> = {
    management: {
        label: "Reporte Gerencial",
        tabIds: ["overview", "funnel", "performance", "trends"],
        formats: ["pdf"],
    },
    daily_operations: {
        label: "Reporte de Operacion Diaria Comercial",
        tabIds: ["operational", "followup", "scoring", "chats"],
        formats: ["excel", "csv"],
    },
    team_performance: {
        label: "Reporte de Rendimiento del Equipo",
        tabIds: ["operational", "performance", "followup", "funnel"],
        formats: ["pdf", "excel"],
    },
    marketing_quality: {
        label: "Reporte de Marketing y Calidad de Leads",
        tabIds: ["trends", "funnel", "scoring", "overview"],
        formats: ["excel"],
    },
};

const cleanText = (value: unknown) => String(value ?? "").trim();

const SCORE_BUCKETS = ["hot", "warm", "cold", "low"] as const;
type ScoreBucket = typeof SCORE_BUCKETS[number];

const SCORE_BUCKET_LABELS: Record<ScoreBucket, string> = {
    hot: "Caliente",
    warm: "Tibio",
    cold: "Frio",
    low: "Bajo",
};

const getScoreThresholds = (report: any = {}) => {
    const source = asObject(report.score_thresholds || report.scoreThresholds || report.filters?.scoreThresholds);
    const hotMin = Number(source.hotMin ?? source.highMin ?? 70);
    const warmMin = Number(source.warmMin ?? source.mediumMin ?? 45);
    const coldMin = Number(source.coldMin ?? 20);

    return {
        hotMin: Number.isFinite(hotMin) ? hotMin : 70,
        warmMin: Number.isFinite(warmMin) ? warmMin : 45,
        coldMin: Number.isFinite(coldMin) ? coldMin : 20,
    };
};

const parseScore = (value: unknown) => {
    if (value === null || value === undefined || cleanText(value) === "") return null;
    const parsed = Number.parseFloat(cleanText(value).replace(",", ".").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
};

const scoreValue = (row: any) => {
    const attrs = resolvedAttrs(row);
    return parseScore(attrs.score ?? attrs.lead_score ?? attrs.puntaje ?? row.score ?? row.lead_score ?? row.puntaje);
};

const scoreBucket = (row: any, report: any = {}): ScoreBucket => {
    const score = scoreValue(row);
    const thresholds = getScoreThresholds(report);
    if (score === null) return "low";
    if (score >= thresholds.hotMin) return "hot";
    if (score >= thresholds.warmMin) return "warm";
    if (score >= thresholds.coldMin) return "cold";
    return "low";
};

const scoreRangeLabel = (bucket: ScoreBucket, report: any = {}) => {
    const thresholds = getScoreThresholds(report);
    if (bucket === "hot") return `${thresholds.hotMin} o mas`;
    if (bucket === "warm") return `${thresholds.warmMin} a ${thresholds.hotMin - 1}`;
    if (bucket === "cold") return `${thresholds.coldMin} a ${thresholds.warmMin - 1}`;
    return `Menor a ${thresholds.coldMin} o sin puntaje`;
};

const asObject = (value: unknown): Record<string, any> =>
    value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

const normalizeText = (value: unknown) =>
    String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

const CHANNEL_ALIAS_LABELS: Array<{ label: string; tokens: string[] }> = [
    { label: "WhatsApp", tokens: ["whatsapp", "whats app", "wa.me"] },
    { label: "Instagram", tokens: ["instagram"] },
    { label: "Facebook", tokens: ["facebook", "messenger"] },
    { label: "Telegram", tokens: ["telegram", "t.me", "tg://", "cwcloudbot_bot"] },
    { label: "TikTok", tokens: ["tiktok", "tik tok", "douyin", "simplia.social"] },
    { label: "Sitio web", tokens: ["webwidget", "web_widget", "web widget", "website", "web site", "sitio web", "pagina web", "livechat", "live chat", "widget"] },
];

const resolveKnownChannelLabel = (value: unknown) => {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) return "";

    const matched = CHANNEL_ALIAS_LABELS.find(({ tokens }) =>
        tokens.some((token) => normalizedValue.includes(token))
    );

    return matched?.label || "";
};

const cleanStoredChannel = (value: unknown) => {
    const text = cleanText(value);
    const normalized = normalizeText(text);
    return normalized && !["otro", "other", "unknown", "sin canal", "n/a", "na"].includes(normalized)
        ? text
        : "";
};

const resolveRowChannel = (row: any, attrs: Record<string, any>) => {
    const rawPayload = asObject(row.raw_payload);
    const senderAdditional = asObject(rawPayload?.meta?.sender?.additional_attributes || row.meta?.sender?.additional_attributes);
    const embeddedInbox = asObject(rawPayload.inbox || rawPayload.channel);
    const hints = [
        row.canal,
        attrs.canal,
        rawPayload.channel_type,
        rawPayload.channel_name,
        rawPayload.source,
        rawPayload.provider,
        rawPayload.additional_attributes?.channel,
        rawPayload.additional_attributes?.social_channel,
        senderAdditional.channel,
        senderAdditional.social_channel,
        senderAdditional.provider,
        senderAdditional.platform,
        senderAdditional.source,
        embeddedInbox.name,
        embeddedInbox.website_url,
        embeddedInbox.website_token,
        embeddedInbox.channel_type,
        embeddedInbox.provider,
        embeddedInbox.slug,
    ].filter(Boolean).join(" ");

    return resolveKnownChannelLabel(rawPayload.channel_type || embeddedInbox.channel_type || embeddedInbox.type)
        || resolveKnownChannelLabel(hints)
        || cleanStoredChannel(row.canal)
        || cleanStoredChannel(attrs.canal)
        || "Otro";
};

const errorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
};

const localParts = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(date);

    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const year = Number(byType.year);
    const month = Number(byType.month);
    const day = Number(byType.day);
    const hour = Number(byType.hour);
    const minute = Number(byType.minute);
    const second = Number(byType.second);

    return {
        year,
        month,
        day,
        hour,
        minute,
        second,
        dateKey: `${byType.year}-${byType.month}-${byType.day}`,
        timeKey: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay().toString(),
    };
};

const localDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));

const addDays = (date: Date, days: number) => {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
};

const localDatePartsFromUtcDate = (date: Date) => ({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
});

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const guayaquilLocalToUtcIso = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0) =>
    new Date(Date.UTC(year, month - 1, day, hour + 5, minute, second)).toISOString();

const reportWasRunToday = (lastRunAt: string | null | undefined, todayKey: string) => {
    if (!lastRunAt) return false;
    const last = localParts(new Date(lastRunAt));
    return last.dateKey === todayKey;
};

const isScheduleDue = (report: any, now = new Date()) => {
    const current = localParts(now);
    const scheduledTime = cleanText(report.schedule_time || "08:00").slice(0, 5);
    const currentMinutes = current.hour * 60 + current.minute;
    const [scheduledHour, scheduledMinute] = scheduledTime.split(":").map((value: string) => Number(value));
    const scheduledMinutes = (Number.isFinite(scheduledHour) ? scheduledHour : 8) * 60 + (Number.isFinite(scheduledMinute) ? scheduledMinute : 0);

    if (currentMinutes < scheduledMinutes) return false;
    if (reportWasRunToday(report.last_run_at, current.dateKey)) return false;

    if (report.frequency === "monthly") {
        const configuredDay = Math.min(31, Math.max(1, Number(report.schedule_month_day || 1)));
        const effectiveDay = Math.min(configuredDay, daysInMonth(current.year, current.month));
        return current.day === effectiveDay;
    }

    const scheduleDays = Array.isArray(report.schedule_days) && report.schedule_days.length > 0
        ? report.schedule_days.map(String)
        : ["1"];
    return scheduleDays.includes(current.weekday);
};

const closedPeriodRange = (frequency: string, now = new Date()) => {
    const current = localParts(now);

    if (frequency === "monthly") {
        const previousMonth = current.month === 1 ? 12 : current.month - 1;
        const previousYear = current.month === 1 ? current.year - 1 : current.year;
        const lastDay = daysInMonth(previousYear, previousMonth);
        return {
            label: `${previousYear}-${String(previousMonth).padStart(2, "0")}`,
            sinceIso: guayaquilLocalToUtcIso(previousYear, previousMonth, 1, 0, 0, 0),
            untilIso: guayaquilLocalToUtcIso(previousYear, previousMonth, lastDay, 23, 59, 59),
        };
    }

    const today = localDate(current.year, current.month, current.day);
    const daysSinceMonday = (Number(current.weekday) + 6) % 7;
    const currentWeekStart = addDays(today, -daysSinceMonday);
    const previousWeekStart = addDays(currentWeekStart, -7);
    const previousWeekEnd = addDays(currentWeekStart, -1);
    const start = localDatePartsFromUtcDate(previousWeekStart);
    const end = localDatePartsFromUtcDate(previousWeekEnd);

    return {
        label: `${start.year}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}_a_${end.year}-${String(end.month).padStart(2, "0")}-${String(end.day).padStart(2, "0")}`,
        sinceIso: guayaquilLocalToUtcIso(start.year, start.month, start.day, 0, 0, 0),
        untilIso: guayaquilLocalToUtcIso(end.year, end.month, end.day, 23, 59, 59),
    };
};

const fetchConversationRows = async (supabase: any, report: any, range: { sinceIso: string; untilIso: string }) => {
    const selectedInboxes = Array.isArray(report.filters?.selectedInboxes)
        ? report.filters.selectedInboxes.map(Number).filter((value: number) => Number.isFinite(value))
        : [];

    const rows: any[] = [];
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

        if (selectedInboxes.length > 0) {
            query = query.in("chatwoot_inbox_id", selectedInboxes);
        }

        const { data, error } = await query;
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
        page += 1;
    }

    return rows;
};

const fetchCommercialAuditEvents = async (supabase: any, range: { sinceIso: string; untilIso: string }) => {
    const { data, error } = await supabase
        .schema("cw")
        .from("commercial_audit_events")
        .select("*")
        .gte("changed_at", range.sinceIso)
        .lte("changed_at", range.untilIso)
        .order("changed_at", { ascending: false })
        .limit(5000);

    if (error) {
        console.warn("commercial_audit_events unavailable for scheduled report:", error);
        return [];
    }

    return data || [];
};

const resolvedAttrs = (row: any) => ({
    ...asObject(row.contact_custom_attributes),
    ...asObject(row.conversation_custom_attributes),
    ...asObject(row.resolved_custom_attributes),
});

const parseAmount = (value: unknown) => {
    const raw = cleanText(value);
    if (!raw) return 0;
    const normalized = raw.includes(",") && !raw.includes(".") ? raw.replace(",", ".") : raw.replace(/,/g, "");
    const parsed = Number.parseFloat(normalized.replace(/[^0-9.-]/g, ""));
    return Number.isNaN(parsed) ? 0 : parsed;
};

const formatMoney = (value: unknown) =>
    new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value) || 0);

const formatPercent = (value: unknown) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "";
    const percent = Math.abs(numeric) > 0 && Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
    return `${new Intl.NumberFormat("es-EC", { maximumFractionDigits: 2 }).format(percent)}%`;
};

const generatedAtLocal = () => {
    const current = localParts();
    return `${current.dateKey} ${current.timeKey}`;
};

const rowLabelArray = (row: any) => Array.isArray(row.labels)
    ? row.labels.map((label: unknown) => cleanText(label)).filter(Boolean)
    : [];

const hasAnyRowLabel = (row: any, expectedLabels: string[]) => {
    const labelSet = new Set(rowLabelArray(row));
    return expectedLabels.some((label) => labelSet.has(label));
};

const saleLabelsForReport = (report: any = {}) => Array.from(new Set([
    ...(Array.isArray(report.filters?.saleTags) ? report.filters.saleTags : []),
    report.filters?.humanSaleTargetLabel,
    "venta_exitosa",
    "venta",
].map(cleanText).filter(Boolean)));

const currentSaleAmount = (row: any, report: any = {}) =>
    hasAnyRowLabel(row, saleLabelsForReport(report))
        ? parseAmount(row.monto_operacion ?? resolvedAttrs(row).monto_operacion)
        : 0;

const isCurrentSaleRow = (row: any, report: any = {}) => currentSaleAmount(row, report) > 0;

const saleDateForRow = (row: any) => {
    const attrs = resolvedAttrs(row);
    return row.fecha_monto_operacion || attrs.fecha_monto_operacion || row.created_at_chatwoot || row.created_at || "";
};

const commercialStatusForRow = (row: any, report: any = {}) => {
    const amount = parseAmount(row.monto_operacion ?? resolvedAttrs(row).monto_operacion);
    if (isCurrentSaleRow(row, report)) {
        return {
            "Se suma en ventas": "Si",
            "Explicacion ventas": "Esta marcada como venta y tiene monto registrado.",
            "Monto que suma en ventas": amount,
            "Monto registrado": amount,
        };
    }
    if (amount > 0) {
        return {
            "Se suma en ventas": "No",
            "Explicacion ventas": "Tiene monto registrado, pero no esta marcada como venta.",
            "Monto que suma en ventas": 0,
            "Monto registrado": amount,
        };
    }
    return {
        "Se suma en ventas": "No",
        "Explicacion ventas": "No tiene monto registrado.",
        "Monto que suma en ventas": 0,
        "Monto registrado": "",
    };
};

const labels = (row: any) => Array.isArray(row.labels) ? row.labels.join(", ") : "";

const stage = (row: any) => {
    const rowLabels = Array.isArray(row.labels) ? row.labels : [];
    if (rowLabels.includes("venta_exitosa") || rowLabels.includes("venta")) return "Venta exitosa";
    if (rowLabels.includes("cita_agendada") || rowLabels.includes("cita_agendada_humano") || rowLabels.includes("cita")) return "Cita agendada";
    if (rowLabels.includes("seguimiento_humano")) return "Seguimiento humano";
    if (rowLabels.includes("interesado")) return "SQL";
    if (rowLabels.some((label: string) => ["desinteresado", "no_calificado", "rechazo", "rechazado"].includes(label))) return "No calificado";
    return "Otro";
};

const detailRow = (row: any, report: any = {}) => {
    const attrs = resolvedAttrs(row);
    return {
        ID: row.chatwoot_conversation_id || row.id,
        Nombre: row.nombre_completo || row.meta?.sender?.name || attrs.nombre_completo || "Sin nombre",
        Telefono: row.celular || row.meta?.sender?.phone_number || attrs.celular || "",
        Canal: resolveRowChannel(row, attrs),
        Etiquetas: labels(row),
        Etapa: stage(row),
        Estado: row.status || row.conversation_status || "",
        Correo: row.correo || row.meta?.sender?.email || attrs.correo || "",
        Monto: parseAmount(row.monto_operacion ?? attrs.monto_operacion),
        "Fecha Monto": row.fecha_monto_operacion || attrs.fecha_monto_operacion || "",
        Agencia: row.agencia || attrs.agencia || "",
        Campana: row.campana || attrs.campana || attrs.utm_campaign || "",
        Responsable: attrs.responsable || row.meta?.assignee?.name || "",
        "Fecha Ingreso": row.created_at_chatwoot || "",
        "Ultima Interaccion": row.last_activity_at_chatwoot || row.updated_at_chatwoot || "",
        "Origen Dato": row.source || "supabase",
    };
};

const qualityDetailRow = (row: any, report: any) => {
    const detail = detailRow(row, report);
    const score = scoreValue(row);
    const bucket = scoreBucket(row, report);
    return {
        ...detail,
        Nivel: SCORE_BUCKET_LABELS[bucket],
        Puntaje: score === null ? "Sin puntaje" : score,
        Rango: scoreRangeLabel(bucket, report),
    };
};

const collectLabelUniverse = (rows: any[]) => Array.from(new Set([
    "interesado",
    "crear_confianza",
    "crear_urgencia",
    "desinteresado",
    "cita_agendada",
    "cita_agendada_humano",
    "seguimiento_humano",
    "venta_exitosa",
    ...rows.flatMap(rowLabelArray),
].map(cleanText).filter(Boolean))).sort((a, b) => a.localeCompare(b));

const labelSummaryRows = (rows: any[], title: string, totalLabel: string) => {
    const labelNames = collectLabelUniverse(rows);
    const byLabel = new Map<string, number>();
    const byLabelAndChannel = new Map<string, Map<string, number>>();

    rows.forEach((row) => {
        const channel = detailRow(row).Canal || "Otro";
        rowLabelArray(row).forEach((label) => {
            byLabel.set(label, (byLabel.get(label) || 0) + 1);
            const byChannel = byLabelAndChannel.get(label) || new Map<string, number>();
            byChannel.set(channel, (byChannel.get(channel) || 0) + 1);
            byLabelAndChannel.set(label, byChannel);
        });
    });

    const channels = Array.from(new Set(rows.map((row) => detailRow(row).Canal || "Otro"))).sort();
    const summary = labelNames.map((label) => ({
        Etiqueta: label,
        Total: byLabel.get(label) || 0,
        ...Object.fromEntries(channels.map((channel) => [channel, byLabelAndChannel.get(label)?.get(channel) || 0])),
    }));

    return [
        { Campo: "Reporte", Valor: title },
        { Campo: "Generado", Valor: new Date().toISOString() },
        { Campo: totalLabel, Valor: rows.length },
        ...summary,
    ];
};

const queueRow = (row: any) => {
    const attrs = resolvedAttrs(row);
    const detail = detailRow(row);
    return {
        "ID Conversacion": detail.ID,
        "Nombre del Lead": detail.Nombre,
        Canal: detail.Canal,
        Numero: detail.Telefono,
        Etiquetas: detail.Etiquetas,
        Etapa: detail.Etapa,
        Responsable: detail.Responsable,
        Agencia: detail.Agencia,
        "Fecha Visita": attrs.fecha_visita || "",
        "Hora Visita": attrs.hora_visita || "",
        "Enlace Chatwoot": "",
        "Fecha Ingreso": detail["Fecha Ingreso"],
        "Ultima Interaccion": detail["Ultima Interaccion"],
        "Origen Dato": detail["Origen Dato"],
    };
};

const salesDetailRow = (row: any) => {
    const detail = detailRow(row);
    const attrs = resolvedAttrs(row);
    return {
        ...detail,
        "Monto Numerico": parseAmount(row.monto_operacion ?? attrs.monto_operacion),
    };
};

const groupSalesByChannel = (salesRows: any[]) => {
    const map = new Map<string, { Canal: string; Ventas: number; Monto: number }>();
    salesRows.forEach((row) => {
        const detail = salesDetailRow(row);
        const channel = cleanText(detail.Canal) || "Otro";
        const next = map.get(channel) || { Canal: channel, Ventas: 0, Monto: 0 };
        next.Ventas += 1;
        next.Monto += Number(detail["Monto Numerico"] || 0);
        map.set(channel, next);
    });
    return Array.from(map.values());
};

const groupSalesByMonth = (salesRows: any[]) => {
    const map = new Map<string, { Periodo: string; Ventas: number; Monto: number }>();
    salesRows.forEach((row) => {
        const detail = salesDetailRow(row);
        const period = cleanText(detail["Fecha Monto"]).slice(0, 7) || "Sin fecha";
        const next = map.get(period) || { Periodo: period, Ventas: 0, Monto: 0 };
        next.Ventas += 1;
        next.Monto += Number(detail["Monto Numerico"] || 0);
        map.set(period, next);
    });
    return Array.from(map.values());
};

const ensureRows = (rows: any[], message = "Sin datos para los filtros del reporte") =>
    rows.length > 0 ? rows : [{ Estado: "Sin datos", Detalle: message }];

const withReportSection = (section: string, rows: any[]) =>
    ensureRows(rows, `Sin datos para ${section}`).map((row) => ({ Seccion: section, ...row }));

const ratio = (value: number, base: number) => base > 0 ? value / base : 0;

const isIncomingRowMessage = (message: any) =>
    message?.message_direction === "incoming" ||
    Number(message?.message_type) === 0 ||
    cleanText(message?.message_type).toLowerCase() === "incoming" ||
    cleanText(message?.sender_type).toLowerCase() === "contact";

const hasRowMessageSenderSignal = (message: any) =>
    message?.message_direction !== undefined ||
    message?.message_type !== undefined ||
    message?.sender_type !== undefined;

const hasUnansweredRow = (row: any) => {
    if (row.waiting_since_chatwoot || row.raw_payload?.waiting_since) return true;

    const lastNonActivity = row.raw_payload?.last_non_activity_message;
    if (lastNonActivity && hasRowMessageSenderSignal(lastNonActivity)) {
        return isIncomingRowMessage(lastNonActivity);
    }

    const messages = Array.isArray(row.raw_payload?.messages) ? row.raw_payload.messages : [];
    const publicMessages = messages
        .filter((message: any) => !message?.private && !message?.is_private && (message.created_at || message.created_at_chatwoot))
        .sort((a: any, b: any) => Number(a.created_at || 0) - Number(b.created_at || 0));
    if (publicMessages.length > 0) {
        return isIncomingRowMessage(publicMessages[publicMessages.length - 1]);
    }

    if ((row.last_non_activity_message_preview || lastNonActivity?.content) && !row.first_reply_created_at_chatwoot) {
        return true;
    }

    return !row.first_reply_created_at_chatwoot;
};

const summarizeRows = (rows: any[], report: any) => {
    const summary = {
        leads: rows.length,
        sqls: 0,
        appointments: 0,
        sales: 0,
        followup: 0,
        unqualified: 0,
        unanswered: 0,
        revenue: 0,
        scored: 0,
        missingScore: 0,
        scoreSum: 0,
    };

    rows.forEach((row) => {
        const rowStage = stage(row);
        if (rowStage === "SQL") summary.sqls += 1;
        if (rowStage === "Cita agendada") summary.appointments += 1;
        if (isCurrentSaleRow(row, report)) summary.sales += 1;
        if (rowStage === "Seguimiento humano") summary.followup += 1;
        if (rowStage === "No calificado") summary.unqualified += 1;
        if (hasUnansweredRow(row)) summary.unanswered += 1;
        summary.revenue += currentSaleAmount(row, report);

        const score = scoreValue(row);
        if (score === null) {
            summary.missingScore += 1;
        } else {
            summary.scored += 1;
            summary.scoreSum += score;
        }
    });

    return {
        ...summary,
        appointmentRate: ratio(summary.appointments, summary.leads) * 100,
        salesRate: ratio(summary.sales, summary.leads) * 100,
        averageTicket: ratio(summary.revenue, summary.sales),
        averageScore: summary.scored > 0 ? summary.scoreSum / summary.scored : 0,
        thresholds: getScoreThresholds(report),
    };
};

const reportFilterText = (report: any) => {
    const filters = asObject(report.filters);
    const inboxes = Array.isArray(filters.selectedInboxes) ? filters.selectedInboxes : [];
    return inboxes.length > 0 ? `Bandejas seleccionadas: ${inboxes.join(", ")}` : "Todas las bandejas disponibles";
};

const tabInterpretation = (tabId: string) => {
    const notes: Record<string, string> = {
        overview: "Lectura gerencial de leads, citas, ventas, monto y conversiones principales.",
        funnel: "Revisa avance entre etapas, conversiones y puntos de perdida o descalificacion.",
        operational: "Control operativo de carga, estados, canales, responsables y datos accionables.",
        followup: "Seguimiento humano: colas, citas, ventas, montos y pendientes relevantes.",
        performance: "Comparativo por responsable para entender carga, citas, ventas y conversion.",
        trends: "Origenes, campanas, ingresos por periodo y calidad por canal.",
        scoring: "Calidad de lead con Caliente, Tibio, Frio y Bajo; sin puntaje cuenta como Bajo.",
        chats: "Revision de conversaciones, etiquetas, estados, canales y detalle exportable.",
    };
    return notes[tabId] || "Reporte operativo del dashboard.";
};

const metadataRows = (report: any, tabId: string, rows: any[], rangeLabel: string) => [
    { Campo: "Reporte", Valor: report.name || "Reporte programado" },
    { Campo: "Pestana", Valor: TAB_LABELS[tabId] || tabId },
    { Campo: "Periodo cerrado", Valor: rangeLabel },
    { Campo: "Filtros aplicados", Valor: reportFilterText(report) },
    { Campo: "Generado", Valor: generatedAtLocal() },
    { Campo: "Zona horaria", Valor: TIMEZONE },
    { Campo: "Total encontrado", Valor: rows.length },
    { Campo: "Datos incluidos", Valor: "Resumen, KPIs, analisis por dimension, cambios relevantes cuando existan y detalle de leads." },
    { Campo: "Lectura recomendada", Valor: tabInterpretation(tabId) },
    { Campo: "Nota", Valor: "PDF resume la lectura ejecutiva; Excel/CSV contienen detalle filtrable." },
];

const metricRow = (Metrica: string, Valor: unknown, Formula: string, Interpretacion: string) => ({
    Metrica,
    Valor,
    Formula,
    Interpretacion,
});

const kpiRows = (tabId: string, rows: any[], report: any) => {
    const summary = summarizeRows(rows, report);
    if (tabId === "scoring") {
        return [
            metricRow("Leads evaluados", summary.leads, "Total filtrado", "Leads incluidos en calidad."),
            metricRow("Con puntaje", summary.scored, "Score numerico disponible", "Base con puntaje real."),
            metricRow("Sin puntaje", summary.missingScore, "Score vacio o no numerico", "Se clasifican como Bajo."),
            metricRow("Puntaje promedio", summary.scored > 0 ? Number(summary.averageScore.toFixed(2)) : "Sin puntajes", "Promedio de puntajes", "Calidad media de leads con dato."),
            metricRow("Rangos usados", `Caliente ${summary.thresholds.hotMin}+ | Tibio ${summary.thresholds.warmMin}-${summary.thresholds.hotMin - 1} | Frio ${summary.thresholds.coldMin}-${summary.thresholds.warmMin - 1} | Bajo <${summary.thresholds.coldMin}`, "Configuracion del reporte o default", "Rangos usados en el adjunto programado."),
        ];
    }

    if (tabId === "followup") {
        return [
            metricRow("Cola seguimiento", summary.followup, "Leads en etapa seguimiento", "Trabajo humano pendiente."),
            metricRow("Citas agendadas", summary.appointments, "Leads con cita", "Conversiones intermedias."),
            metricRow("Ventas exitosas", summary.sales, "Leads vendidos", "Cierres del periodo."),
            metricRow("Monto ventas", formatMoney(summary.revenue), "Suma de montos", "Impacto economico del seguimiento."),
            metricRow("Ticket promedio", formatMoney(summary.averageTicket), "Monto / ventas", "Valor promedio de cierre."),
        ];
    }

    if (tabId === "operational") {
        return [
            metricRow("Leads operativos", summary.leads, "Total filtrado", "Carga del periodo."),
            metricRow("Leads sin respuesta", summary.unanswered, "Ultima interaccion del cliente sin respuesta posterior", "Misma logica visible en Operacion."),
            metricRow("Seguimiento humano", summary.followup, "Leads en seguimiento", "Trabajo que requiere gestion."),
            metricRow("Citas", summary.appointments, "Leads con cita", "Resultado de gestion."),
            metricRow("Ventas", summary.sales, "Leads vendidos", "Cierres detectados."),
            metricRow("Conversion a cita", formatPercent(summary.appointmentRate), "Citas / leads", "Efectividad operativa."),
        ];
    }

    if (tabId === "performance") {
        const humanConversion = ratio(summary.appointments, summary.followup + summary.appointments) * 100;
        return [
            metricRow("Seguimiento", summary.followup, "Leads en seguimiento humano", "Trabajo gestionado por el equipo."),
            metricRow("Citas humanas", summary.appointments, "Leads que llegaron a cita", "Resultado directo del seguimiento."),
            metricRow("Conversion", formatPercent(humanConversion), "Citas / (seguimiento + citas)", "Mismo enfoque visible en Rendimiento Humano."),
            metricRow("Ventas", summary.sales, "Leads vendidos", "Cierres del periodo."),
            metricRow("Total vendido", formatMoney(summary.revenue), "Suma de montos de venta", "Ingreso atribuido a ventas."),
            metricRow("Ticket promedio", formatMoney(summary.averageTicket), "Total vendido / ventas", "Valor promedio de cierre."),
        ];
    }

    return [
        metricRow("Total leads", summary.leads, "Total filtrado", "Volumen de oportunidades."),
        metricRow("SQLs", summary.sqls, "Leads en SQL/interesado", "Interes comercial inicial."),
        metricRow("Citas agendadas", summary.appointments, "Leads con cita", "Paso intermedio del embudo."),
        metricRow("Ventas exitosas", summary.sales, "Leads vendidos", "Cierres comerciales."),
        metricRow("Conversion a cita", formatPercent(summary.appointmentRate), "Citas / leads", "Eficiencia del embudo."),
        metricRow("Conversion a venta", formatPercent(summary.salesRate), "Ventas / leads", "Eficiencia final."),
        metricRow("Monto ventas", formatMoney(summary.revenue), "Suma de montos", "Ingreso detectado."),
    ];
};

const dimensionRows = (rows: any[], report: any, dimensionLabel: string, resolver: (row: any) => unknown) => {
    const grouped = new Map<string, {
        leads: number;
        sqls: number;
        appointments: number;
        sales: number;
        unanswered: number;
        revenue: number;
        scoreSum: number;
        scored: number;
        buckets: Record<ScoreBucket, number>;
    }>();

    rows.forEach((row) => {
        const key = cleanText(resolver(row)) || "Sin dato";
        const current = grouped.get(key) || {
            leads: 0,
            sqls: 0,
            appointments: 0,
            sales: 0,
            unanswered: 0,
            revenue: 0,
            scoreSum: 0,
            scored: 0,
            buckets: { hot: 0, warm: 0, cold: 0, low: 0 },
        };
        const rowStage = stage(row);
        const score = scoreValue(row);
        current.leads += 1;
        if (rowStage === "SQL") current.sqls += 1;
        if (rowStage === "Cita agendada") current.appointments += 1;
        if (isCurrentSaleRow(row, report)) current.sales += 1;
        if (hasUnansweredRow(row)) current.unanswered += 1;
        current.revenue += currentSaleAmount(row, report);
        current.buckets[scoreBucket(row, report)] += 1;
        if (score !== null) {
            current.scored += 1;
            current.scoreSum += score;
        }
        grouped.set(key, current);
    });

    return Array.from(grouped.entries()).map(([name, value]) => ({
        [dimensionLabel]: name,
        Leads: value.leads,
        SQLs: value.sqls,
        Citas: value.appointments,
        Ventas: value.sales,
        "Sin respuesta": value.unanswered,
        "Monto ventas": value.revenue,
        "Tasa cita": formatPercent(ratio(value.appointments, value.leads) * 100),
        "Tasa venta": formatPercent(ratio(value.sales, value.leads) * 100),
        "Puntaje promedio": value.scored > 0 ? Number((value.scoreSum / value.scored).toFixed(2)) : "",
        Caliente: value.buckets.hot,
        Tibio: value.buckets.warm,
        Frio: value.buckets.cold,
        Bajo: value.buckets.low,
    })).sort((a, b) => Number(b.Leads) - Number(a.Leads));
};

const qualityDistributionRows = (rows: any[], report: any) => {
    const summary = summarizeRows(rows, report);
    const counts: Record<ScoreBucket, number> = { hot: 0, warm: 0, cold: 0, low: 0 };
    rows.forEach((row) => {
        counts[scoreBucket(row, report)] += 1;
    });
    return SCORE_BUCKETS.map((bucket) => ({
        Nivel: SCORE_BUCKET_LABELS[bucket],
        Rango: scoreRangeLabel(bucket, report),
        Leads: counts[bucket],
        Porcentaje: formatPercent(ratio(counts[bucket], rows.length) * 100),
        "Sin puntaje incluidos": bucket === "low" ? summary.missingScore : "",
    }));
};

const stageRows = (rows: any[]) => {
    const grouped = new Map<string, number>();
    rows.forEach((row) => grouped.set(stage(row), (grouped.get(stage(row)) || 0) + 1));
    return Array.from(grouped.entries()).map(([Etapa, Leads]) => ({ Etapa, Leads })).sort((a, b) => b.Leads - a.Leads);
};

const statusRows = (rows: any[]) => {
    const grouped = new Map<string, number>();
    rows.forEach((row) => {
        const status = detailRow(row).Estado || "Sin estado";
        grouped.set(status, (grouped.get(status) || 0) + 1);
    });
    return Array.from(grouped.entries()).map(([Estado, Leads]) => ({ Estado, Leads })).sort((a, b) => b.Leads - a.Leads);
};

const labelRows = (rows: any[]) => {
    const grouped = new Map<string, number>();
    rows.forEach((row) => rowLabelArray(row).forEach((label) => grouped.set(label, (grouped.get(label) || 0) + 1)));
    return Array.from(grouped.entries()).map(([Etiqueta, Leads]) => ({ Etiqueta, Leads })).sort((a, b) => b.Leads - a.Leads);
};

const revenueByDateRows = (rows: any[], report: any = {}) => {
    const grouped = new Map<string, { Fecha: string; Ventas: number; Monto: number }>();
    rows.filter((row) => isCurrentSaleRow(row, report)).forEach((row) => {
        const detail = detailRow(row, report);
        const date = cleanText(saleDateForRow(row)).slice(0, 10) || cleanText(detail["Fecha Ingreso"]).slice(0, 10) || "Sin fecha";
        const current = grouped.get(date) || { Fecha: date, Ventas: 0, Monto: 0 };
        current.Ventas += 1;
        current.Monto += currentSaleAmount(row, report);
        grouped.set(date, current);
    });
    return Array.from(grouped.values()).sort((a, b) => a.Fecha.localeCompare(b.Fecha));
};

const funnelConversionRows = (rows: any[]) => {
    const stageMap = new Map(stageRows(rows).map((row) => [row.Etapa, Number(row.Leads)]));
    const ordered = [
        { label: "SQL", value: stageMap.get("SQL") || 0 },
        { label: "Cita agendada", value: stageMap.get("Cita agendada") || 0 },
        { label: "Venta exitosa", value: stageMap.get("Venta exitosa") || 0 },
    ];
    return ordered.slice(1).map((item, index) => ({
        Desde: ordered[index].label,
        Hacia: item.label,
        "Base anterior": ordered[index].value,
        Resultado: item.value,
        Conversion: formatPercent(ratio(item.value, ordered[index].value) * 100),
    }));
};

const analysisRows = (tabId: string, rows: any[], report: any) => {
    const result: any[] = [];
    const add = (section: string, sectionRows: any[]) => result.push(...withReportSection(section, sectionRows));

    if (tabId === "funnel") {
        add("Embudo actual", stageRows(rows));
        add("Conversion entre etapas", funnelConversionRows(rows));
        add("Perdidas y descalificacion", labelRows(rows).filter((row) => normalizeText(row.Etiqueta).includes("desinteres") || normalizeText(row.Etiqueta).includes("no_calificado")));
        return result;
    }

    if (tabId === "operational") {
        add("Carga por canal", dimensionRows(rows, report, "Canal", (row) => detailRow(row).Canal));
        add("Carga por responsable", dimensionRows(rows, report, "Responsable", (row) => detailRow(row).Responsable));
        add("Estados operativos", statusRows(rows));
        add("Origen de datos", dimensionRows(rows, report, "Origen", (row) => detailRow(row)["Origen Dato"]));
        return result;
    }

    if (tabId === "followup") {
        add("Colas por etapa", stageRows(rows));
        add("Ventas por canal", dimensionRows(rows.filter((row) => isCurrentSaleRow(row, report)), report, "Canal", (row) => detailRow(row, report).Canal));
        add("Ventas por mes", groupSalesByMonth(rows.filter((row) => isCurrentSaleRow(row, report))));
        add("Detalle por responsable", dimensionRows(rows, report, "Responsable", (row) => detailRow(row).Responsable));
        return result;
    }

    if (tabId === "performance") {
        add("Ranking por responsable", dimensionRows(rows, report, "Responsable", (row) => detailRow(row).Responsable));
        add("Estados por equipo", stageRows(rows));
        return result;
    }

    if (tabId === "trends") {
        add("Leads por canal", dimensionRows(rows, report, "Canal", (row) => detailRow(row).Canal));
        add("Campanas", dimensionRows(rows, report, "Campana", (row) => detailRow(row).Campana || "Sin campana"));
        add("Ingresos por periodo", revenueByDateRows(rows, report));
        add("Calidad por canal", dimensionRows(rows, report, "Canal", (row) => detailRow(row).Canal));
        return result;
    }

    if (tabId === "scoring") {
        add("Rangos usados", SCORE_BUCKETS.map((bucket) => ({
            Nivel: SCORE_BUCKET_LABELS[bucket],
            Rango: scoreRangeLabel(bucket, report),
        })));
        add("Distribucion de calidad", qualityDistributionRows(rows, report));
        add("Calidad por canal", dimensionRows(rows, report, "Canal", (row) => detailRow(row).Canal));
        add("Calidad por campana", dimensionRows(rows, report, "Campana", (row) => detailRow(row).Campana || "Sin campana"));
        add("Calidad por estado", dimensionRows(rows, report, "Estado", (row) => detailRow(row).Estado || "Sin estado"));
        return result;
    }

    if (tabId === "chats") {
        add("Estados de conversacion", statusRows(rows));
        add("Canales", dimensionRows(rows, report, "Canal", (row) => detailRow(row).Canal));
        add("Etiquetas", labelRows(rows));
        add("Origen de datos", dimensionRows(rows, report, "Origen", (row) => detailRow(row)["Origen Dato"]));
        return result;
    }

    add("Embudo resumido", stageRows(rows));
    add("Leads por canal", dimensionRows(rows, report, "Canal", (row) => detailRow(row).Canal));
    add("Detalle comercial por campana", dimensionRows(rows, report, "Campana", (row) => detailRow(row).Campana || "Sin campana"));
    return result;
};

const sheetNameFor = (tabId: string, base: string, isSingleTab: boolean) =>
    isSingleTab ? base : `${TAB_LABELS[tabId] || tabId} ${base}`;

const detailRowsForTab = (tabId: string, rows: any[], report: any) =>
    tabId === "scoring" ? rows.map((row) => qualityDetailRow(row, report)) : rows.map((row) => detailRow(row, report));

const auditValueText = (value: unknown) => {
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

const isBlankAuditValue = (value: unknown) => {
    const text = auditValueText(value).trim().toLowerCase();
    return !text || text === "null" || text === "\"\"" || text === "[]" || text === "{}";
};

const hasSaleSignal = (value: unknown) => {
    const text = auditValueText(value).toLowerCase();
    return text.includes("venta_exitosa") || text.includes("\"venta\"") || text.includes(" venta") || text === "venta";
};

const auditFieldName = (event: any) => cleanText(event.field_name || event.attribute_key || event.raw_payload?.field_name || event.raw_payload?.attribute_key);

const auditEventInfo = (event: any, row: any, report: any) => {
    const field = auditFieldName(event).toLowerCase();
    const signature = [
        event.event_type,
        event.business_impact,
        event.status,
        field,
        event.change_source,
    ].map((value) => cleanText(value).toLowerCase()).join(" ");
    const previousValue = event.previous_value ?? event.historical_value;
    const currentValue = event.current_value;
    const isAmountEvent = field.includes("monto") || signature.includes("monto_operacion") || signature.includes("monto_");

    if (isAmountEvent) {
        const previousAmount = parseAmount(auditValueText(previousValue));
        const currentAmount = parseAmount(auditValueText(currentValue));

        if (!isBlankAuditValue(previousValue) && isBlankAuditValue(currentValue)) {
            return {
                situacion: "Monto eliminado",
                explicacion: "Antes tenia monto y luego quedo vacio.",
            };
        }

        if (
            !isBlankAuditValue(previousValue)
            && !isBlankAuditValue(currentValue)
            && previousAmount !== currentAmount
            && (previousAmount > 0 || currentAmount > 0)
        ) {
            return {
                situacion: "Monto cambiado",
                explicacion: "El monto cambio; los totales usan el valor que aparece hoy en el lead.",
            };
        }
    }

    const isLabelEvent = field === "labels" || signature.includes("label") || signature.includes("etiqueta");
    const saleWasTouched = hasSaleSignal(previousValue) || hasSaleSignal(currentValue) || hasSaleSignal(event.historical_value);
    const saleWasRemoved = signature.includes("venta_historica")
        || signature.includes("no_vigente")
        || signature.includes("no vigente")
        || signature.includes("removed_sale")
        || (isLabelEvent && saleWasTouched && (!row || !isCurrentSaleRow(row, report)));

    if (saleWasRemoved && (!row || !isCurrentSaleRow(row, report))) {
        return {
            situacion: "Venta retirada",
            explicacion: "Antes estaba marcada como venta y luego se retiro. Por eso no suma en ventas.",
        };
    }

    if (signature.includes("monto_no_contable")) {
        return {
            situacion: "No suma a ventas",
            explicacion: "Tiene monto registrado, pero no esta marcada como venta.",
        };
    }

    return null;
};

const buildCommercialAuditRows = (rows: any[], report: any, auditEvents: any[] = []) => {
    const rowById = new Map(rows.map((row) => [Number(row.chatwoot_conversation_id || row.id), row]));
    const result: any[] = [];
    const seen = new Set<string>();

    rows.forEach((row) => {
        const amount = parseAmount(row.monto_operacion ?? resolvedAttrs(row).monto_operacion);
        if (amount <= 0 || isCurrentSaleRow(row, report)) return;
        const detail = detailRow(row, report);
        result.push({
            "ID Conversacion": detail.ID,
            "Nombre del Lead": detail.Nombre,
            Situacion: "No suma a ventas",
            "Se suma en ventas": "No",
            Explicacion: "Tiene monto registrado, pero no esta marcada como venta.",
            "Monto actual": amount,
            "Monto anterior": "",
            "Monto nuevo": row.monto_operacion ?? resolvedAttrs(row).monto_operacion ?? amount,
            Campo: "Monto de la operacion",
            "Fecha del cambio": saleDateForRow(row),
        });
        seen.add(`current:${detail.ID}:monto`);
    });

    auditEvents.forEach((event) => {
        const conversationId = Number(event.chatwoot_conversation_id);
        const row = rowById.get(conversationId);
        if (!row) return;
        const detail = detailRow(row, report);
        const info = auditEventInfo(event, row, report);
        if (!info) return;
        if (info.situacion === "No suma a ventas" && seen.has(`current:${conversationId}:monto`)) return;

        const field = auditFieldName(event);
        const key = [
            event.id || "",
            conversationId,
            info.situacion,
            field,
            event.changed_at || event.detected_at || "",
            auditValueText(event.previous_value),
            auditValueText(event.current_value),
        ].join(":");
        if (seen.has(key)) return;
        seen.add(key);

        result.push({
            "ID Conversacion": conversationId,
            "Nombre del Lead": detail.Nombre,
            Situacion: info.situacion,
            "Se suma en ventas": isCurrentSaleRow(row, report) ? "Si" : "No",
            Explicacion: info.explicacion,
            "Monto actual": parseAmount(row.monto_operacion ?? resolvedAttrs(row).monto_operacion) || "",
            "Monto anterior": auditValueText(event.previous_value ?? event.historical_value),
            "Monto nuevo": auditValueText(event.current_value ?? event.new_value),
            Campo: field === "labels" ? "Venta" : field || "Dato del lead",
            "Fecha del cambio": event.changed_at || event.detected_at || "",
        });
    });

    return result.sort((a, b) =>
        cleanText(b["Fecha del cambio"]).localeCompare(cleanText(a["Fecha del cambio"]))
        || Number(b["ID Conversacion"] || 0) - Number(a["ID Conversacion"] || 0)
    );
};

const buildTabSections = (report: any, tabId: string, rows: any[], rangeLabel: string, isSingleTab: boolean, auditEvents: any[] = []): ReportSection[] => {
    const label = TAB_LABELS[tabId] || tabId;
    const auditRows = buildCommercialAuditRows(rows, report, auditEvents);
    const sections: ReportSection[] = [
        {
            title: `${label} - 00 Resumen`,
            sheetName: sheetNameFor(tabId, "00 Resumen", isSingleTab),
            kind: "summary",
            description: "Contexto del reporte, filtros aplicados, fecha de generacion y notas de lectura.",
            rows: ensureRows(metadataRows(report, tabId, rows, rangeLabel)),
        },
        {
            title: `${label} - 01 KPIs`,
            sheetName: sheetNameFor(tabId, "01 KPIs", isSingleTab),
            kind: "kpi",
            description: "Metricas principales con formula e interpretacion.",
            rows: ensureRows(kpiRows(tabId, rows, report)),
        },
        {
            title: `${label} - 02 Analisis`,
            sheetName: sheetNameFor(tabId, "02 Analisis", isSingleTab),
            kind: "analysis",
            description: "Cortes por canal, campana, etapa, responsable, estado o calidad segun la pestana.",
            rows: ensureRows(analysisRows(tabId, rows, report)),
        },
    ];

    if (auditRows.length > 0) {
        sections.push({
            title: `${label} - 03 Cambios relevantes`,
            sheetName: sheetNameFor(tabId, "03 Cambios relevantes", isSingleTab),
            kind: "analysis",
            description: "Cambios comerciales importantes que ayudan a entender ventas y montos del reporte.",
            rows: auditRows,
        });
    }

    sections.push(
        {
            title: `${label} - 99 Detalle`,
            sheetName: sheetNameFor(tabId, "99 Detalle", isSingleTab),
            kind: "detail",
            description: "Detalle completo para filtrar, revisar o cruzar con otras fuentes.",
            rows: ensureRows(detailRowsForTab(tabId, rows, report), "No hay leads en el detalle del periodo."),
        },
    );

    return sections;
};

const buildSections = (report: any, rows: any[], rangeLabel = "", auditEvents: any[] = []): ReportSection[] => {
    const profile = report.critical_profile_key ? CRITICAL_PROFILES[report.critical_profile_key] : null;
    const tabIds = Array.isArray(report.tab_ids) && report.tab_ids.length > 0
        ? report.tab_ids
        : profile?.tabIds || ["overview"];
    const isSingleTab = tabIds.length === 1;

    return tabIds.flatMap((tabId: string) => buildTabSections(report, tabId, rows, rangeLabel, isSingleTab, auditEvents));
};

const csvEscape = (value: unknown) => {
    const text = cleanText(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
};

const sectionToCsv = (section: ReportSection) => {
    const columns = Array.from(new Set(section.rows.flatMap((row) => Object.keys(row))));
    return [
        [csvEscape("Seccion"), csvEscape(section.title)].join(","),
        [csvEscape("Tipo"), csvEscape(section.kind || "datos")].join(","),
        [csvEscape("Descripcion"), csvEscape(section.description || "")].join(","),
        columns.map(csvEscape).join(","),
        ...section.rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
    ].join("\n");
};

const toCsv = (sections: ReportSection[]) => `\ufeff${sections.map(sectionToCsv).join("\n\n")}`;

const htmlEscape = (value: unknown) => cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const sheetName = (value: string) => cleanText(value)
    .replace(/[\\/?*\[\]:]/g, " ")
    .slice(0, 31) || "Reporte";

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

const toExcelXml = (sections: ReportSection[]) => {
    const usedNames = new Set<string>();
    const worksheets = sections.map((section) => {
        const columns = Array.from(new Set(section.rows.flatMap((row) => Object.keys(row))));
        const columnDefs = columns.map(() => `<Column ss:AutoFitWidth="1" ss:Width="140"/>`).join("");
        const header = `<Row>${columns.map((column) => `<Cell><Data ss:Type="String">${htmlEscape(column)}</Data></Cell>`).join("")}</Row>`;
        const rows = section.rows.map((row) => (
            `<Row>${columns.map((column) => {
                const rawValue = row[column];
                const numericValue = Number(rawValue);
                const isNumeric = rawValue !== "" && rawValue !== null && rawValue !== undefined && Number.isFinite(numericValue);
                return `<Cell><Data ss:Type="${isNumeric ? "Number" : "String"}">${htmlEscape(isNumeric ? numericValue : rawValue)}</Data></Cell>`;
            }).join("")}</Row>`
        )).join("");
        const autoFilter = columns.length > 0 ? `<x:AutoFilter x:Range="R1C1:R${section.rows.length + 1}C${columns.length}"/>` : "";

        return `<Worksheet ss:Name="${htmlEscape(uniqueSheetName(section.sheetName || section.title, usedNames))}"><Table>${columnDefs}${header}${rows}</Table>${autoFilter}</Worksheet>`;
    }).join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 ${worksheets}
</Workbook>`;
};

const toPdfSafe = (value: unknown) => cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const wrapLine = (value: string, maxLength = 96) => {
    const line = toPdfSafe(value);
    if (line.length <= maxLength) return [line];
    const chunks: string[] = [];
    let remaining = line;
    while (remaining.length > maxLength) {
        const splitAt = remaining.lastIndexOf(" ", maxLength);
        const index = splitAt > 20 ? splitAt : maxLength;
        chunks.push(remaining.slice(0, index));
        remaining = remaining.slice(index).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
};

const pdfEscape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const toPdf = (title: string, sections: ReportSection[]) => {
    const lines = [
        title,
        "Reporte ejecutivo del dashboard",
        `Generado: ${generatedAtLocal()}`,
        `Zona horaria: ${TIMEZONE}`,
        "Nota: el PDF resume la lectura ejecutiva. Excel/CSV contienen el detalle filtrable.",
        "",
    ];
    sections.forEach((section) => {
        lines.push(section.title);
        if (section.description) lines.push(section.description);
        const columns = Array.from(new Set(section.rows.flatMap((row) => Object.keys(row)))).slice(0, section.kind === "detail" ? 8 : 10);
        const rowLimit = section.kind === "detail" ? 40 : 120;
        lines.push(columns.join(" | "));
        section.rows.slice(0, rowLimit).forEach((row) => lines.push(columns.map((column) => cleanText(row[column])).join(" | ")));
        if (section.rows.length > rowLimit) lines.push(`... ${section.rows.length - rowLimit} filas adicionales en Excel/CSV`);
        lines.push("");
    });

    const wrapped = lines.flatMap((line) => wrapLine(line));
    const pages: string[][] = [];
    for (let index = 0; index < wrapped.length; index += 48) pages.push(wrapped.slice(index, index + 48));

    const objects: string[] = [];
    const addObject = (body: string) => {
        objects.push(body);
        return objects.length;
    };

    const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
    const pagesId = addObject("__PAGES__");
    const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const pageIds: number[] = [];

    pages.forEach((page) => {
        const streamLines = ["BT", "/F1 9 Tf", "40 800 Td"];
        page.forEach((line, index) => {
            if (index > 0) streamLines.push("0 -14 Td");
            streamLines.push(`(${pdfEscape(line)}) Tj`);
        });
        streamLines.push("ET");
        const stream = streamLines.join("\n");
        const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
        const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
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

const buildAttachments = (report: any, rows: any[], rangeLabel: string, auditEvents: any[] = []) => {
    const profile = report.critical_profile_key ? CRITICAL_PROFILES[report.critical_profile_key] : null;
    const formats: ReportFormat[] = Array.isArray(report.file_formats) && report.file_formats.length > 0
        ? report.file_formats
        : profile?.formats || ["excel"];
    const sections = buildSections(report, rows, rangeLabel, auditEvents);
    const safeName = cleanText(report.name || profile?.label || "reporte").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();

    return formats.map((format) => {
        if (format === "csv") {
            return {
                filename: `${safeName}_${rangeLabel}.csv`,
                content: stringToBase64(toCsv(sections)),
            };
        }

        if (format === "pdf") {
            return {
                filename: `${safeName}_${rangeLabel}.pdf`,
                content: stringToBase64(toPdf(report.name || profile?.label || "Reporte programado", sections)),
            };
        }

        return {
            filename: `${safeName}_${rangeLabel}.xls`,
            content: stringToBase64(toExcelXml(sections)),
        };
    });
};

const sendEmail = async (params: {
    apiKey: string;
    from: string;
    to: string[];
    subject: string;
    html: string;
    attachments: Array<{ filename: string; content: string }>;
}) => {
    const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${params.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`Resend ${response.status}: ${JSON.stringify(body)}`);
    }
    return body;
};

const processReport = async (supabase: any, report: any, env: { resendKey: string; fromEmail: string }, now: Date, force = false) => {
    if (!force && !isScheduleDue(report, now)) return { id: report.id, status: "skipped" };

    const range = closedPeriodRange(report.frequency, now);
    let runId: string | null = null;
    const recipients = cleanText(report.recipients)
        .split(/[;,\n]/)
        .map((email) => email.trim())
        .filter(Boolean);

    const formats = Array.isArray(report.file_formats) && report.file_formats.length > 0 ? report.file_formats : ["excel"];

    try {
        const { data: run, error: runError } = await supabase
            .schema("cw")
            .from("automated_report_runs")
            .insert({
                automated_report_id: report.id,
                status: "running",
                recipients: recipients.join(", "),
                file_formats: formats,
                report_scope: report.report_scope as ReportScope,
                tab_ids: report.tab_ids || [],
                critical_profile_key: report.critical_profile_key || null,
                scheduled_for: now.toISOString(),
                metadata: { range },
            })
            .select("id")
            .single();

        if (runError) throw runError;
        runId = run?.id || null;

        if (recipients.length === 0) throw new Error("El reporte no tiene destinatarios configurados.");

        const rows = await fetchConversationRows(supabase, report, range);
        const auditEvents = await fetchCommercialAuditEvents(supabase, range);
        const attachments = buildAttachments(report, rows, range.label, auditEvents);
        const subject = `${report.name} - ${range.label}`;
        const response = await sendEmail({
            apiKey: env.resendKey,
            from: env.fromEmail,
            to: recipients,
            subject,
            html: `<p>Adjuntamos el reporte <strong>${report.name}</strong> para el periodo <strong>${range.label}</strong>.</p><p>Conversaciones incluidas: ${rows.length}.</p>`,
            attachments,
        });

        await supabase
            .schema("cw")
            .from("automated_report_runs")
            .update({
                status: "success",
                finished_at: new Date().toISOString(),
                metadata: { range, resend: response, conversations: rows.length, commercial_audit_events: auditEvents.length },
            })
            .eq("id", runId);

        await supabase
            .schema("cw")
            .from("automated_reports")
            .update({
                last_run_at: new Date().toISOString(),
                last_status: "success",
                last_error: null,
                updated_at: new Date().toISOString(),
            })
            .eq("id", report.id);

        return { id: report.id, status: "success", rows: rows.length };
    } catch (error) {
        const message = errorMessage(error);
        if (runId) {
            await supabase
                .schema("cw")
                .from("automated_report_runs")
                .update({ status: "error", finished_at: new Date().toISOString(), error_message: message })
                .eq("id", runId);
        }
        await supabase
            .schema("cw")
            .from("automated_reports")
            .update({ last_status: "error", last_error: message, updated_at: new Date().toISOString() })
            .eq("id", report.id);
        return { id: report.id, status: "error", error: message };
    }
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const resendKey = Deno.env.get("RESEND_API_KEY");
        const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "Simplia Reportes <onboarding@resend.dev>";

        if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase service role environment variables.");
        if (!resendKey) throw new Error("Missing RESEND_API_KEY.");

        const payload = await req.json().catch(() => ({}));
        const force = payload.force === true;
        const ids = Array.isArray(payload.ids) ? payload.ids.map(String) : [];
        const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

        let query = supabase
            .schema("cw")
            .from("automated_reports")
            .select("*")
            .eq("is_active", true);

        if (ids.length > 0) query = query.in("id", ids);

        const { data: reports, error } = await query;
        if (error) throw error;

        const now = new Date();
        const results = [];
        for (const report of reports || []) {
            results.push(await processReport(supabase, report, { resendKey, fromEmail }, now, force));
        }

        return new Response(JSON.stringify({ ok: true, processed: results }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({ ok: false, error: errorMessage(error) }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
