import { supabase } from "@/lib/supabase";
import { config } from "@/config";
import { 
    ExistingImportRow, 
    LeadImportCommitPlan, 
    LeadImportMapping, 
    LeadImportPreview, 
    LeadImportPreviewRow, 
    LeadImportSaveResult,
    ParsedLeadImportFile
} from "../domain/importTypes";

const chunk = <T,>(items: T[], size = 500) => {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
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

export const selectExistingRows = async (conversationIds: number[]) => {
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
