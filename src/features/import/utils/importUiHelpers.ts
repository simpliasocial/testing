import {
    formatImportDate,
    LEAD_IMPORT_TARGETS,
    normalizeChannelValue,
    normalizePhoneValue,
    parseAmountValue,
    parseLeadDate,
    splitLabels,
    type LeadImportTargetField,
} from "@/lib/leadImport";

export const stepLabels = ["Archivo", "Requisitos", "Columnas", "Vista previa", "Confirmación"];

export const visibleTargets = LEAD_IMPORT_TARGETS.filter((target) => !["stage", "score"].includes(target.id));
export const requiredTargets = visibleTargets.filter((target) => target.required);
export const optionalTargets = visibleTargets.filter((target) => !target.required);

const currencyFormatter = new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("es-EC");

export const formatNumber = (value: number) => numberFormatter.format(value || 0);
export const formatMoney = (value: number) => currencyFormatter.format(value || 0);

export const rawText = (value: unknown) => String(value ?? "").trim();

export const normalizedExampleFor = (field: LeadImportTargetField, sample: unknown) => {
    const raw = rawText(sample);
    if (!raw) return "";

    switch (field) {
        case "phone":
            return normalizePhoneValue(raw);
        case "channel":
            return normalizeChannelValue(raw);
        case "labels":
            return splitLabels([raw]).join(", ");
        case "amount": {
            const parsed = parseAmountValue(raw);
            return parsed.number ? formatMoney(parsed.number) : "";
        }
        case "createdAt":
        case "updatedAt":
        case "paymentDate":
            return formatImportDate(parseLeadDate(raw));
        default:
            return raw;
    }
};

export const normalizationHelpFor = (field: LeadImportTargetField) => {
    switch (field) {
        case "phone":
            return "Ejemplo: +593980267533, 0980267533 o 980267533 se guardan como +593980267533.";
        case "createdAt":
            return "Acepta fechas con o sin hora. Si no viene hora, el sistema usa 00:00:00 para mantener el estándar.";
        case "updatedAt":
            return "Representa la última modificación o actividad del lead. Si no viene hora, el sistema usa 00:00:00.";
        case "paymentDate":
            return "Se usa para ventas exitosas y se guarda como fecha de pago o venta. Si no viene hora, el sistema usa 00:00:00.";
        case "labels":
            return "Convierte etiquetas o etapas al vocabulario operativo en snake_case, por ejemplo venta exitosa pasa a venta_exitosa.";
        case "amount":
            return "Limpia símbolos como $, comas y puntos para guardar el monto de venta en el formato estándar.";
        case "channel":
            return "Normaliza canales conocidos como WhatsApp, Facebook, Instagram, TikTok o Sitio web.";
        default:
            return "Confirma que esta columna corresponde al dato solicitado para que se guarde con el estándar del sistema.";
    }
};

export const formatIssueForUser = (reason: string) => {
    const cleanReason = reason.replace(/\.$/, "").toLowerCase();
    if (cleanReason.startsWith("falta ")) {
        return `No tiene ${cleanReason.replace("falta ", "")}. Si continúas así, esta fila no se subirá.`;
    }
    return `${reason.replace(/\.$/, "")}. Si continúas así, esta fila puede no subirse.`;
};

export const fieldLabelFor = (field?: string) =>
    visibleTargets.find((target) => target.id === field)?.label || "Fila";
