import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import * as xlsx from "xlsx";
import { format } from "date-fns";
import { useDashboardContext } from "@/context/DashboardDataContext";
import { config } from "@/config";
import { toast } from "sonner";
import { getAttrs, getLeadChannelName, getLeadExternalUrl } from "@/lib/leadDisplay";
import { formatBusinessList, formatFieldLabel } from "@/lib/displayCopy";

export function ExportToExcel() {
    const { conversations, inboxes, tagSettings } = useDashboardContext();

    const handleExport = () => {
        if (!conversations || conversations.length === 0) {
            toast.error("No hay datos para exportar");
            return;
        }

        try {
            const inboxMap = new Map(inboxes.map(i => [i.id, i]));

            const activeFields = tagSettings.excelExportFields && tagSettings.excelExportFields.length > 0
                ? tagSettings.excelExportFields
                : ["ID", "Nombre", "Telefono", "Canal", "Estados", "Correo", "Enlace de conversación", "Fecha Ingreso", "Ultima Interaccion"];

            // 2. Map data with configured columns
            const dataToExport = conversations.map(conv => {
                const allAttrs = getAttrs(conv);

                const inbox = conv.inbox_id ? inboxMap.get(conv.inbox_id) : undefined;
                const canal = getLeadChannelName(conv, inbox);

                const createdAt = conv.created_at ? new Date(conv.created_at * 1000) : null;
                const lastActivity = conv.timestamp ? new Date(conv.timestamp * 1000) : null;

                const row: any = {};

                activeFields.forEach(field => {
                    const displayField = formatFieldLabel(field);
                    if (displayField === "Enlace de conversación") {
                        row[displayField] = `${config.chatwoot.publicUrl}/app/accounts/${config.chatwoot.accountId}/conversations/${conv.id}`;
                        return;
                    }
                    switch (field) {
                        case "ID": row[displayField] = conv.id; break;
                        case "Nombre": row[displayField] = conv.meta?.sender?.name || allAttrs.nombre_completo || ""; break;
                        case "Telefono": row[displayField] = allAttrs.celular || conv.meta?.sender?.phone_number || ""; break;
                        case "Canal": row[displayField] = canal; break;
                        case "Estados":
                        case "Etiquetas": row[displayField] = formatBusinessList(conv.labels || []); break;
                        case "Correo": row[displayField] = allAttrs.correo || conv.meta?.sender?.email || ""; break;
                        case "Monto": row[displayField] = allAttrs.monto_operacion || ""; break;
                        case "Fecha Monto": row[displayField] = allAttrs.fecha_monto_operacion || ""; break;
                        case "Agencia": row[displayField] = allAttrs.agencia || ""; break;
                        case "Check-in": row[displayField] = allAttrs.checkincat || ""; break;
                        case "Check-out": row[displayField] = allAttrs.checkoutcat || ""; break;
                        case "Campana": row[displayField] = allAttrs.campana || ""; break;
                        case "Ciudad": row[displayField] = allAttrs.ciudad || ""; break;
                        case "Responsable": row[displayField] = allAttrs.responsable || conv.meta?.assignee?.name || ""; break;
                        case "URL Red Social": row[displayField] = getLeadExternalUrl(conv, canal); break;
                        case "Fecha Ingreso": row[displayField] = createdAt ? format(createdAt, "yyyy-MM-dd HH:mm:ss") : ""; break;
                        case "Ultima Interaccion": row[displayField] = lastActivity ? format(lastActivity, "yyyy-MM-dd HH:mm:ss") : ""; break;
                        case "ID Contacto": row[displayField] = conv.meta?.sender?.id || ""; break;
                        case "ID Inbox": row[displayField] = conv.inbox_id || ""; break;
                        case "ID Cuenta": row[displayField] = (conv as any).account_id || ""; break;
                        case "Origen Dato": row[displayField] = (conv as any).source || ""; break;
                        default: row[displayField] = allAttrs[field] || ""; break;
                    }
                });

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
