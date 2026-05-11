import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/useAuth";
import {
    buildLeadImportPreview,
    createDefaultLeadImportMapping,
    prepareLeadImportCommit,
    readLeadImportFile,
    saveLeadImport,
    LEAD_IMPORT_TARGETS,
    type LeadImportMapping,
    type LeadImportPreview,
    type LeadImportCommitPlan,
    type LeadImportSaveResult,
    type ParsedLeadImportFile,
    type LeadImportTargetField,
} from "@/lib/leadImport";

const visibleTargets = LEAD_IMPORT_TARGETS.filter((target) => !["stage", "score"].includes(target.id));
const requiredTargets = visibleTargets.filter((target) => target.required);

export function useLeadImportWizard(onImported?: () => void | Promise<void>) {
    const { user } = useAuth();
    const [wizardStep, setWizardStep] = useState(0);
    const [activeFieldIndex, setActiveFieldIndex] = useState(0);
    const [parsed, setParsed] = useState<ParsedLeadImportFile | null>(null);
    const [mapping, setMapping] = useState<LeadImportMapping | null>(null);
    const [preview, setPreview] = useState<LeadImportPreview | null>(null);
    const [commit, setCommit] = useState<LeadImportCommitPlan | null>(null);
    const [sourceSystem, setSourceSystem] = useState("excel");
    const [loadingFile, setLoadingFile] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<LeadImportSaveResult | null>(null);
    const [reviewedFieldIds, setReviewedFieldIds] = useState<Set<LeadImportTargetField>>(new Set());

    const activeField = visibleTargets[Math.min(activeFieldIndex, visibleTargets.length - 1)];
    const allFieldsReviewed = visibleTargets.every((target) => reviewedFieldIds.has(target.id));
    const reviewedFieldsCount = visibleTargets.filter((target) => reviewedFieldIds.has(target.id)).length;
    const missingRequiredMapping = requiredTargets.filter((target) => !(mapping?.[target.id] || []).length);

    useEffect(() => {
        if (wizardStep !== 2 || !activeField) return;
        setReviewedFieldIds((current) => {
            if (current.has(activeField.id)) return current;
            const next = new Set(current);
            next.add(activeField.id);
            return next;
        });
    }, [activeField, wizardStep]);

    const resetImportState = () => {
        setWizardStep(0);
        setActiveFieldIndex(0);
        setParsed(null);
        setMapping(null);
        setPreview(null);
        setCommit(null);
        setSourceSystem("excel");
        setReviewedFieldIds(new Set());
        setResult(null);
    };

    const rebuildPreview = (
        nextParsed: ParsedLeadImportFile,
        nextMapping: LeadImportMapping,
        nextSourceSystem: string,
    ) => {
        setPreview(buildLeadImportPreview(nextParsed, nextMapping, nextSourceSystem.trim() || "excel"));
        setCommit(null);
        setResult(null);
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setLoadingFile(true);
            const parsedFile = await readLeadImportFile(file);
            const defaultMapping = createDefaultLeadImportMapping(parsedFile.columns);
            setParsed(parsedFile);
            setMapping(defaultMapping);
            setSourceSystem(parsedFile.sourceSystem);
            setPreview(buildLeadImportPreview(parsedFile, defaultMapping, parsedFile.sourceSystem));
            setActiveFieldIndex(0);
            setReviewedFieldIds(new Set());
            setWizardStep(1);
            toast.success("Archivo leído correctamente");
        } catch (error) {
            console.error("Lead import file parse failed:", error);
            toast.error(error instanceof Error ? error.message : "No se pudo leer el archivo");
        } finally {
            setLoadingFile(false);
            event.target.value = "";
        }
    };

    const updateMapping = (field: LeadImportTargetField, updater: (current: string[]) => string[]) => {
        if (!parsed || !mapping) return;
        const nextFieldMapping = updater(mapping[field] || []).filter(Boolean).slice(0, 1);
        const nextMapping = {
            ...mapping,
            [field]: nextFieldMapping,
        };
        setMapping(nextMapping);
        rebuildPreview(parsed, nextMapping, sourceSystem);
    };

    const handleSourceChange = (value: string) => {
        const nextSource = value.trim() || "excel";
        setSourceSystem(nextSource);
        if (parsed && mapping) rebuildPreview(parsed, mapping, nextSource);
    };

    const handlePrepare = async () => {
        if (!preview) return;
        if (preview.rows.length === 0) {
            toast.error("No hay filas listas para importar");
            return;
        }

        try {
            setPreparing(true);
            const nextCommit = await prepareLeadImportCommit(preview);
            setCommit(nextCommit);
            setWizardStep(4);
            toast.success("Importación preparada");
        } catch (error) {
            console.error("Lead import prepare failed:", error);
            toast.error("No se pudo validar contra los datos actuales");
        } finally {
            setPreparing(false);
        }
    };

    const handleImport = async () => {
        if (!parsed || !mapping || !preview || !commit) return;

        try {
            setImporting(true);
            const saveResult = await saveLeadImport({
                parsed,
                mapping,
                preview,
                commit,
                sourceSystem,
                user: { id: user?.id, email: user?.email },
            });
            setResult(saveResult);
            toast.success("Datos importados correctamente");
            await onImported?.();
        } catch (error) {
            console.error("Lead import save failed:", error);
            toast.error(error instanceof Error ? error.message : "No se pudo guardar la importación");
        } finally {
            setImporting(false);
        }
    };

    return {
        wizardStep,
        setWizardStep,
        activeFieldIndex,
        setActiveFieldIndex,
        activeField,
        parsed,
        mapping,
        preview,
        commit,
        sourceSystem,
        loadingFile,
        preparing,
        importing,
        result,
        reviewedFieldIds,
        allFieldsReviewed,
        reviewedFieldsCount,
        missingRequiredMapping,
        resetImportState,
        handleFileChange,
        updateMapping,
        handleSourceChange,
        handlePrepare,
        handleImport,
    };
}
