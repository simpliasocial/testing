import { 
    LeadImportColumn, 
    LeadImportMapping, 
    LeadImportTargetField, 
    LEAD_IMPORT_TARGETS 
} from "../domain/importTypes";
import { 
    normalizeCell, 
    parseLeadDate, 
    parseAmountValue, 
    channelAlias 
} from "./importNormalizers";

const fieldIds = LEAD_IMPORT_TARGETS.map((target) => target.id);

const emptyMapping = (): LeadImportMapping =>
    Object.fromEntries(fieldIds.map((field) => [field, []])) as LeadImportMapping;

const headerHas = (column: LeadImportColumn, tokens: string[]) =>
    tokens.some((token) => column.normalizedHeader.includes(token));

const valueSamples = (column: LeadImportColumn) => column.sampleValues.map((sample) => normalizeCell(sample));

const phoneLike = (value: unknown) => {
    const text = normalizeCell(value);
    const digits = text.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 16;
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
