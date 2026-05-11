import {
    DEFAULT_CRITICAL_REPORT_PROFILE_CONFIG,
    DEFAULT_REPORT_COLUMN_FIELDS,
    type CriticalReportProfileConfig,
} from "@/lib/reportCatalog";
import {
    DEFAULT_SCORE_THRESHOLDS,
    normalizeScoreThresholds,
    type ScoreThresholds,
} from "@/domain/lead";

export interface TagConfig {
    sqlTags: string[];
    appointmentTags: string[];
    saleTags: string[];
    unqualifiedTags: string[];
    scoreHighTags?: string[];
    scoreMediumTags?: string[];
    scoreLowTags?: string[];
    humanFollowupQueueTags?: string[];
    humanAppointmentTargetLabel?: string;
    humanSalesQueueTags?: string[];
    humanSaleTargetLabel?: string;
    humanAppointmentFieldKeys?: string[];
    humanSaleFieldKeys?: string[];
    scoreAttributeKey?: string;
    scoreAppointmentLabels?: string[];
    scoreThresholds?: ScoreThresholds;
    excelExportFields?: string[];
    reportColumnFields?: Record<string, string[]>;
    criticalReportProfiles?: Record<string, CriticalReportProfileConfig>;
}

export const DEFAULT_TAG_CONFIG: TagConfig = {
    sqlTags: ["interesado", "crear_confianza", "crear_urgencia"],
    appointmentTags: ["cita_agendada", "cita"],
    saleTags: ["venta_exitosa", "venta"],
    unqualifiedTags: ["desinteresado", "descartado"],
    humanFollowupQueueTags: ["seguimiento_humano"],
    humanAppointmentTargetLabel: "cita_agendada_humano",
    humanSalesQueueTags: ["cita_agendada", "cita_agendada_humano"],
    humanSaleTargetLabel: "venta_exitosa",
    humanSaleFieldKeys: ["monto_operacion", "fecha_monto_operacion"],
    scoreAttributeKey: "",
    scoreAppointmentLabels: ["cita_agendada", "cita", "cita_agendada_humano"],
    scoreThresholds: { ...DEFAULT_SCORE_THRESHOLDS },
    excelExportFields: [
        "ID",
        "Nombre",
        "Telefono",
        "Canal",
        "Estados",
        "Correo",
        "Monto",
        "Fecha Monto",
        "Agencia",
        "Check-in",
        "Check-out",
        "URL Red Social",
        "Enlace de conversación",
        "Fecha Ingreso",
        "Ultima Interaccion",
    ],
    reportColumnFields: DEFAULT_REPORT_COLUMN_FIELDS,
    criticalReportProfiles: DEFAULT_CRITICAL_REPORT_PROFILE_CONFIG,
};

const normalizeTagArray = (value: unknown, fallback: string[]) => {
    if (!Array.isArray(value)) return [...fallback];

    return Array.from(new Set(
        value
            .map((item) => String(item || "").trim())
            .filter(Boolean),
    ));
};

const normalizeReportColumnFields = (value?: Record<string, unknown> | null) => {
    const entries = Object.entries(DEFAULT_REPORT_COLUMN_FIELDS).map(([tabId, fallback]) => {
        const configured = value?.[tabId];
        return [tabId, normalizeTagArray(configured, fallback)];
    });

    return Object.fromEntries(entries);
};

const normalizeCriticalReportProfiles = (value?: Record<string, Partial<CriticalReportProfileConfig>> | null) => {
    const entries = Object.entries(DEFAULT_CRITICAL_REPORT_PROFILE_CONFIG).map(([key, fallback]) => {
        const configured = value?.[key];
        return [
            key,
            {
                tabIds: normalizeTagArray(configured?.tabIds, fallback.tabIds || []),
                fileFormats: normalizeTagArray(configured?.fileFormats, fallback.fileFormats || []),
                isActive: typeof configured?.isActive === "boolean" ? configured.isActive : fallback.isActive,
            },
        ];
    });

    return Object.fromEntries(entries);
};

export const normalizeTagConfig = (value?: Partial<TagConfig> | null): TagConfig => ({
    sqlTags: normalizeTagArray(value?.sqlTags, DEFAULT_TAG_CONFIG.sqlTags),
    appointmentTags: normalizeTagArray(value?.appointmentTags, DEFAULT_TAG_CONFIG.appointmentTags),
    saleTags: normalizeTagArray(value?.saleTags, DEFAULT_TAG_CONFIG.saleTags),
    unqualifiedTags: normalizeTagArray(value?.unqualifiedTags, DEFAULT_TAG_CONFIG.unqualifiedTags),
    scoreHighTags: normalizeTagArray(value?.scoreHighTags, DEFAULT_TAG_CONFIG.scoreHighTags || []),
    scoreMediumTags: normalizeTagArray(value?.scoreMediumTags, DEFAULT_TAG_CONFIG.scoreMediumTags || []),
    scoreLowTags: normalizeTagArray(value?.scoreLowTags, DEFAULT_TAG_CONFIG.scoreLowTags || []),
    humanFollowupQueueTags: normalizeTagArray(value?.humanFollowupQueueTags, DEFAULT_TAG_CONFIG.humanFollowupQueueTags || []),
    humanAppointmentTargetLabel: String(value?.humanAppointmentTargetLabel || DEFAULT_TAG_CONFIG.humanAppointmentTargetLabel || "").trim() || DEFAULT_TAG_CONFIG.humanAppointmentTargetLabel,
    humanSalesQueueTags: normalizeTagArray(value?.humanSalesQueueTags, DEFAULT_TAG_CONFIG.humanSalesQueueTags || []),
    humanSaleTargetLabel: String(value?.humanSaleTargetLabel || DEFAULT_TAG_CONFIG.humanSaleTargetLabel || "").trim() || DEFAULT_TAG_CONFIG.humanSaleTargetLabel,
    humanAppointmentFieldKeys: normalizeTagArray(value?.humanAppointmentFieldKeys, DEFAULT_TAG_CONFIG.humanAppointmentFieldKeys || []),
    humanSaleFieldKeys: normalizeTagArray(value?.humanSaleFieldKeys, DEFAULT_TAG_CONFIG.humanSaleFieldKeys || []),
    scoreAttributeKey: String(value?.scoreAttributeKey || DEFAULT_TAG_CONFIG.scoreAttributeKey || "").trim(),
    scoreAppointmentLabels: normalizeTagArray(value?.scoreAppointmentLabels, DEFAULT_TAG_CONFIG.scoreAppointmentLabels || []),
    scoreThresholds: normalizeScoreThresholds(value?.scoreThresholds),
    excelExportFields: normalizeTagArray(value?.excelExportFields, DEFAULT_TAG_CONFIG.excelExportFields || []),
    reportColumnFields: normalizeReportColumnFields(value?.reportColumnFields),
    criticalReportProfiles: normalizeCriticalReportProfiles(value?.criticalReportProfiles),
});
