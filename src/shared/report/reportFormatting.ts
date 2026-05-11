export const REPORT_TIME_ZONE = "America/Guayaquil";

export const cleanReportText = (value: unknown) => String(value ?? "").trim();

export const safeSheetName = (name: string) => cleanReportText(name)
    .replace(/[\\/?*:[\]]/g, " ")
    .slice(0, 31) || "Reporte";

export const safeFilePart = (name: string) => cleanReportText(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "reporte";

export const parseTimestampMs = (value: unknown) => {
    if (!value) return 0;
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric < 10000000000 ? numeric * 1000 : numeric;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

export const startOfLocalDay = (date: Date) => {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
};

export const endOfLocalDay = (date: Date) => {
    const next = new Date(date);
    next.setHours(23, 59, 59, 999);
    return next;
};

export const normalizeCell = (value: unknown) => {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(normalizeCell).filter(Boolean).join(", ");
    if (typeof value === "object") {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
};

export const numberCell = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const formatReportDateTime = (value: unknown = new Date()) => {
    const date = value instanceof Date ? value : new Date(parseTimestampMs(value));
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("es-EC", {
        timeZone: REPORT_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
};
