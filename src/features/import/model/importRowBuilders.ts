import { 
    LeadImportColumn, 
    LeadImportIssue, 
    LeadImportMapping, 
    LeadImportPreview, 
    LeadImportPreviewRow, 
    LeadImportTargetField, 
    ParsedLeadImportFile 
} from "../domain/importTypes";
import { 
    normalizeCell, 
    normalizePhoneValue, 
    normalizeLeadLabel, 
    splitLabels, 
    normalizeChannelValue, 
    parseAmountValue, 
    parseLeadDate, 
    parseScore,
    normalizeText,
    channelAlias
} from "./importNormalizers";

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

const toRawRowObject = (row: unknown[], columns: LeadImportColumn[]) =>
    Object.fromEntries(columns.map((column) => [column.displayName, row[column.index] ?? ""]));

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
