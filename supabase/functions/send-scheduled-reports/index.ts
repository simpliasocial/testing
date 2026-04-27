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

const TAB_LABELS: Record<string, string> = {
    overview: "Estrategia",
    funnel: "Embudo",
    operational: "Operacion",
    followup: "Seguimiento",
    performance: "Rendimiento Humano",
    trends: "Tendencias",
    scoring: "Scores",
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

const asObject = (value: unknown): Record<string, any> =>
    value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

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

const rowLabelArray = (row: any) => Array.isArray(row.labels)
    ? row.labels.map((label: unknown) => cleanText(label)).filter(Boolean)
    : [];

const hasAnyRowLabel = (row: any, expectedLabels: string[]) => {
    const labelSet = new Set(rowLabelArray(row));
    return expectedLabels.some((label) => labelSet.has(label));
};

const labels = (row: any) => Array.isArray(row.labels) ? row.labels.join(", ") : "";

const stage = (row: any) => {
    const rowLabels = Array.isArray(row.labels) ? row.labels : [];
    if (rowLabels.includes("venta_exitosa") || rowLabels.includes("venta")) return "Venta exitosa";
    if (rowLabels.includes("cita_agendada") || rowLabels.includes("cita_agendada_humano") || rowLabels.includes("cita")) return "Cita agendada";
    if (rowLabels.includes("seguimiento_humano")) return "Seguimiento humano";
    if (rowLabels.includes("interesado")) return "SQL";
    return "Otro";
};

const detailRow = (row: any) => {
    const attrs = resolvedAttrs(row);
    return {
        ID: row.chatwoot_conversation_id || row.id,
        Nombre: row.nombre_completo || row.meta?.sender?.name || attrs.nombre_completo || "Sin nombre",
        Telefono: row.celular || row.meta?.sender?.phone_number || attrs.celular || "",
        Canal: row.canal || attrs.canal || "Otro",
        Etiquetas: labels(row),
        Etapa: stage(row),
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

const summaryRows = (tabId: string, rows: any[]) => {
    const total = rows.length;
    const sales = rows.filter((row) => stage(row) === "Venta exitosa");
    const appointments = rows.filter((row) => stage(row) === "Cita agendada");
    const revenue = sales.reduce((sum, row) => sum + parseAmount(row.monto_operacion ?? resolvedAttrs(row).monto_operacion), 0);
    const byChannel = new Map<string, number>();
    rows.forEach((row) => {
        const channel = detailRow(row).Canal || "Otro";
        byChannel.set(channel, (byChannel.get(channel) || 0) + 1);
    });

    if (["trends", "overview", "operational"].includes(tabId)) {
        return [
            { Metrica: "Total leads", Valor: total },
            { Metrica: "Citas agendadas", Valor: appointments.length },
            { Metrica: "Ventas exitosas", Valor: sales.length },
            { Metrica: "Monto ventas", Valor: revenue },
            ...Array.from(byChannel.entries()).map(([channel, count]) => ({ Metrica: `Canal ${channel}`, Valor: count })),
        ];
    }

    return [
        { Metrica: "Total leads", Valor: total },
        { Metrica: "Citas agendadas", Valor: appointments.length },
        { Metrica: "Ventas exitosas", Valor: sales.length },
        { Metrica: "Monto ventas", Valor: revenue },
    ];
};

const buildSections = (report: any, rows: any[]) => {
    const profile = report.critical_profile_key ? CRITICAL_PROFILES[report.critical_profile_key] : null;
    const tabIds = Array.isArray(report.tab_ids) && report.tab_ids.length > 0
        ? report.tab_ids
        : profile?.tabIds || ["overview"];

    if (tabIds.length === 1 && tabIds[0] === "chats") {
        return [
            {
                title: "Resumen Etiquetas Actividades",
                rows: labelSummaryRows(rows, "Resumen Etiquetas Actividades", "Total Leads de Actividades"),
            },
            {
                title: "Detalle Leads Actividades",
                rows: rows.map(detailRow),
            },
            {
                title: "Resumen Etiquetas Unicas",
                rows: labelSummaryRows(rows, "Resumen Etiquetas Unicas", "Total Leads Unicos"),
            },
            {
                title: "Detalle Leads Unicas",
                rows: rows.map(detailRow),
            },
        ];
    }

    if (tabIds.length === 1 && tabIds[0] === "followup") {
        const followupRows = rows.filter((row) => hasAnyRowLabel(row, ["seguimiento_humano"]));
        const appointmentRows = rows.filter((row) => hasAnyRowLabel(row, ["cita_agendada", "cita_agendada_humano", "cita"]));
        const salesRows = rows.filter((row) => hasAnyRowLabel(row, ["venta_exitosa", "venta"]));
        const totalSales = salesRows.reduce((sum, row) => sum + parseAmount(row.monto_operacion ?? resolvedAttrs(row).monto_operacion), 0);

        return [
            {
                title: "Resumen Seguimiento",
                rows: [
                    { Metrica: "Leads en Cola de Trabajo Diaria", Valor: followupRows.length },
                    { Metrica: "Leads en Citas Agendadas", Valor: appointmentRows.length },
                    { Metrica: "Ventas exitosas", Valor: salesRows.length },
                    { Metrica: "Monto total ventas", Valor: totalSales },
                    { Metrica: "Ticket promedio", Valor: salesRows.length > 0 ? totalSales / salesRows.length : 0 },
                ],
            },
            {
                title: "Cola Trabajo Diaria",
                rows: followupRows.map(queueRow),
            },
            {
                title: "Citas Agendadas",
                rows: appointmentRows.map(queueRow),
            },
            {
                title: "Reporte Ventas Exitosas",
                rows: [
                    { Metrica: "Ventas exitosas", Valor: salesRows.length },
                    { Metrica: "Monto total", Valor: totalSales },
                    { Metrica: "Ticket promedio", Valor: salesRows.length > 0 ? totalSales / salesRows.length : 0 },
                ],
            },
            {
                title: "Ventas Por Canal",
                rows: groupSalesByChannel(salesRows),
            },
            {
                title: "Ventas Por Mes",
                rows: groupSalesByMonth(salesRows),
            },
            {
                title: "Detalle Ventas",
                rows: salesRows.map(salesDetailRow),
            },
        ];
    }

    return tabIds.flatMap((tabId: string) => [
        {
            title: `${TAB_LABELS[tabId] || tabId} - Resumen`,
            rows: summaryRows(tabId, rows),
        },
        {
            title: `${TAB_LABELS[tabId] || tabId} - Detalle`,
            rows: rows.map(detailRow),
        },
    ]);
};

const csvEscape = (value: unknown) => {
    const text = cleanText(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
};

const sectionToCsv = (section: { title: string; rows: any[] }) => {
    const columns = Array.from(new Set(section.rows.flatMap((row) => Object.keys(row))));
    return [
        csvEscape(section.title),
        columns.map(csvEscape).join(","),
        ...section.rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
    ].join("\n");
};

const toCsv = (sections: Array<{ title: string; rows: any[] }>) => `\ufeff${sections.map(sectionToCsv).join("\n\n")}`;

const htmlEscape = (value: unknown) => cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const sheetName = (value: string) => cleanText(value)
    .replace(/[\\/?*\[\]:]/g, " ")
    .slice(0, 31) || "Reporte";

const toExcelXml = (sections: Array<{ title: string; rows: any[] }>) => {
    const worksheets = sections.map((section) => {
        const columns = Array.from(new Set(section.rows.flatMap((row) => Object.keys(row))));
        const header = `<Row>${columns.map((column) => `<Cell><Data ss:Type="String">${htmlEscape(column)}</Data></Cell>`).join("")}</Row>`;
        const rows = section.rows.map((row) => (
            `<Row>${columns.map((column) => {
                const rawValue = row[column];
                const numericValue = Number(rawValue);
                const isNumeric = rawValue !== "" && rawValue !== null && rawValue !== undefined && Number.isFinite(numericValue);
                return `<Cell><Data ss:Type="${isNumeric ? "Number" : "String"}">${htmlEscape(isNumeric ? numericValue : rawValue)}</Data></Cell>`;
            }).join("")}</Row>`
        )).join("");

        return `<Worksheet ss:Name="${htmlEscape(sheetName(section.title))}"><Table>${header}${rows}</Table></Worksheet>`;
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

const toPdf = (title: string, sections: Array<{ title: string; rows: any[] }>) => {
    const lines = [title, `Generado: ${new Date().toISOString()}`, ""];
    sections.forEach((section) => {
        lines.push(section.title);
        const columns = Array.from(new Set(section.rows.flatMap((row) => Object.keys(row)))).slice(0, 8);
        lines.push(columns.join(" | "));
        section.rows.slice(0, 120).forEach((row) => lines.push(columns.map((column) => cleanText(row[column])).join(" | ")));
        if (section.rows.length > 120) lines.push(`... ${section.rows.length - 120} filas adicionales en Excel/CSV`);
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

const buildAttachments = (report: any, rows: any[], rangeLabel: string) => {
    const profile = report.critical_profile_key ? CRITICAL_PROFILES[report.critical_profile_key] : null;
    const formats: ReportFormat[] = Array.isArray(report.file_formats) && report.file_formats.length > 0
        ? report.file_formats
        : profile?.formats || ["excel"];
    const sections = buildSections(report, rows);
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
                content: stringToBase64(toPdf(report.name, sections)),
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
        const attachments = buildAttachments(report, rows, range.label);
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
                metadata: { range, resend: response, conversations: rows.length },
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
