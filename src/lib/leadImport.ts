import * as XLSX from "xlsx";
import { config } from "@/config";
import { supabase } from "@/lib/supabase";

export type LeadImportTargetField =
    | "externalId"
    | "name"
    | "phone"
    | "channel"
    | "labels"
    | "amount"
    | "paymentDate"
    | "createdAt"
    | "updatedAt"
    | "email"
    | "stage"
    | "score"
    | "campaign"
    | "city";

export interface LeadImportTargetDefinition {
    id: LeadImportTargetField;
    label: string;
    description: string;
    required?: boolean;
    preview?: boolean;
}

export interface LeadImportColumn {
    id: string;
    index: number;
    header: string;
    displayName: string;
    normalizedHeader: string;
    filledCount: number;
    sampleValues: string[];
    duplicateGroupSize: number;
}

export interface ParsedLeadImportFile {
    fileName: string;
    fileType: string;
    sheetName: string;
    sourceSystem: string;
    headerRowIndex: number;
    columns: LeadImportColumn[];
    rows: unknown[][];
    totalRows: number;
    encoding?: string;
}

export type LeadImportMapping = Record<LeadImportTargetField, string[]>;

export interface LeadImportPreviewRow {
    rowNumber: number;
    identityKey: string;
    externalLeadId: string;
    sourceIdentity: "external_id" | "phone" | "name_date";
    conversationId: number;
    contactId: number;
    name: string;
    phone: string;
    channel: string;
    labels: string[];
    amountRaw: string;
    amountNumber: number;
    paymentDateIso: string;
    createdAtIso: string;
    updatedAtIso: string;
    email: string;
    stage: string;
    score: number | null;
    campaign: string;
    city: string;
    dateWarnings: string[];
    rawRow: Record<string, unknown>;
}

export interface LeadImportIssue {
    rowNumber: number;
    severity: "error" | "warning";
    field?: string;
    reason: string;
    rawRow: Record<string, unknown>;
}

export interface LeadImportPreviewStats {
    totalRows: number;
    validRows: number;
    uniqueRows: number;
    skippedRows: number;
    duplicateRows: number;
    missingPhoneRows: number;
    missingLabelRows: number;
    missingChannelRows: number;
    dateWarningRows: number;
    amountTotal: number;
    minCreatedAt?: string;
    maxCreatedAt?: string;
    channelCounts: Record<string, number>;
    labelCounts: Record<string, number>;
}

export interface LeadImportPreview {
    rows: LeadImportPreviewRow[];
    issues: LeadImportIssue[];
    stats: LeadImportPreviewStats;
}

export interface ExistingImportRow {
    chatwoot_conversation_id: number;
    labels?: string[];
    custom_attributes?: Record<string, unknown>;
    conversation_custom_attributes?: Record<string, unknown>;
    contact_custom_attributes?: Record<string, unknown>;
}

export interface LeadImportCommitPlan {
    rows: LeadImportPreviewRow[];
    existingRowsById: Map<number, ExistingImportRow>;
    createCount: number;
    updateCount: number;
}

export interface LeadImportSaveResult {
    batchId: string;
    created: number;
    updated: number;
    skipped: number;
    warnings: number;
}

export const LEAD_IMPORT_TARGETS: LeadImportTargetDefinition[] = [
    { id: "externalId", label: "ID del lead", description: "Identificador único del cliente o sistema origen.", required: true, preview: true },
    { id: "name", label: "Nombre", description: "Nombre visible del lead.", required: true, preview: true },
    { id: "phone", label: "Teléfono", description: "Teléfono principal. Se normaliza a Ecuador +593.", required: true, preview: true },
    { id: "createdAt", label: "Fecha creación del lead", description: "Fecha en que se creó el lead.", required: true, preview: true },
    { id: "email", label: "Correo", description: "Correo del contacto." },
    { id: "campaign", label: "Campaña", description: "Campaña, anuncio u origen UTM." },
    { id: "city", label: "Ciudad", description: "Ciudad del lead." },
    { id: "channel", label: "Canal/red social", description: "Origen comercial o red social.", preview: true },
    { id: "labels", label: "Etiqueta/etapa", description: "Estado, etiqueta, etapa o pipeline. Se normaliza a snake_case.", preview: true },
    { id: "amount", label: "Valor de venta", description: "Monto pagado o valor comercial cuando el lead es venta exitosa.", preview: true },
    { id: "paymentDate", label: "Fecha de pago", description: "Fecha en que se registró el pago o valor de venta.", preview: true },
    { id: "updatedAt", label: "Fecha última modificación", description: "Última modificación o última actividad del lead.", preview: true },
    { id: "stage", label: "Estado/etapa de origen", description: "Campo opcional para conservar la etapa original." },
    { id: "score", label: "Score", description: "Puntaje de interés o calidad si el archivo lo trae." },
];

const fieldIds = LEAD_IMPORT_TARGETS.map((target) => target.id);

const emptyMapping = (): LeadImportMapping =>
    Object.fromEntries(fieldIds.map((field) => [field, []])) as LeadImportMapping;

const normalizeText = (value: unknown) =>
    String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

const compactText = (value: unknown) => String(value ?? "").trim();

const normalizeCell = (value: unknown) => {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
    return String(value).trim();
};

const isBlankCell = (value: unknown) => normalizeCell(value) === "";

const toRawRowObject = (row: unknown[], columns: LeadImportColumn[]) =>
    Object.fromEntries(columns.map((column) => [column.displayName, row[column.index] ?? ""]));

const chooseCsvEncoding = (buffer: ArrayBuffer) => {
    const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    let windows1252 = utf8;
    try {
        windows1252 = new TextDecoder("windows-1252", { fatal: false }).decode(buffer);
    } catch {
        return { text: utf8, encoding: "utf-8" };
    }

    const score = (text: string) =>
        (text.match(/\uFFFD/g) || []).length * 3 +
        (text.match(/[ÃÂ][\x80-\xBFa-zA-Z]/g) || []).length +
        (text.match(/�/g) || []).length * 3;

    return score(windows1252) < score(utf8)
        ? { text: windows1252, encoding: "windows-1252" }
        : { text: utf8, encoding: "utf-8" };
};

const getFileType = (fileName: string) => {
    const extension = fileName.split(".").pop()?.toLowerCase() || "xlsx";
    if (extension === "csv") return "csv";
    if (extension === "xls") return "xls";
    return "xlsx";
};

const nonEmptyCount = (row: unknown[] = []) => row.filter((cell) => !isBlankCell(cell)).length;

const findHeaderRowIndex = (rows: unknown[][]) => {
    const candidates = rows.slice(0, 10);
    let bestIndex = 0;
    let bestScore = 0;

    candidates.forEach((row, index) => {
        const filled = nonEmptyCount(row);
        const textCells = row.filter((cell) => typeof cell === "string" && normalizeCell(cell).length > 0).length;
        const score = filled + textCells * 0.5;
        if (filled >= 2 && score > bestScore) {
            bestScore = score;
            bestIndex = index;
        }
    });

    return bestIndex;
};

const buildColumns = (headerRow: unknown[], dataRows: unknown[][]): LeadImportColumn[] => {
    const maxColumns = Math.max(headerRow.length, ...dataRows.slice(0, 50).map((row) => row.length), 0);
    const headers = Array.from({ length: maxColumns }, (_, index) => {
        const rawHeader = normalizeCell(headerRow[index]);
        return rawHeader || `Columna ${index + 1}`;
    });

    const normalizedCounts = headers.reduce<Record<string, number>>((acc, header) => {
        const key = normalizeText(header) || header.toLowerCase();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const seen = new Map<string, number>();

    return headers.map((header, index) => {
        const normalizedHeader = normalizeText(header) || header.toLowerCase();
        const duplicateGroupSize = normalizedCounts[normalizedHeader] || 1;
        const duplicateIndex = (seen.get(normalizedHeader) || 0) + 1;
        seen.set(normalizedHeader, duplicateIndex);

        const values = dataRows.map((row) => normalizeCell(row[index])).filter(Boolean);
        const sampleValues = Array.from(new Set(values)).slice(0, 6);
        const suffix = duplicateGroupSize > 1 ? ` #${duplicateIndex}` : "";

        return {
            id: `c${index}`,
            index,
            header,
            displayName: `${header}${suffix}`,
            normalizedHeader,
            filledCount: values.length,
            sampleValues,
            duplicateGroupSize,
        };
    });
};

const detectSourceSystem = (columns: LeadImportColumn[]) => {
    const headers = columns.map((column) => column.normalizedHeader).join(" | ");
    if (
        headers.includes("nombre del lead") ||
        headers.includes("embudo de ventas") ||
        headers.includes("estatus del lead")
    ) {
        return "kommo";
    }
    return "excel";
};

export const readLeadImportFile = async (file: File): Promise<ParsedLeadImportFile> => {
    const fileType = getFileType(file.name);
    const buffer = await file.arrayBuffer();
    const encodingResult = fileType === "csv" ? chooseCsvEncoding(buffer) : undefined;
    const workbook = fileType === "csv"
        ? XLSX.read(encodingResult?.text || "", { type: "string", raw: true, cellDates: false })
        : XLSX.read(buffer, { type: "array", raw: true, cellDates: false });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("El archivo no tiene hojas legibles.");

    const worksheet = workbook.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        blankrows: false,
        raw: true,
    }) as unknown[][];

    if (allRows.length === 0) throw new Error("El archivo está vacío.");

    const headerRowIndex = findHeaderRowIndex(allRows);
    const dataRows = allRows
        .slice(headerRowIndex + 1)
        .filter((row) => nonEmptyCount(row) > 0);
    const columns = buildColumns(allRows[headerRowIndex] || [], dataRows);

    return {
        fileName: file.name,
        fileType,
        sheetName,
        sourceSystem: detectSourceSystem(columns),
        headerRowIndex,
        columns,
        rows: dataRows,
        totalRows: dataRows.length,
        encoding: encodingResult?.encoding,
    };
};

const headerHas = (column: LeadImportColumn, tokens: string[]) =>
    tokens.some((token) => column.normalizedHeader.includes(token));

const valueSamples = (column: LeadImportColumn) => column.sampleValues.map((sample) => normalizeCell(sample));

const phoneLike = (value: unknown) => {
    const text = normalizeCell(value);
    const digits = text.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 16;
};

const snakeCase = (value: unknown) =>
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

const channelAlias = (value: unknown) => {
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

const channelLike = (column: LeadImportColumn) => {
    const samples = valueSamples(column).filter(Boolean);
    if (samples.length === 0) return false;
    const matches = samples.filter((sample) => Boolean(channelAlias(sample))).length;
    return matches / samples.length >= 0.45;
};

const scoreColumn = (column: LeadImportColumn, field: LeadImportTargetField) => {
    const samples = valueSamples(column);
    const phoneScore = samples.filter(phoneLike).length;
    const dateScore = samples.filter((sample) => Boolean(parseLeadDate(sample))).length;
    const amountScore = samples.filter((sample) => parseAmountValue(sample).number > 0).length;
    const channelScore = channelLike(column) ? 30 : 0;

    switch (field) {
        case "externalId":
            if (headerHas(column, ["id externo", "id del lead", "lead id", "id lead", "id"])) return 95;
            return 0;
        case "name":
            if (headerHas(column, ["nombre completo", "nombre del lead", "nombre cliente", "cliente", "contacto"])) return 95;
            if (headerHas(column, ["nombre"]) && !headerHas(column, ["usuario", "responsable", "compania", "empresa"])) return 75;
            return 0;
        case "phone":
            if (headerHas(column, ["telefono", "teléfono", "celular", "movil", "móvil", "whatsapp", "numero", "número"])) return 95;
            return phoneScore >= 3 ? 70 : 0;
        case "channel":
            if (headerHas(column, ["canal", "origen", "fuente", "medio", "plataforma", "utm source", "utm_source"])) return 95;
            return channelScore;
        case "labels":
            if (headerHas(column, ["etiqueta", "label", "tag", "estado", "estatus", "etapa", "embudo", "pipeline", "fase"])) return 95;
            return channelScore >= 30 ? 45 : 0;
        case "amount":
            if (headerHas(column, ["presupuesto", "monto", "valor", "pago", "precio", "importe", "credito", "crédito"])) return 95;
            return amountScore >= 3 ? 60 : 0;
        case "paymentDate":
            if (headerHas(column, ["fecha de pago", "fecha pago", "fecha monto", "fecha de venta", "fecha venta", "fecha operacion", "fecha operación"])) return 95;
            return dateScore >= 3 && headerHas(column, ["pago", "monto", "venta", "operacion", "operación"]) ? 60 : 0;
        case "createdAt":
            if (headerHas(column, ["fecha de creacion", "fecha creacion", "fecha de creacion del lead", "fecha creacion lead", "fecha ingreso", "fecha de ingreso", "creado", "created"])) return 95;
            return dateScore >= 3 ? 45 : 0;
        case "updatedAt":
            if (headerHas(column, ["fecha de modificacion", "fecha modificacion", "fecha ultima modificacion", "fecha última modificación", "ultima modificacion", "última modificación", "fecha ultima actividad", "fecha última actividad", "ultima actividad", "última actividad", "modificado", "actualizado", "updated"])) return 95;
            return dateScore >= 3 ? 40 : 0;
        case "email":
            if (headerHas(column, ["correo", "email", "e mail", "mail"])) return 95;
            return samples.some((sample) => /\S+@\S+\.\S+/.test(sample)) ? 65 : 0;
        case "stage":
            if (headerHas(column, ["estado", "estatus", "etapa", "embudo", "pipeline", "fase"])) return 90;
            return 0;
        case "score":
            if (headerHas(column, ["score", "puntaje", "interes", "interés", "calidad"])) return 95;
            return 0;
        case "campaign":
            if (headerHas(column, ["campana", "campaña", "utm campaign", "utm_campaign", "utm content", "utm_content"])) return 95;
            return 0;
        case "city":
            if (headerHas(column, ["ciudad", "city", "localidad"])) return 95;
            return 0;
        default:
            return 0;
    }
};

const rankedColumns = (columns: LeadImportColumn[], field: LeadImportTargetField) =>
    columns
        .map((column) => ({ column, score: scoreColumn(column, field) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || b.column.filledCount - a.column.filledCount);

export const createDefaultLeadImportMapping = (columns: LeadImportColumn[]): LeadImportMapping => {
    const mapping = emptyMapping();

    fieldIds.forEach((field) => {
        if (["stage", "score"].includes(field)) {
            mapping[field] = [];
            return;
        }

        const ranked = rankedColumns(columns, field);
        const threshold = ["name", "phone"].includes(field) ? 70 : ["createdAt", "updatedAt", "paymentDate"].includes(field) ? 60 : 80;
        mapping[field] = ranked
            .filter((item) => item.score >= threshold)
            .slice(0, 1)
            .map((item) => item.column.id);
    });

    if (mapping.channel.length === 0) {
        const labelChannel = rankedColumns(columns, "labels").find((item) => channelLike(item.column));
        if (labelChannel) mapping.channel = [labelChannel.column.id];
    }

    return mapping;
};

const getColumnById = (columns: LeadImportColumn[], id: string) =>
    columns.find((column) => column.id === id);

const valuesForField = (
    row: unknown[],
    columns: LeadImportColumn[],
    mapping: LeadImportMapping,
    field: LeadImportTargetField,
) =>
    (mapping[field] || [])
        .map((columnId) => {
            const column = getColumnById(columns, columnId);
            return column ? normalizeCell(row[column.index]) : "";
        })
        .filter(Boolean);

const firstValueForField = (
    row: unknown[],
    columns: LeadImportColumn[],
    mapping: LeadImportMapping,
    field: LeadImportTargetField,
) => valuesForField(row, columns, mapping, field)[0] || "";

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

export const splitLabels = (values: unknown[]) => {
    const labels = values
        .flatMap((value) => normalizeCell(value).split(/[,;|]/))
        .map(normalizeLeadLabel)
        .filter(Boolean);

    return Array.from(new Set(labels));
};

export const normalizeChannelValue = (value: unknown) => {
    const alias = channelAlias(value);
    return alias || normalizeCell(value);
};

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

const parseScore = (value: unknown) => {
    const text = normalizeCell(value);
    if (!text) return null;
    const parsed = Number.parseFloat(text.replace(",", ".").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
};

const hashSeed = (seed: string) => {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

export const deterministicNegativeId = (seed: string) => {
    const hash = hashSeed(seed);
    return -(1000000000 + (hash % 1000000000));
};

const identityFromValues = (params: {
    sourceSystem: string;
    externalId: string;
    phone: string;
    name: string;
    createdAtIso: string;
}) => {
    if (params.externalId) {
        return {
            identityKey: `${params.sourceSystem}:external:${params.externalId}`,
            externalLeadId: params.externalId,
            sourceIdentity: "external_id" as const,
        };
    }
    if (params.phone) {
        return {
            identityKey: `${params.sourceSystem}:phone:${params.phone}`,
            externalLeadId: `phone:${params.phone}`,
            sourceIdentity: "phone" as const,
        };
    }
    if (params.name && params.createdAtIso) {
        return {
            identityKey: `${params.sourceSystem}:name_date:${normalizeText(params.name)}:${params.createdAtIso.slice(0, 10)}`,
            externalLeadId: `name_date:${normalizeText(params.name)}:${params.createdAtIso.slice(0, 10)}`,
            sourceIdentity: "name_date" as const,
        };
    }
    return null;
};

export const buildLeadImportPreview = (
    parsed: ParsedLeadImportFile,
    mapping: LeadImportMapping,
    sourceSystem: string,
): LeadImportPreview => {
    const rows: LeadImportPreviewRow[] = [];
    const issues: LeadImportIssue[] = [];
    const duplicateTracker = new Map<number, number>();

    parsed.rows.forEach((row, index) => {
        const rowNumber = parsed.headerRowIndex + index + 2;
        const rawRow = toRawRowObject(row, parsed.columns);
        const externalId = firstValueForField(row, parsed.columns, mapping, "externalId");
        const name = firstValueForField(row, parsed.columns, mapping, "name");
        const phone = normalizePhoneValue(firstValueForField(row, parsed.columns, mapping, "phone"));
        const stage = normalizeLeadLabel(firstValueForField(row, parsed.columns, mapping, "stage"));
        const labels = splitLabels([...valuesForField(row, parsed.columns, mapping, "labels"), stage]);
        const channelValue = firstValueForField(row, parsed.columns, mapping, "channel");
        const channel = normalizeChannelValue(channelValue) || labels.map(channelAlias).find(Boolean) || "";
        const amount = parseAmountValue(firstValueForField(row, parsed.columns, mapping, "amount"));
        const paymentRaw = firstValueForField(row, parsed.columns, mapping, "paymentDate");
        const createdRaw = firstValueForField(row, parsed.columns, mapping, "createdAt");
        const updatedRaw = firstValueForField(row, parsed.columns, mapping, "updatedAt");
        const parsedPaymentDate = parseLeadDate(paymentRaw);
        const parsedCreatedAt = parseLeadDate(createdRaw);
        const parsedUpdatedAt = parseLeadDate(updatedRaw);
        const dateWarnings: string[] = [];
        const blockingIssues: LeadImportIssue[] = [];

        if (!externalId) {
            blockingIssues.push({ rowNumber, severity: "error", field: "externalId", reason: "Falta ID del lead.", rawRow });
        }
        if (!name) {
            blockingIssues.push({ rowNumber, severity: "error", field: "name", reason: "Falta nombre del lead.", rawRow });
        }
        if (!phone) {
            blockingIssues.push({ rowNumber, severity: "error", field: "phone", reason: "Falta teléfono válido del lead.", rawRow });
        }
        if (!createdRaw) {
            blockingIssues.push({ rowNumber, severity: "error", field: "createdAt", reason: "Falta fecha de creación del lead.", rawRow });
        } else if (!parsedCreatedAt) {
            blockingIssues.push({ rowNumber, severity: "error", field: "createdAt", reason: "Fecha de creación no reconocida.", rawRow });
        }

        if (blockingIssues.length > 0) {
            issues.push(...blockingIssues);
            return;
        }

        if (paymentRaw && !parsedPaymentDate) dateWarnings.push("Fecha de pago no reconocida");
        if (updatedRaw && !parsedUpdatedAt) dateWarnings.push("Fecha modificación no reconocida");

        const createdAtIso = parsedCreatedAt;
        const updatedAtIso = parsedUpdatedAt || createdAtIso;
        const email = firstValueForField(row, parsed.columns, mapping, "email");
        const score = parseScore(firstValueForField(row, parsed.columns, mapping, "score"));
        const campaign = firstValueForField(row, parsed.columns, mapping, "campaign");
        const city = firstValueForField(row, parsed.columns, mapping, "city");
        const identity = identityFromValues({ sourceSystem, externalId, phone, name, createdAtIso });

        if (!identity) {
            issues.push({
                rowNumber,
                severity: "error",
                field: "identity",
                reason: "Fila sin identidad usable: falta ID externo, número o nombre con fecha.",
                rawRow,
            });
            return;
        }

        dateWarnings.forEach((reason) => {
            issues.push({ rowNumber, severity: "warning", field: "date", reason, rawRow });
        });

        const conversationId = deterministicNegativeId(`conversation:${identity.identityKey}`);
        const contactId = deterministicNegativeId(`contact:${identity.identityKey}`);
        duplicateTracker.set(conversationId, (duplicateTracker.get(conversationId) || 0) + 1);

        rows.push({
            rowNumber,
            identityKey: identity.identityKey,
            externalLeadId: identity.externalLeadId,
            sourceIdentity: identity.sourceIdentity,
            conversationId,
            contactId,
            name,
            phone,
            channel,
            labels,
            amountRaw: amount.raw,
            amountNumber: amount.number,
            paymentDateIso: parsedPaymentDate,
            createdAtIso,
            updatedAtIso,
            email,
            stage,
            score,
            campaign,
            city,
            dateWarnings,
            rawRow,
        });
    });

    const uniqueIds = new Set<number>();
    rows.forEach((row) => uniqueIds.add(row.conversationId));
    const duplicateRows = rows.filter((row) => (duplicateTracker.get(row.conversationId) || 0) > 1).length;
    const channelCounts: Record<string, number> = {};
    const labelCounts: Record<string, number> = {};
    const createdDates = rows.map((row) => row.createdAtIso).filter(Boolean).sort();

    rows.forEach((row) => {
        channelCounts[row.channel || "Sin canal"] = (channelCounts[row.channel || "Sin canal"] || 0) + 1;
        if (row.labels.length === 0) {
            labelCounts["Sin etiqueta"] = (labelCounts["Sin etiqueta"] || 0) + 1;
        } else {
            row.labels.forEach((label) => {
                labelCounts[label] = (labelCounts[label] || 0) + 1;
            });
        }
    });

    return {
        rows,
        issues,
        stats: {
            totalRows: parsed.totalRows,
            validRows: rows.length,
            uniqueRows: uniqueIds.size,
            skippedRows: parsed.totalRows - rows.length,
            duplicateRows,
            missingPhoneRows: rows.filter((row) => !row.phone).length,
            missingLabelRows: rows.filter((row) => row.labels.length === 0).length,
            missingChannelRows: rows.filter((row) => !row.channel).length,
            dateWarningRows: rows.filter((row) => row.dateWarnings.length > 0).length,
            amountTotal: rows.reduce((sum, row) => sum + row.amountNumber, 0),
            minCreatedAt: createdDates[0],
            maxCreatedAt: createdDates[createdDates.length - 1],
            channelCounts,
            labelCounts,
        },
    };
};

const uniqueRowsForSave = (rows: LeadImportPreviewRow[]) => {
    const map = new Map<number, LeadImportPreviewRow>();
    rows.forEach((row) => map.set(row.conversationId, row));
    return Array.from(map.values());
};

const chunk = <T,>(items: T[], size = 500) => {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
};

const selectExistingRows = async (conversationIds: number[]) => {
    const existingRowsById = new Map<number, ExistingImportRow>();
    for (const ids of chunk(conversationIds, 500)) {
        const { data, error } = await supabase
            .schema("cw")
            .from("conversations_current")
            .select("chatwoot_conversation_id, labels, custom_attributes, conversation_custom_attributes, contact_custom_attributes")
            .in("chatwoot_conversation_id", ids);

        if (error) throw error;
        (data || []).forEach((row) => {
            const existingRow = row as ExistingImportRow;
            existingRowsById.set(Number(existingRow.chatwoot_conversation_id), existingRow);
        });
    }
    return existingRowsById;
};

export const prepareLeadImportCommit = async (preview: LeadImportPreview): Promise<LeadImportCommitPlan> => {
    const rows = uniqueRowsForSave(preview.rows);
    const existingRowsById = await selectExistingRows(rows.map((row) => row.conversationId));
    return {
        rows,
        existingRowsById,
        createCount: rows.filter((row) => !existingRowsById.has(row.conversationId)).length,
        updateCount: rows.filter((row) => existingRowsById.has(row.conversationId)).length,
    };
};

const stableJson = (value: unknown) => {
    try {
        if (!value || typeof value !== "object" || Array.isArray(value)) return JSON.stringify(value);
        return JSON.stringify(Object.fromEntries(
            Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)),
        ));
    } catch {
        return JSON.stringify(value);
    }
};

const labelsMatch = (left: string[] = [], right: string[] = []) => {
    const normalizedLeft = Array.from(new Set(left)).sort();
    const normalizedRight = Array.from(new Set(right)).sort();
    return normalizedLeft.length === normalizedRight.length &&
        normalizedLeft.every((label, index) => label === normalizedRight[index]);
};

const buildAttributes = (row: LeadImportPreviewRow, sourceSystem: string) => ({
    nombre_completo: row.name,
    celular: row.phone,
    correo: row.email,
    canal: row.channel,
    monto_operacion: row.amountRaw,
    monto_operacion_numero: row.amountNumber,
    fecha_monto_operacion: row.paymentDateIso || "",
    score_interes: row.score,
    campana: row.campaign,
    ciudad: row.city,
    estado_importado: row.stage,
    source_system: sourceSystem,
    external_lead_id: row.externalLeadId,
    import_identity: row.identityKey,
});

const buildContactAttributes = (row: LeadImportPreviewRow, sourceSystem: string) => ({
    nombre_completo: row.name,
    celular: row.phone,
    correo: row.email,
    canal: row.channel,
    source_system: sourceSystem,
    external_lead_id: row.externalLeadId,
});

const buildContactRows = (
    rows: LeadImportPreviewRow[],
    sourceSystem: string,
    batchId: string,
) => rows.map((row) => {
    const contactAttributes = buildContactAttributes(row, sourceSystem);
    return {
        chatwoot_contact_id: row.contactId,
        lead_identity_key: row.identityKey,
        identifier: row.externalLeadId,
        name: row.name || "Sin Nombre",
        phone_number: row.phone || null,
        email: row.email || null,
        additional_attributes: {
            imported: true,
            source_system: sourceSystem,
            import_batch_id: batchId,
        },
        custom_attributes: contactAttributes,
        created_at_chatwoot: row.createdAtIso,
        last_activity_at_chatwoot: row.updatedAtIso,
        first_seen_at: row.createdAtIso,
        last_seen_at: row.updatedAtIso,
        raw_payload: {
            source: "manual_import",
            source_system: sourceSystem,
            external_lead_id: row.externalLeadId,
            import_batch_id: batchId,
            raw_row: row.rawRow,
        },
        updated_at: new Date().toISOString(),
    };
});

const buildConversationRows = (
    rows: LeadImportPreviewRow[],
    sourceSystem: string,
    batchId: string,
    userId?: string | null,
) => rows.map((row) => {
    const attrs = buildAttributes(row, sourceSystem);
    const contactAttrs = buildContactAttributes(row, sourceSystem);
    return {
        chatwoot_conversation_id: row.conversationId,
        chatwoot_contact_id: row.contactId,
        chatwoot_account_id: Number(config.chatwoot.accountId) || null,
        status: "open",
        labels: row.labels,
        business_stage_current: row.stage || null,
        additional_attributes: {
            imported: true,
            source_system: sourceSystem,
            import_batch_id: batchId,
        },
        contact_custom_attributes: contactAttrs,
        conversation_custom_attributes: attrs,
        custom_attributes: attrs,
        meta: {
            sender: {
                id: row.contactId,
                name: row.name || "Sin Nombre",
                email: row.email || "",
                phone_number: row.phone || "",
                identifier: row.externalLeadId,
                custom_attributes: contactAttrs,
                additional_attributes: {
                    imported: true,
                    source_system: sourceSystem,
                },
            },
            assignee: {},
        },
        inbox_name: row.channel || null,
        channel_type: row.channel || null,
        created_at_chatwoot: row.createdAtIso,
        updated_at_chatwoot: row.updatedAtIso,
        last_activity_at_chatwoot: row.updatedAtIso,
        first_message_at: row.createdAtIso,
        last_message_at: row.updatedAtIso,
        total_messages: 0,
        raw_payload: {
            source: "manual_import",
            source_system: sourceSystem,
            external_lead_id: row.externalLeadId,
            import_batch_id: batchId,
            source_identity: row.sourceIdentity,
            raw_row: row.rawRow,
        },
        nombre_completo: row.name || null,
        celular: row.phone || null,
        correo: row.email || null,
        campana: row.campaign || null,
        ciudad: row.city || null,
        canal: row.channel || null,
        score_interes: row.score,
        monto_operacion: row.amountRaw || null,
        fecha_monto_operacion: row.paymentDateIso || null,
        source_system: sourceSystem,
        external_lead_id: row.externalLeadId,
        import_batch_id: batchId,
        imported_at: new Date().toISOString(),
        imported_by: userId || null,
        updated_at: new Date().toISOString(),
    };
});

const buildLabelEventRows = (
    rows: LeadImportPreviewRow[],
    existingRowsById: Map<number, ExistingImportRow>,
    batchId: string,
) => rows
    .map((row) => {
        const previous = existingRowsById.get(row.conversationId)?.labels || [];
        if (labelsMatch(previous, row.labels)) return null;
        const previousSet = new Set(previous);
        const nextSet = new Set(row.labels);
        const added = row.labels.filter((label) => !previousSet.has(label));
        const removed = previous.filter((label) => !nextSet.has(label));
        return {
            chatwoot_conversation_id: row.conversationId,
            previous_labels: previous,
            next_labels: row.labels,
            added_labels: added,
            removed_labels: removed,
            event_source: "manual_import",
            occurred_at: row.updatedAtIso,
            detected_at: new Date().toISOString(),
            raw_payload: {
                source: "manual_import",
                import_batch_id: batchId,
                external_lead_id: row.externalLeadId,
            },
            event_key: ["manual_import", batchId, row.conversationId, stableJson(previous), stableJson(row.labels)].join(":"),
        };
    })
    .filter(Boolean);

const mergedExistingAttrs = (row?: ExistingImportRow) => ({
    ...(row?.contact_custom_attributes || {}),
    ...(row?.conversation_custom_attributes || {}),
    ...(row?.custom_attributes || {}),
});

const buildAttributeHistoryRows = (
    rows: LeadImportPreviewRow[],
    existingRowsById: Map<number, ExistingImportRow>,
    sourceSystem: string,
    batchId: string,
) => rows.flatMap((row) => {
    const previousAttrs = mergedExistingAttrs(existingRowsById.get(row.conversationId));
    const nextAttrs = buildAttributes(row, sourceSystem);

    return Object.entries(nextAttrs)
        .filter(([key, value]) => stableJson(previousAttrs[key]) !== stableJson(value))
        .map(([key, value]) => ({
            chatwoot_conversation_id: row.conversationId,
            attribute_key: key,
            old_value: previousAttrs[key] === undefined ? null : previousAttrs[key],
            new_value: value === undefined ? null : value,
            changed_at: row.updatedAtIso,
            change_source: "manual",
            event_key: ["manual_import", batchId, row.conversationId, key].join(":"),
        }));
});

export const saveLeadImport = async (params: {
    parsed: ParsedLeadImportFile;
    mapping: LeadImportMapping;
    preview: LeadImportPreview;
    commit: LeadImportCommitPlan;
    sourceSystem: string;
    user?: { id?: string | null; email?: string | null } | null;
}): Promise<LeadImportSaveResult> => {
    let batchId = "";
    const startedAt = new Date().toISOString();
    try {
        const { data: batch, error: batchError } = await supabase
            .schema("cw")
            .from("import_batches")
            .insert({
                file_name: params.parsed.fileName,
                file_type: params.parsed.fileType,
                source_system: params.sourceSystem,
                row_count: params.preview.stats.totalRows,
                valid_count: params.commit.rows.length,
                skipped_count: params.preview.stats.skippedRows,
                create_count: params.commit.createCount,
                update_count: params.commit.updateCount,
                status: "running",
                mapping: params.mapping,
                stats: params.preview.stats,
                imported_by: params.user?.id || null,
                imported_by_email: params.user?.email || null,
                started_at: startedAt,
            })
            .select("id")
            .single();

        if (batchError) throw batchError;
        batchId = batch.id;

        const contacts = buildContactRows(params.commit.rows, params.sourceSystem, batchId);
        const conversations = buildConversationRows(params.commit.rows, params.sourceSystem, batchId, params.user?.id);
        const labelEvents = buildLabelEventRows(params.commit.rows, params.commit.existingRowsById, batchId);
        const attributeEvents = buildAttributeHistoryRows(params.commit.rows, params.commit.existingRowsById, params.sourceSystem, batchId);
        const errorRows = params.preview.issues.map((issue) => ({
            import_batch_id: batchId,
            row_number: issue.rowNumber,
            severity: issue.severity,
            field_name: issue.field || null,
            reason: issue.reason,
            raw_row: issue.rawRow,
        }));

        for (const rows of chunk(contacts, 500)) {
            const { error } = await supabase.schema("cw").from("contacts_current").upsert(rows, { onConflict: "chatwoot_contact_id" });
            if (error) throw error;
        }

        for (const rows of chunk(conversations, 500)) {
            const { error } = await supabase.schema("cw").from("conversations_current").upsert(rows, { onConflict: "chatwoot_conversation_id" });
            if (error) throw error;
        }

        for (const rows of chunk(labelEvents, 500)) {
            if (rows.length === 0) continue;
            const { error } = await supabase.schema("cw").from("conversation_label_events").upsert(rows, { onConflict: "event_key", ignoreDuplicates: true });
            if (error) throw error;
        }

        for (const rows of chunk(attributeEvents, 500)) {
            if (rows.length === 0) continue;
            const { error } = await supabase.schema("cw").from("conversation_attribute_history").upsert(rows, { onConflict: "event_key", ignoreDuplicates: true });
            if (error) throw error;
        }

        for (const rows of chunk(errorRows, 500)) {
            if (rows.length === 0) continue;
            const { error } = await supabase.schema("cw").from("import_batch_errors").insert(rows);
            if (error) throw error;
        }

        const finalStatus = params.preview.issues.some((issue) => issue.severity === "error") ? "partial" : "success";
        const { error: updateError } = await supabase
            .schema("cw")
            .from("import_batches")
            .update({
                status: finalStatus,
                finished_at: new Date().toISOString(),
                stats: {
                    ...params.preview.stats,
                    labelEvents: labelEvents.length,
                    attributeEvents: attributeEvents.length,
                },
            })
            .eq("id", batchId);

        if (updateError) throw updateError;

        return {
            batchId,
            created: params.commit.createCount,
            updated: params.commit.updateCount,
            skipped: params.preview.stats.skippedRows,
            warnings: params.preview.issues.filter((issue) => issue.severity === "warning").length,
        };
    } catch (error) {
        if (batchId) {
            await supabase
                .schema("cw")
                .from("import_batches")
                .update({
                    status: "error",
                    error_message: error instanceof Error ? error.message : String(error),
                    finished_at: new Date().toISOString(),
                })
                .eq("id", batchId);
        }
        throw error;
    }
};

export const formatImportDate = (iso?: string) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("es-EC", {
        timeZone: "America/Guayaquil",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
};
