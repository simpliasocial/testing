import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDashboardContext } from "@/context/useDashboardContext";
import { DEFAULT_SCORE_THRESHOLDS, normalizeScoreThresholds } from "@/lib/leadScoreClassification";
import { buildScoreAttributeOptions, unique } from "@/features/scoring/model/leadScoringModel";

export const useScoringConfig = () => {
    const { tagSettings, updateTagSettings, labels: configuredLabels, contactAttributeDefinitions } = useDashboardContext();

    const [configOpen, setConfigOpen] = useState(() => !tagSettings.scoreAttributeKey);
    const [settingsDirty, setSettingsDirty] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [scoreAttributeKeyDraft, setScoreAttributeKeyDraft] = useState("");
    const [appointmentLabelsDraft, setAppointmentLabelsDraft] = useState<string[]>([]);
    const [thresholdHotDraft, setThresholdHotDraft] = useState(String(DEFAULT_SCORE_THRESHOLDS.hotMin));
    const [thresholdWarmDraft, setThresholdWarmDraft] = useState(String(DEFAULT_SCORE_THRESHOLDS.warmMin));

    const actualLabels = useMemo(() => unique((configuredLabels || []).filter(label => typeof label === "string")), [configuredLabels]);
    const effectiveScoreThresholds = useMemo(() => normalizeScoreThresholds(tagSettings.scoreThresholds), [tagSettings.scoreThresholds]);
    const scoreAttributeOptions = useMemo(() => buildScoreAttributeOptions(contactAttributeDefinitions), [contactAttributeDefinitions]);
    const defaultScoreAttributeKey = useMemo(() => scoreAttributeOptions.find(o => o.key === "score_interes")?.key || scoreAttributeOptions[0]?.key || "", [scoreAttributeOptions]);

    const effectiveScoreAttributeKey = useMemo(() => {
        if (tagSettings.scoreAttributeKey && scoreAttributeOptions.some(o => o.key === tagSettings.scoreAttributeKey)) return tagSettings.scoreAttributeKey;
        return defaultScoreAttributeKey;
    }, [tagSettings.scoreAttributeKey, scoreAttributeOptions, defaultScoreAttributeKey]);

    const defaultAppointmentLabels = useMemo(() => unique([...(tagSettings.appointmentTags || []), tagSettings.humanAppointmentTargetLabel || ""].filter(Boolean)), [tagSettings.appointmentTags, tagSettings.humanAppointmentTargetLabel]);

    const effectiveAppointmentLabels = useMemo(() => {
        const c = unique((tagSettings.scoreAppointmentLabels || []).filter(l => actualLabels.includes(l)));
        return c.length > 0 ? c : defaultAppointmentLabels;
    }, [tagSettings.scoreAppointmentLabels, actualLabels, defaultAppointmentLabels]);

    useEffect(() => {
        if (!settingsDirty) {
            setScoreAttributeKeyDraft(effectiveScoreAttributeKey);
            setAppointmentLabelsDraft(effectiveAppointmentLabels);
            setThresholdHotDraft(String(effectiveScoreThresholds.hotMin));
            setThresholdWarmDraft(String(effectiveScoreThresholds.warmMin));
        }
    }, [effectiveScoreAttributeKey, effectiveAppointmentLabels, effectiveScoreThresholds, settingsDirty]);

    const activeScoreAttributeKey = (settingsDirty ? scoreAttributeKeyDraft : effectiveScoreAttributeKey) || "";
    const activeAppointmentLabels = useMemo(() => unique((settingsDirty ? appointmentLabelsDraft : effectiveAppointmentLabels).filter(l => actualLabels.includes(l))), [appointmentLabelsDraft, effectiveAppointmentLabels, settingsDirty, actualLabels]);
    const activeScoreThresholds = useMemo(() => normalizeScoreThresholds({ hotMin: Number(settingsDirty ? thresholdHotDraft : effectiveScoreThresholds.hotMin), warmMin: Number(settingsDirty ? thresholdWarmDraft : effectiveScoreThresholds.warmMin) }), [settingsDirty, thresholdHotDraft, thresholdWarmDraft, effectiveScoreThresholds]);

    const thresholdValidationError = useMemo(() => {
        const h = Number(thresholdHotDraft), w = Number(thresholdWarmDraft);
        if (!Number.isFinite(h) || !Number.isFinite(w)) return "Ingresa valores numéricos válidos para Caliente y Tibio.";
        if (h <= w) return "Los rangos deben quedar en orden: Caliente mayor que Tibio.";
        return null;
    }, [thresholdHotDraft, thresholdWarmDraft]);

    const selectedScoreAttribute = useMemo(() => scoreAttributeOptions.find(o => o.key === activeScoreAttributeKey) || null, [scoreAttributeOptions, activeScoreAttributeKey]);

    const toggleAppointmentLabel = (label: string) => {
        setSettingsDirty(true);
        setAppointmentLabelsDraft(cur => cur.includes(label) ? cur.filter(i => i !== label) : unique([...cur, label]));
    };

    const saveScoringConfig = async () => {
        if (!scoreAttributeKeyDraft) { toast.error("Selecciona un campo numérico para calcular el puntaje."); return; }
        if (thresholdValidationError) { toast.error(thresholdValidationError); return; }
        setSavingSettings(true);
        try {
            await updateTagSettings({ ...tagSettings, scoreAttributeKey: scoreAttributeKeyDraft, scoreAppointmentLabels: unique(appointmentLabelsDraft.filter(l => actualLabels.includes(l))), scoreThresholds: { hotMin: Number(thresholdHotDraft), warmMin: Number(thresholdWarmDraft) } });
            setSettingsDirty(false); setConfigOpen(false);
            toast.success("La configuración de puntajes quedó guardada.");
        } catch (e) { console.error("Error saving scoring config:", e); toast.error("No se pudo guardar la configuración de puntajes."); }
        finally { setSavingSettings(false); }
    };

    const restoreDefaultConfig = () => {
        setSettingsDirty(true);
        setScoreAttributeKeyDraft(defaultScoreAttributeKey);
        setAppointmentLabelsDraft(defaultAppointmentLabels);
        setThresholdHotDraft(String(DEFAULT_SCORE_THRESHOLDS.hotMin));
        setThresholdWarmDraft(String(DEFAULT_SCORE_THRESHOLDS.warmMin));
    };

    return {
        configOpen, setConfigOpen, settingsDirty, savingSettings,
        scoreAttributeKeyDraft, setScoreAttributeKeyDraft: (v: string) => { setSettingsDirty(true); setScoreAttributeKeyDraft(v); },
        thresholdHotDraft, setThresholdHotDraft: (v: string) => { setSettingsDirty(true); setThresholdHotDraft(v); },
        thresholdWarmDraft, setThresholdWarmDraft: (v: string) => { setSettingsDirty(true); setThresholdWarmDraft(v); },
        appointmentLabelsDraft, thresholdValidationError,
        noScoringAttributeAvailable: scoreAttributeOptions.length === 0,
        actualLabels, scoreAttributeOptions, selectedScoreAttribute,
        activeScoreAttributeKey, activeAppointmentLabels, activeScoreThresholds,
        toggleAppointmentLabel, saveScoringConfig, restoreDefaultConfig,
    };
};
