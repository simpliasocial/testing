import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
    getAppointmentFieldExample,
    getFieldTypeLabel,
    type AppointmentFormValue,
    type AttributeDefinition,
} from "../model/leadActionQueueModel";

type WorkflowFieldProps = {
    field: AttributeDefinition;
    value: AppointmentFormValue | undefined;
    onValueChange: (key: string, value: AppointmentFormValue) => void;
    fieldIdPrefix: string;
};

export const WorkflowField = ({
    field,
    value: fieldValue,
    onValueChange,
    fieldIdPrefix,
}: WorkflowFieldProps) => {
    const value = fieldValue ?? (field.valueType === "boolean" ? false : "");
    const exampleText = getAppointmentFieldExample(field);
    const fieldId = `${fieldIdPrefix}-field-${field.key}`;
    const fieldMeta = [
        field.key,
        field.description,
        field.regexCue,
    ].filter(Boolean).join(" \u00b7 ");
    const commonLabel = (
        <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm font-medium" htmlFor={fieldId}>
                    {field.label}
                </label>
                <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                    {getFieldTypeLabel(field)}
                </Badge>
            </div>
            <div className="text-[11px] text-muted-foreground">
                {fieldMeta}
            </div>
            {exampleText && (
                <div className="text-[11px] text-violet-700">
                    {exampleText}
                </div>
            )}
        </div>
    );

    if (field.options.length > 0) {
        return (
            <div className="space-y-2">
                {commonLabel}
                <Select
                    value={String(value || "")}
                    onValueChange={(nextValue) => onValueChange(field.key, nextValue)}
                >
                    <SelectTrigger id={fieldId}>
                        <SelectValue placeholder={`Selecciona ${field.label.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                        {field.options.map((option) => (
                            <SelectItem key={`${field.key}-${option}`} value={option}>
                                {option}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        );
    }

    if (field.valueType === "date") {
        return (
            <div className="space-y-2">
                {commonLabel}
                <div className="relative">
                    <CalendarDays className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                        id={fieldId}
                        type="date"
                        className="pl-9"
                        value={String(value || "")}
                        onChange={(event) => onValueChange(field.key, event.target.value)}
                    />
                </div>
            </div>
        );
    }

    if (field.valueType === "boolean") {
        return (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                {commonLabel}
                <div className="flex items-center space-x-2">
                    <Checkbox
                        id={fieldId}
                        checked={Boolean(value)}
                        onCheckedChange={(checked) => onValueChange(field.key, checked === true)}
                    />
                    <Label htmlFor={fieldId} className="text-sm">
                        Activado
                    </Label>
                </div>
            </div>
        );
    }

    if (field.valueType === "textarea") {
        return (
            <div className="space-y-2">
                {commonLabel}
                <Textarea
                    id={fieldId}
                    value={String(value)}
                    onChange={(event) => onValueChange(field.key, event.target.value)}
                    placeholder={exampleText || `Ingresa ${field.label.toLowerCase()}`}
                />
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {commonLabel}
            <Input
                id={fieldId}
                type={field.valueType === "number" ? "number" : "text"}
                step={field.valueType === "number" ? "any" : undefined}
                value={String(value || "")}
                onChange={(event) => onValueChange(field.key, event.target.value)}
                placeholder={exampleText || `Ingresa ${field.label.toLowerCase()}`}
            />
        </div>
    );
};
