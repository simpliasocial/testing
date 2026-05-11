import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useLeadImportWizard } from "../../hooks/useLeadImportWizard";
import { stepLabels } from "../../utils/importUiHelpers";
import { ImportStepFile } from "./ImportStepFile";
import { ImportStepRequirements } from "./ImportStepRequirements";
import { ImportStepMapping } from "./ImportStepMapping";
import { ImportStepPreview } from "./ImportStepPreview";
import { ImportStepConfirmation } from "./ImportStepConfirmation";

interface LeadImportWizardProps {
    onImported?: () => void | Promise<void>;
}

export function LeadImportWizard({ onImported }: LeadImportWizardProps) {
    const [open, setOpen] = useState(false);
    const {
        wizardStep,
        setWizardStep,
        activeFieldIndex,
        setActiveFieldIndex,
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
        missingRequiredMapping,
        resetImportState,
        handleFileChange,
        updateMapping,
        handleSourceChange,
        handlePrepare,
        handleImport,
    } = useLeadImportWizard(onImported);

    const [mappingChecked, setMappingChecked] = useState(false);
    const [previewChecked, setPreviewChecked] = useState(false);
    const [saveChecked, setSaveChecked] = useState(false);

    const currentProgress = ((wizardStep + 1) / stepLabels.length) * 100;

    const handleClose = () => {
        setOpen(false);
        resetImportState();
        setMappingChecked(false);
        setPreviewChecked(false);
        setSaveChecked(false);
    };

    const goNext = () => {
        if (wizardStep === 0 && !parsed) return;
        if (wizardStep === 2 && !allFieldsReviewed) return;
        if (wizardStep === 3) {
            handlePrepare();
            return;
        }
        setWizardStep((step) => Math.min(step + 1, 4));
    };

    const goBack = () => setWizardStep((step) => Math.max(step - 1, 0));

    const isNextDisabled = () => {
        if (wizardStep === 0) return !parsed || loadingFile;
        if (wizardStep === 1) return missingRequiredMapping.length > 0;
        if (wizardStep === 2) return !allFieldsReviewed;
        if (wizardStep === 3) return preparing;
        if (wizardStep === 4) return !mappingChecked || !previewChecked || !saveChecked || importing || !!result;
        return false;
    };

    return (
        <>
            <Button onClick={() => setOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Importar Leads
            </Button>

            <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
                <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <DialogTitle>Asistente de Importación de Leads</DialogTitle>
                                <DialogDescription>
                                    Carga, mapea y valida tus leads antes de guardarlos en el sistema.
                                </DialogDescription>
                            </div>
                            <Button variant="ghost" size="icon" onClick={handleClose}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                                <span>Paso {wizardStep + 1}: {stepLabels[wizardStep]}</span>
                                <span>{Math.round(currentProgress)}%</span>
                            </div>
                            <Progress value={currentProgress} className="h-1.5" />
                        </div>

                        {wizardStep === 0 && (
                            <ImportStepFile
                                parsed={parsed}
                                preview={preview}
                                loadingFile={loadingFile}
                                importing={importing}
                                onFileChange={handleFileChange}
                            />
                        )}
                        {wizardStep === 1 && (
                            <ImportStepRequirements
                                parsed={parsed}
                                preview={preview}
                                mapping={mapping}
                                missingRequiredMapping={missingRequiredMapping}
                            />
                        )}
                        {wizardStep === 2 && (
                            <ImportStepMapping
                                parsed={parsed}
                                mapping={mapping}
                                preview={preview}
                                sourceSystem={sourceSystem}
                                activeFieldIndex={activeFieldIndex}
                                reviewedFieldIds={reviewedFieldIds}
                                onSourceChange={handleSourceChange}
                                onActiveFieldChange={setActiveFieldIndex}
                                onAddColumn={(f, c) => updateMapping(f, () => [c])}
                                onRemoveColumn={(f, c) => updateMapping(f, (curr) => curr.filter(id => id !== c))}
                                onClearMapping={(f) => updateMapping(f, () => [])}
                                onResetMapping={() => {}} // Not implemented in current hook version but can be added
                            />
                        )}
                        {wizardStep === 3 && (
                            <ImportStepPreview
                                parsed={parsed}
                                mapping={mapping}
                                preview={preview}
                            />
                        )}
                        {wizardStep === 4 && (
                            <ImportStepConfirmation
                                commit={commit}
                                result={result}
                                importing={importing}
                                mappingChecked={mappingChecked}
                                previewChecked={previewChecked}
                                saveChecked={saveChecked}
                                onMappingCheckedChange={setMappingChecked}
                                onPreviewCheckedChange={setPreviewChecked}
                                onSaveCheckedChange={setSaveChecked}
                            />
                        )}
                    </div>

                    <DialogFooter className="gap-2 sm:justify-between">
                        <Button
                            variant="ghost"
                            onClick={goBack}
                            disabled={wizardStep === 0 || importing || !!result}
                        >
                            Anterior
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={handleClose} disabled={importing}>
                                {result ? "Cerrar" : "Cancelar"}
                            </Button>
                            {wizardStep === 4 && !result ? (
                                <Button
                                    onClick={handleImport}
                                    disabled={isNextDisabled()}
                                    className="bg-green-600 hover:bg-green-700"
                                >
                                    {importing ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Importando...
                                        </>
                                    ) : (
                                        "Confirmar e Importar"
                                    )}
                                </Button>
                            ) : (
                                !result && (
                                    <Button onClick={goNext} disabled={isNextDisabled()}>
                                        {preparing ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Validando...
                                            </>
                                        ) : (
                                            "Siguiente"
                                        )}
                                    </Button>
                                )
                            )}
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
