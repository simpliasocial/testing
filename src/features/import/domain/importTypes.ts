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
