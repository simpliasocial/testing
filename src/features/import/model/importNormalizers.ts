import * as XLSX from "xlsx";

export const normalizeText = (value: unknown) =>
    String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

export const normalizeCell = (value: unknown) => {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
    return String(value).trim();
};

export const isBlankCell = (value: unknown) => normalizeCell(value) === "";

export const normalizePhoneValue = (value: unknown) => {
    const raw = normalizeCell(value).replace(/^[`'"\s]+/, "");
    if (!raw) return "";
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length < 7 || digits.length > 16) return "";
    if (digits.startsWith("593")) return `+${digits}`;
    if (digits.length === 10 && digits.startsWith("0")) return `+593${digits.slice(1)}`;
    if (digits.length === 9 && digits.startsWith("9")) return `+593${digits}`;
    if (raw.trim().startsWith("+")) return `+${digits}`;
    return digits.length > 10 ? `+${digits}` : digits;
};

export const snakeCase = (value: unknown) =>
    normalizeText(value)
        .replace(/\s+/g, "_")
        .replace(/^_+|_+$/g, "");

const LABEL_ALIAS_EXACT: Record<string, string> = {
    bienvenida: "bienvenida",
    interesado: "interesado",
    solicita_informacion: "solicita_informacion",
    "solicita informacion": "solicita_informacion",
    desinteresado: "desinteresado",
    cita_agendada: "cita_agendada",
    "cita agendada": "cita_agendada",
    cita_agendada_humano: "cita_agendada_humano",
    "cita agendada humano": "cita_agendada_humano",
    venta_exitosa: "venta_exitosa",
    "venta exitosa": "venta_exitosa",
    seguimiento_humano: "seguimiento_humano",
    "seguimiento humano": "seguimiento_humano",
};

const LABEL_ALIAS_PATTERNS: Array<{ label: string; patterns: string[] }> = [
    { label: "venta_exitosa", patterns: ["venta exitosa", "venta realizada", "vendido", "pagado", "pago realizado", "cerrado"] },
    { label: "cita_agendada_humano", patterns: ["cita humana", "cita manual", "agendada humano", "agendada por humano"] },
    { label: "cita_agendada", patterns: ["cita agendada", "agendado", "agenda", "cita"] },
    { label: "seguimiento_humano", patterns: ["seguimiento humano", "requiere humano", "asesor", "humano", "seguimiento"] },
    { label: "desinteresado", patterns: ["desinteresado", "descartado", "no interesado", "no interesa", "perdido"] },
    { label: "solicita_informacion", patterns: ["solicita informacion", "pide informacion", "informacion", "info", "costos", "precio"] },
    { label: "interesado", patterns: ["interesado", "interes", "quiere avanzar", "oportunidad"] },
    { label: "bienvenida", patterns: ["bienvenida", "primer contacto", "nuevo lead", "entrada"] },
];

export const normalizeLeadLabel = (value: unknown) => {
    const normalized = normalizeText(value);
    if (!normalized) return "";
    if (LABEL_ALIAS_EXACT[normalized]) return LABEL_ALIAS_EXACT[normalized];

    const match = LABEL_ALIAS_PATTERNS.find((item) =>
        item.patterns.some((pattern) => normalized.includes(pattern))
    );
    return match?.label || snakeCase(value);
};

export const splitLabels = (values: unknown[]) => {
    const all = values.flatMap((val) => {
        const text = normalizeCell(val);
        if (!text) return [];
        return text.split(/[|,;]+/).map((s) => s.trim()).filter(Boolean);
    });
    return Array.from(new Set(all.map(normalizeLeadLabel).filter(Boolean)));
};

export const channelAlias = (value: unknown) => {
    const text = normalizeText(value);
    if (!text) return "";
    if (["wsp", "wa", "whatsapp", "whats app"].some((token) => text.includes(token))) return "WhatsApp";
    if (["fb", "facebook", "messenger"].some((token) => text === token || text.includes(token))) return "Facebook";
    if (text.includes("instagram") || text === "ig") return "Instagram";
    if (text.includes("tiktok") || text.includes("tik tok")) return "TikTok";
    if (text.includes("telegram")) return "Telegram";
    if (text.includes("web") || text.includes("formulario") || text.includes("sitio")) return "Sitio web";
    return "";
};

export const normalizeChannelValue = (value: unknown) => channelAlias(value);

export const parseAmountValue = (value: unknown): { raw: string; number: number } => {
    const raw = normalizeCell(value);
    if (!raw) return { raw: "", number: 0 };

    let clean = raw.replace(/[^0-9,.-]/g, "");
    const lastComma = clean.lastIndexOf(",");
    const lastDot = clean.lastIndexOf(".");

    if (lastComma > -1 && lastDot > -1) {
        const decimalSeparator = lastComma > lastDot ? "," : ".";
        const groupSeparator = decimalSeparator === "," ? "." : ",";
        clean = clean.replace(new RegExp(`\\${groupSeparator}`, "g"), "");
        clean = clean.replace(decimalSeparator, ".");
    } else if (lastComma > -1 && lastDot === -1) {
        clean = clean.replace(",", ".");
    } else {
        clean = clean.replace(/,/g, "");
    }

    const parsed = Number.parseFloat(clean);
    return { raw, number: Number.isFinite(parsed) ? parsed : 0 };
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const toGuayaquilIso = (
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
) => {
    const iso = `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}.000-05:00`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

export const parseLeadDate = (value: unknown): string => {
    if (!value) return "";
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();

    if (typeof value === "number" && Number.isFinite(value)) {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed) {
            return toGuayaquilIso(parsed.y, parsed.m, parsed.d, parsed.H || 0, parsed.M || 0, Math.floor(parsed.S || 0));
        }
    }

    const raw = normalizeCell(value);
    if (!raw) return "";

    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 20000 && numeric < 80000) {
        return parseLeadDate(numeric);
    }

    const dayFirst = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (dayFirst) {
        const year = Number(dayFirst[3].length === 2 ? `20${dayFirst[3]}` : dayFirst[3]);
        return toGuayaquilIso(
            year,
            Number(dayFirst[2]),
            Number(dayFirst[1]),
            Number(dayFirst[4] || 0),
            Number(dayFirst[5] || 0),
            Number(dayFirst[6] || 0),
        );
    }

    const yearFirst = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (yearFirst) {
        return toGuayaquilIso(
            Number(yearFirst[1]),
            Number(yearFirst[2]),
            Number(yearFirst[3]),
            Number(yearFirst[4] || 0),
            Number(yearFirst[5] || 0),
            Number(yearFirst[6] || 0),
        );
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
};

export const parseScore = (value: unknown) => {
    const text = normalizeCell(value);
    if (!text) return null;
    const parsed = Number.parseFloat(text.replace(",", ".").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
};
