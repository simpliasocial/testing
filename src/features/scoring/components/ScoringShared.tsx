import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { unique } from "@/features/scoring/model/leadScoringModel";

export const FilterSelect = ({ label, value, onChange, options, optionLabel }: {
    label: string; value: string; onChange: (value: string) => void; options: string[]; optionLabel?: (value: string) => string;
}) => (
    <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground">{label}</label>
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {options.map(option => (<SelectItem key={option} value={option}>{optionLabel ? optionLabel(option) : option}</SelectItem>))}
            </SelectContent>
        </Select>
    </div>
);

export const MultiFilterSelect = ({ label, values, onChange, options, optionLabel }: {
    label: string; values: string[]; onChange: (values: string[]) => void; options: string[]; optionLabel?: (value: string) => string;
}) => {
    const [open, setOpen] = useState(false);
    const toggleValue = (option: string) => { onChange(values.includes(option) ? values.filter(v => v !== option) : unique([...values, option])); };
    const summary = values.length === 0 ? "Todos" : values.length === 1 ? (optionLabel ? optionLabel(values[0]) : values[0]) : `${values.length} seleccionados`;

    return (
        <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">{label}</label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={open} className="h-9 w-full justify-between font-normal">
                        <span className="truncate">{summary}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-0" align="start">
                    <Command>
                        <CommandInput placeholder={`Buscar ${label.toLowerCase()}...`} />
                        <CommandList>
                            <CommandEmpty>No se encontraron opciones.</CommandEmpty>
                            <CommandGroup>
                                <CommandItem value="__all__" onSelect={() => onChange([])}>
                                    <Checkbox checked={values.length === 0} className="pointer-events-none mr-2" />
                                    <span>Todos</span>
                                </CommandItem>
                                {options.map(option => {
                                    const checked = values.includes(option);
                                    const display = optionLabel ? optionLabel(option) : option;
                                    return (
                                        <CommandItem key={option} value={`${display} ${option}`} onSelect={() => toggleValue(option)}>
                                            <Checkbox checked={checked} className="pointer-events-none mr-2" />
                                            <span className={cn("truncate", checked && "font-medium")}>{display}</span>
                                            {checked ? <Check className="ml-auto h-4 w-4 text-primary" /> : null}
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
};

export const ChartCard = ({ title, description, children, action }: { title: string; description: string; children: ReactNode; action?: ReactNode }) => (
    <Card>
        <CardHeader>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <CardTitle className="text-base">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </div>
                {action}
            </div>
        </CardHeader>
        <CardContent>{children}</CardContent>
    </Card>
);

export const EmptyState = ({ text }: { text: string }) => (
    <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground">
        {text}
    </div>
);
