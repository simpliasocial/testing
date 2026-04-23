import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import * as xlsx from "xlsx";
import { format } from "date-fns";
import { useDashboardContext } from "@/context/DashboardDataContext";
import { config } from "@/config";
import { toast } from "sonner";
import { getLeadChannelName } from "@/lib/leadDisplay";

export function ExportToExcel() {
    const { conversations, inboxes } = useDashboardContext();

    const handleExport = () => {
        if (!conversations || conversations.length === 0) {
            toast.error("No hay datos para exportar");
            return;
        }

        try {
            const inboxMap = new Map(inboxes.map(i => [i.id, i]));

            // 1. Discover all unique custom attribute keys across both contact and conversation
            const customAttrKeys = new Set<string>();
            conversations.forEach(conv => {
                const contactAttrs = conv.meta?.sender?.custom_attributes || {};
                const convAttrs = conv.custom_attributes || {};

                Object.keys(contactAttrs).forEach(k => customAttrKeys.add(k));
                Object.keys(convAttrs).forEach(k => customAttrKeys.add(k));
            });

            const sortedKeys = Array.from(customAttrKeys).sort();

            // 2. Map data with dynamic columns
            const dataToExport = conversations.map(conv => {
                const contactAttrs = conv.meta?.sender?.custom_attributes || {};
                const convAttrs = conv.custom_attributes || {};
                const allAttrs = { ...convAttrs, ...contactAttrs };

                const inbox = conv.inbox_id ? inboxMap.get(conv.inbox_id) : undefined;
                const canal = getLeadChannelName(conv, inbox);

                const createdAt = conv.created_at ? new Date(conv.created_at * 1000) : null;
                const lastActivity = conv.timestamp ? new Date(conv.timestamp * 1000) : null;

                // Base fields
                const row: any = {
                    "ID Conversacion": conv.id,
                    "Nombre del Lead": conv.meta?.sender?.name || allAttrs.nombre_completo || "",
                    "Telefono/Celular": allAttrs.celular || conv.meta?.sender?.phone_number || "",
                    "Canal": canal,
                    "Etiquetas": (conv.labels || []).join(", "),
                    "Correo": allAttrs.correo || conv.meta?.sender?.email || "",
                };

                // Dynamic custom attributes
                sortedKeys.forEach(key => {
                    // Format key for header (example: "fecha_visita" -> "Fecha Visita (Attr)")
                    const header = key
                        .split("_")
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(" ") + " (Attr)";

                    row[header] = allAttrs[key] || "";
                });

                // Metadata fields
                row["Enlace Chatwoot"] = `${config.chatwoot.publicUrl}/app/accounts/${config.chatwoot.accountId}/conversations/${conv.id}`;
                row["Fecha ingreso"] = createdAt ? format(createdAt, "yyyy-MM-dd HH:mm:ss") : "";
                row["Ultima Interaccion"] = lastActivity ? format(lastActivity, "yyyy-MM-dd HH:mm:ss") : "";

                return row;
            });

            const worksheet = xlsx.utils.json_to_sheet(dataToExport);
            const workbook = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(workbook, worksheet, "Conversaciones");

            const fileName = `Reporte_Conversaciones_${format(new Date(), "yyyyMMdd_HHmmss")}.xlsx`;
            xlsx.writeFile(workbook, fileName);
            toast.success("Archivo Excel generado exitosamente");
        } catch (error) {
            console.error("Error al exportar a Excel:", error);
            toast.error("Error al exportar el archivo");
        }
    };

    return (
        <Button variant="outline" size="icon" className="md:w-auto md:px-3" onClick={handleExport} title="Exportar a Excel">
            <Download className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Exportar</span>
        </Button>
    );
}
