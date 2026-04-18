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

    const getChannelIcon = (type: string) => {
        switch (type) {
            case "Channel::Whatsapp": return "WhatsApp";
            case "Channel::FacebookPage": return "Facebook";
            case "Channel::Instagram": return "Instagram";
            case "Channel::TwitterProfile": return "Twitter";
            default: return type.replace("Channel::", "");
        }
    };

    const selectedLabels = selectedInboxes.length === 0
        ? "Todos los Canales"
        : `${selectedInboxes.length} selecionado(s)`;

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
                            {inboxes.map((inbox) => (
                                <CommandItem
                                    key={inbox.id}
                                    value={inbox.name}
                                    onSelect={() => toggleInbox(inbox.id)}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            selectedInboxes.includes(inbox.id) ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <div>
                                        <div className="text-sm font-semibold">{getChannelIcon(inbox.channel_type)}</div>
                                        <div className="text-[10px] text-muted-foreground">{inbox.name}</div>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
