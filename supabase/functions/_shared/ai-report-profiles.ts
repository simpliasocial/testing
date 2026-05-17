export type ReportFormat = "excel" | "pdf" | "csv";
export type CriticalProfileKey = "management" | "daily_operations" | "team_performance" | "marketing_quality";

export type AiReportProfile = {
    key: CriticalProfileKey;
    label: string;
    tabIds: string[];
    formats: ReportFormat[];
    promptFileName: string;
};

export const AI_REPORT_PROFILES: Record<CriticalProfileKey, AiReportProfile> = {
    management: {
        key: "management",
        label: "Reporte Gerencial",
        tabIds: ["overview", "funnel", "performance", "trends"],
        formats: ["pdf"],
        promptFileName: "archive/promt gerencial.txt",
    },
    daily_operations: {
        key: "daily_operations",
        label: "Reporte operación comercial",
        tabIds: ["operational", "followup", "scoring", "chats"],
        formats: ["excel", "csv"],
        promptFileName: "archive/promt operacion comercial.txt",
    },
    team_performance: {
        key: "team_performance",
        label: "Reporte rendimiento equipo",
        tabIds: ["operational", "performance", "followup", "funnel"],
        formats: ["pdf"],
        promptFileName: "archive/promt rendimiento Equipo.txt",
    },
    marketing_quality: {
        key: "marketing_quality",
        label: "Reporte calidad leads",
        tabIds: ["trends", "funnel", "scoring", "overview"],
        formats: ["excel", "csv"],
        promptFileName: "archive/promt calidad leads.txt",
    },
};
