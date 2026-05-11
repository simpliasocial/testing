import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useDashboardContext } from "@/context/useDashboardContext";
import {
    REPORT_TABS,
    REPORT_FORMATS,
    resolveCriticalProfile,
    type CriticalProfileKey,
    type ReportTabId,
    type ReportFileFormat,
} from "../domain/reportCatalog";

interface EditProfileDialogProps {
    profileKey: CriticalProfileKey | null;
    onClose: () => void;
    onSave: (key: CriticalProfileKey, config: { tabIds: ReportTabId[]; fileFormats: ReportFileFormat[]; isActive: boolean }) => Promise<void>;
}

export function EditProfileDialog({
    profileKey,
    onClose,
    onSave,
}: EditProfileDialogProps) {
    const { tagSettings } = useDashboardContext();
    const [profileTabs, setProfileTabs] = useState<ReportTabId[]>([]);
    const [profileFormats, setProfileFormats] = useState<ReportFileFormat[]>([]);
    const [profileActive, setProfileActive] = useState(true);

    useEffect(() => {
        if (profileKey) {
            const profile = resolveCriticalProfile(profileKey, tagSettings.criticalReportProfiles);
            setProfileTabs(profile.tabIds);
            setProfileFormats(profile.fileFormats);
            setProfileActive(profile.isActive);
        }
    }, [profileKey, tagSettings.criticalReportProfiles]);

    const toggleTab = (tabId: ReportTabId, checked: boolean | string) => {
        setProfileTabs((current) => {
            const isChecked = checked === true;
            const next = isChecked
                ? Array.from(new Set([...current, tabId]))
                : current.filter((item) => item !== tabId);
            return next.length > 0 ? next : current;
        });
    };

    const toggleFormat = (formatId: ReportFileFormat, checked: boolean | string) => {
        setProfileFormats((current) => {
            const isChecked = checked === true;
            const next = isChecked
                ? Array.from(new Set([...current, formatId]))
                : current.filter((item) => item !== formatId);
            return next.length > 0 ? next : current;
        });
    };

    const handleSave = async () => {
        if (!profileKey) return;
        await onSave(profileKey, {
            tabIds: profileTabs,
            fileFormats: profileFormats,
            isActive: profileActive,
        });
        onClose();
    };

    const editingProfile = profileKey ? resolveCriticalProfile(profileKey, tagSettings.criticalReportProfiles) : null;

    return (
        <Dialog open={Boolean(profileKey)} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[680px]">
                <DialogHeader>
                    <DialogTitle>Configurar perfil crítico</DialogTitle>
                    <DialogDescription>
                        {editingProfile?.label}. Solo administradores pueden cambiar la base de pestañas y formatos recomendados.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-2 md:grid-cols-2">
                    <div className="space-y-3">
                        <Label>Pestañas incluidas</Label>
                        <div className="space-y-2 rounded-xl border p-3">
                            {REPORT_TABS.map((tab) => (
                                <label key={tab.id} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-muted/50">
                                    <Checkbox
                                        checked={profileTabs.includes(tab.id)}
                                        onCheckedChange={(checked) => toggleTab(tab.id, checked)}
                                    />
                                    <span>{tab.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Label>Formatos sugeridos</Label>
                        <div className="space-y-2 rounded-xl border p-3">
                            {REPORT_FORMATS.map((formatOption) => (
                                <label key={formatOption.id} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-muted/50">
                                    <Checkbox
                                        checked={profileFormats.includes(formatOption.id)}
                                        onCheckedChange={(checked) => toggleFormat(formatOption.id, checked)}
                                    />
                                    <span>{formatOption.label}</span>
                                </label>
                            ))}
                        </div>

                        <label className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                            <Checkbox checked={profileActive} onCheckedChange={(checked) => setProfileActive(checked === true)} />
                            Perfil activo para usuarios
                        </label>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleSave}>Guardar configuración</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
