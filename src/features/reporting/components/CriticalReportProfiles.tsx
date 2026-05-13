import { useMemo } from "react";
import {
    BarChart3,
    BriefcaseBusiness,
    CalendarClock,
    CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardContext } from "@/context/useDashboardContext";
import { useAuth } from "@/context/useAuth";
import { canAccessCriticalReportProfile } from "@/domain/auth/permissions";
import { TabExportMenu } from "@/features/dashboard/components/TabExportMenu";
import {
    CRITICAL_REPORT_PROFILES,
    REPORT_TAB_LABELS,
    formatFormatsLabel,
    resolveCriticalProfile,
    type CriticalProfileKey,
} from "../domain/reportCatalog";

const PROFILE_ICONS: Record<CriticalProfileKey, typeof BarChart3> = {
    management: BriefcaseBusiness,
    daily_operations: CalendarClock,
    team_performance: CheckCircle2,
    marketing_quality: BarChart3,
};

const PROFILE_AREAS: Record<CriticalProfileKey, string> = {
    management: "Gerencia",
    daily_operations: "Operación",
    team_performance: "Equipo",
    marketing_quality: "Marketing",
};

const profileKeys = Object.keys(CRITICAL_REPORT_PROFILES) as CriticalProfileKey[];

interface CriticalReportProfilesProps {
    onScheduled: () => void;
}

export function CriticalReportProfiles({ onScheduled }: CriticalReportProfilesProps) {
    const { tagSettings } = useDashboardContext();
    const { role } = useAuth();

    const resolvedProfiles = useMemo(() => profileKeys.map((key) => (
        resolveCriticalProfile(key, tagSettings.criticalReportProfiles)
    )), [tagSettings.criticalReportProfiles]);

    const visibleProfiles = useMemo(
        () => resolvedProfiles.filter((profile) => canAccessCriticalReportProfile(role, profile.key)),
        [resolvedProfiles, role],
    );

    return (
        <Card className="border-primary/15 bg-gradient-to-br from-primary/5 via-background to-background">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl">
                    <BriefcaseBusiness className="h-6 w-6 text-primary" />
                    Reportes críticos
                </CardTitle>
                <CardDescription>
                    Cuatro perfiles listos para gerencia, operación, equipo y marketing. Cada uno puede descargarse ahora o programarse por correo.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
                {visibleProfiles.map((profile) => {
                    const Icon = PROFILE_ICONS[profile.key];
                    return (
                        <Card key={profile.key} className="overflow-hidden border shadow-sm">
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <CardTitle className="text-lg">{profile.label}</CardTitle>
                                                <Badge variant={profile.isActive ? "default" : "outline"} className={profile.isActive ? "bg-green-50 text-green-700 border-green-200" : ""}>
                                                    {profile.isActive ? "Activo" : "Inactivo"}
                                                </Badge>
                                            </div>
                                            <CardDescription className="mt-1">{profile.description}</CardDescription>
                                        </div>
                                    </div>
                                    <Badge variant="secondary">{PROFILE_AREAS[profile.key]}</Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="rounded-xl border bg-muted/30 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pestañas que debe incluir</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {profile.tabIds.map((includedTabId) => (
                                            <Badge key={includedTabId} variant="outline" className="bg-background">
                                                {REPORT_TAB_LABELS[includedTabId]}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Formato principal</p>
                                        <p className="text-sm font-bold">{formatFormatsLabel(profile.fileFormats)}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <TabExportMenu
                                            profileKey={profile.key}
                                            tabIds={profile.tabIds}
                                            title={profile.label}
                                            defaultFormats={profile.fileFormats}
                                            compact
                                            onScheduled={onScheduled}
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </CardContent>
        </Card>
    );
}
