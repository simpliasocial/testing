export type ReportFileFormat = "excel" | "pdf" | "csv";

export type ReportTabId =
    | "overview"
    | "funnel"
    | "operational"
    | "followup"
    | "performance"
    | "trends"
    | "scoring"
    | "chats";

export type CriticalProfileKey =
    | "management"
    | "daily_operations"
    | "team_performance"
    | "marketing_quality";

export interface ReportTabDefinition {
    id: ReportTabId;
    label: string;
    description: string;
}

export interface CriticalReportProfileDefinition {
    key: CriticalProfileKey;
    label: string;
    description: string;
    tabIds: ReportTabId[];
    fileFormats: ReportFileFormat[];
    formatLabel: string;
    isActive: boolean;
}

export interface CriticalReportProfileConfig {
    tabIds?: ReportTabId[];
    fileFormats?: ReportFileFormat[];
    isActive?: boolean;
}

export const REPORT_TABS: ReportTabDefinition[] = [
    { id: "overview", label: "Estrategia", description: "KPIs ejecutivos, ventas, citas y resumen comercial." },
    { id: "funnel", label: "Embudo", description: "Etapas actuales e históricas del embudo comercial." },
    { id: "operational", label: "Operación", description: "Eficiencia operativa, respuesta y carga por canal." },
    { id: "followup", label: "Seguimiento", description: "Colas humanas, citas agendadas y ventas exitosas." },
    { id: "performance", label: "Rendimiento Humano", description: "Rendimiento por responsable y conversión humana." },
    { id: "trends", label: "Tendencias", description: "Tendencias por canal, campaña y calidad de leads." },
    { id: "scoring", label: "Calidad", description: "Calidad, puntaje y priorización de leads." },
    { id: "chats", label: "Conversaciones", description: "Detalle de conversaciones y mensajes recientes." },
];

export const REPORT_TAB_LABELS = REPORT_TABS.reduce<Record<ReportTabId, string>>((acc, tab) => {
    acc[tab.id] = tab.label;
    return acc;
}, {} as Record<ReportTabId, string>);

export const REPORT_FORMATS: Array<{ id: ReportFileFormat; label: string; extension: string }> = [
    { id: "excel", label: "Excel", extension: "xlsx" },
    { id: "pdf", label: "PDF", extension: "pdf" },
    { id: "csv", label: "CSV", extension: "csv" },
];

export const CRITICAL_REPORT_PROFILES: Record<CriticalProfileKey, CriticalReportProfileDefinition> = {
    management: {
        key: "management",
        label: "Reporte Gerencial",
        description: "Vista ejecutiva para gerencia con KPIs, embudo y tendencia comercial.",
        tabIds: ["overview", "funnel", "performance", "trends"],
        fileFormats: ["pdf"],
        formatLabel: "PDF",
        isActive: true,
    },
    daily_operations: {
        key: "daily_operations",
        label: "Reporte de Operación Diaria Comercial",
        description: "Control diario de equipos, seguimiento, calidad y conversaciones.",
        tabIds: ["operational", "followup", "scoring", "chats"],
        fileFormats: ["excel", "csv"],
        formatLabel: "Excel / CSV",
        isActive: true,
    },
    team_performance: {
        key: "team_performance",
        label: "Reporte de Rendimiento del Equipo",
        description: "Rendimiento humano conectado con operación, seguimiento y embudo.",
        tabIds: ["operational", "performance", "followup", "funnel"],
        fileFormats: ["pdf", "excel"],
        formatLabel: "PDF + Excel",
        isActive: true,
    },
    marketing_quality: {
        key: "marketing_quality",
        label: "Reporte de Marketing y Calidad de Leads",
        description: "Calidad de leads, tendencias, puntajes y estrategia por origen.",
        tabIds: ["trends", "funnel", "scoring", "overview"],
        fileFormats: ["excel"],
        formatLabel: "Excel",
        isActive: true,
    },
};

export const DEFAULT_CRITICAL_REPORT_PROFILE_CONFIG = Object.fromEntries(
    Object.entries(CRITICAL_REPORT_PROFILES).map(([key, profile]) => [
        key,
        {
            tabIds: profile.tabIds,
            fileFormats: profile.fileFormats,
            isActive: profile.isActive,
        },
    ]),
) as Record<CriticalProfileKey, CriticalReportProfileConfig>;

export const REPORT_COLUMN_OPTIONS = [
    "ID",
    "Nombre",
    "Telefono",
    "Canal",
    "Estados",
    "Etapa",
    "Estado",
    "Correo",
    "Monto",
    "Fecha Monto",
    "Agencia",
    "Check-in",
    "Check-out",
    "Campana",
    "Ciudad",
    "Responsable",
    "Puntaje",
    "Ultimo Mensaje",
    "URL Red Social",
    "Enlace de conversación",
    "Fecha Ingreso",
    "Ultima Interaccion",
    "ID Contacto",
    "ID Inbox",
    "ID Cuenta",
    "Origen Dato",
];

const BASE_DETAIL_FIELDS = [
    "ID",
    "Nombre",
    "Telefono",
    "Canal",
    "Estados",
    "Etapa",
    "Correo",
    "Monto",
    "Fecha Monto",
    "Agencia",
    "Campana",
    "Responsable",
    "URL Red Social",
    "Enlace de conversación",
    "Fecha Ingreso",
    "Ultima Interaccion",
];

export const DEFAULT_REPORT_COLUMN_FIELDS: Record<ReportTabId, string[]> = {
    overview: BASE_DETAIL_FIELDS,
    funnel: ["ID", "Nombre", "Canal", "Estados", "Etapa", "Monto", "Fecha Monto", "Fecha Ingreso", "Ultima Interaccion"],
    operational: ["ID", "Nombre", "Canal", "Responsable", "Estado", "Ultimo Mensaje", "Fecha Ingreso", "Ultima Interaccion", "Origen Dato"],
    followup: ["ID", "Nombre", "Telefono", "Canal", "Estados", "Etapa", "Agencia", "Fecha Monto", "Monto", "Ultimo Mensaje", "Enlace de conversación"],
    performance: ["ID", "Nombre", "Canal", "Responsable", "Estados", "Etapa", "Monto", "Fecha Monto", "Ultima Interaccion"],
    trends: ["ID", "Nombre", "Canal", "Campana", "Ciudad", "Estados", "Etapa", "Monto", "Fecha Ingreso"],
    scoring: ["ID", "Nombre", "Canal", "Puntaje", "Estados", "Etapa", "Responsable", "Ultima Interaccion"],
    chats: ["ID", "Nombre", "Telefono", "Canal", "Ultimo Mensaje", "Estados", "Enlace de conversación", "Ultima Interaccion"],
};

export const WEEKDAY_OPTIONS = [
    { label: "Lunes", shortLabel: "LU", value: "1" },
    { label: "Martes", shortLabel: "MA", value: "2" },
    { label: "Miércoles", shortLabel: "MI", value: "3" },
    { label: "Jueves", shortLabel: "JU", value: "4" },
    { label: "Viernes", shortLabel: "VI", value: "5" },
    { label: "Sábado", shortLabel: "SA", value: "6" },
    { label: "Domingo", shortLabel: "DO", value: "0" },
];

export const resolveCriticalProfile = (
    key: CriticalProfileKey,
    overrides?: Record<string, CriticalReportProfileConfig>,
): CriticalReportProfileDefinition => {
    const base = CRITICAL_REPORT_PROFILES[key];
    const override = overrides?.[key];

    return {
        ...base,
        tabIds: override?.tabIds?.length ? override.tabIds : base.tabIds,
        fileFormats: override?.fileFormats?.length ? override.fileFormats : base.fileFormats,
        isActive: typeof override?.isActive === "boolean" ? override.isActive : base.isActive,
    };
};

export const formatFormatsLabel = (formats: ReportFileFormat[]) => {
    const labels = REPORT_FORMATS
        .filter((format) => formats.includes(format.id))
        .map((format) => format.label);

    if (labels.length === 0) return "Sin formato";
    return labels.join(" + ");
};
