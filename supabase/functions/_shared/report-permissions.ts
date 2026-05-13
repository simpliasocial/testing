export type ReportUserRole = "platform_admin" | "company_admin" | "operator" | string | null;

export const canAccessCriticalReportProfile = (role: ReportUserRole, profileKey: string): boolean => {
    if (role === "platform_admin" || role === "company_admin") return true;
    return role === "operator" && profileKey === "daily_operations";
};
