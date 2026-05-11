import { 
    LeadImportCommitPlan, 
    LeadImportPreview 
} from "@/features/import/domain/importTypes";
import { selectExistingRows } from "@/features/import/infrastructure/importPersistence";

export * from "@/features/import/domain/importTypes";
export * from "@/features/import/model/importNormalizers";
export * from "@/features/import/model/importParser";
export * from "@/features/import/model/importMapper";
export * from "@/features/import/model/importRowBuilders";
export * from "@/features/import/infrastructure/importPersistence";

/**
 * High-level orchestration for preparing the final commit plan.
 */
export const prepareLeadImportCommit = async (preview: LeadImportPreview): Promise<LeadImportCommitPlan> => {
    // Ensure we only process unique conversations
    const map = new Map<number, typeof preview.rows[0]>();
    preview.rows.forEach((row) => map.set(row.conversationId, row));
    const uniqueRows = Array.from(map.values());

    const existingRowsById = await selectExistingRows(uniqueRows.map((row) => row.conversationId));

    return {
        rows: uniqueRows,
        existingRowsById,
        createCount: uniqueRows.filter((row) => !existingRowsById.has(row.conversationId)).length,
        updateCount: uniqueRows.filter((row) => existingRowsById.has(row.conversationId)).length,
    };
};

/**
 * Utility for formatting dates in the import UI.
 */
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
