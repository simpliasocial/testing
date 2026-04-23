import * as React from "react";
import { Check, ChevronsUpDown, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useDashboardContext } from "@/context/DashboardDataContext";
import { getInboxChannelName } from "@/lib/leadDisplay";

interface ChannelSelectorProps {
    selectedInboxes: number[];
    onChange: (ids: number[]) => void;
}

export function ChannelSelector({
    selectedInboxes,
    onChange,
}: ChannelSelectorProps) {
    const [open, setOpen] = React.useState(false);
    const { inboxes } = useDashboardContext();

    const toggleInbox = (id: number) => {
        const next = selectedInboxes.includes(id)
            ? selectedInboxes.filter((item) => item !== id)
            : [...selectedInboxes, id];
        onChange(next);
    };

    const selectedLabels = React.useMemo(() => {
        if (selectedInboxes.length === 0) return "Todos los Canales";
        if (selectedInboxes.length === 1) {
            const inbox = inboxes.find(i => i.id === selectedInboxes[0]);
            return inbox ? getInboxChannelName(inbox) : "1 selecionado";
        }
        return `${selectedInboxes.length} selecionado(s)`;
    }, [selectedInboxes, inboxes]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-[200px] justify-between"
                >
                    <Filter className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    {selectedLabels}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0">
                <Command>
                    <CommandInput placeholder="Buscar canal..." />
                    <CommandList>
                        <CommandEmpty>No se encontraron canales.</CommandEmpty>
                        <CommandGroup>
                            {inboxes.map((inbox) => {
                                const channelName = getInboxChannelName(inbox);
                                return (
                                    <CommandItem
                                        key={inbox.id}
                                        value={channelName + ' ' + inbox.name} // Keep full name for searchability
                                        onSelect={() => toggleInbox(inbox.id)}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                selectedInboxes.includes(inbox.id) ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        <span className="text-sm font-medium">{channelName}</span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
