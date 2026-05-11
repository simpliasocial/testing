import { parseAmount } from "../../../domain/lead";
import {
    formatBusinessLabel,
    formatBusinessList,
    formatFieldLabel,
} from "../../../lib/displayCopy";

export type SalesReportCell = string | number | boolean;
export type SalesReportRow = Record<string, SalesReportCell>;
export type SalesReportSummaryRow = [string, SalesReportCell];

export type SalesReportLead = {
    id: number;
    labels?: string[];
    created_at?: number;
    timestamp?: number;
    inbox_id?: number;
    source?: unknown;
    account_id?: unknown;
    meta?: {
        sender?: {
            id?: unknown;
        };
        assignee?: {
            name?: unknown;
        };
    };
};

export type SalesReportData = {
    summaryRows: SalesReportSummaryRow[];
    byChannelRows: Array<{ canal: string; ventas: number; monto: number }>;
    byMonthRows: Array<{ periodo: string; ventas: number; monto: number }>;
    detailRows: SalesReportRow[];
};

export type BuildSalesReportDataParams<TLead extends SalesReportLead> = {
    leads: TLead[];
    activeFields?: string[];
    generatedAt: string;
    salesStartDate?: string;
    salesEndDate?: string;
    salesSearch?: string;
    saleTargetLabel: string;
    salesTotal: number;
    getAttrs: (lead: TLead) => Record<string, unknown>;
    getChannelName: (lead: TLead) => string;
    getChatwootUrl: (conversationId: number) => string;
    getLeadName: (lead: TLead) => string;
    getLeadPhone: (lead: TLead, channel: string) => string;
    getLeadEmail: (lead: TLead) => string;
    getLeadExternalUrl: (lead: TLead, channel: string) => string;
    getLeadOperationDate: (lead: TLead) => string;
    formatDateTime: (timestamp?: number | string | Date | null) => string;
};

export const DEFAULT_SALES_EXPORT_FIELDS = [
    "ID",
    "Nombre",
    "Telefono",
    "Canal",
    "Estados",
    "Correo",
    "Enlace de conversación",
    "Fecha Ingreso",
    "Ultima Interaccion",
];

export const toSalesReportCell = (value: unknown): SalesReportCell => {
    if (typeof value === "number") return Number.isFinite(value) ? value : "";
    if (typeof value === "string" || typeof value === "boolean") return value;
    return value == null ? "" : String(value);
};

export const resolveSalesExportFields = (fields: string[] = []) =>
    fields.length > 0 ? fields : DEFAULT_SALES_EXPORT_FIELDS;

const toUnixDate = (value: unknown) => {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000) : null;
};

export const buildSalesReportData = <TLead extends SalesReportLead>({
    leads,
    activeFields = DEFAULT_SALES_EXPORT_FIELDS,
    generatedAt,
    salesStartDate = "",
    salesEndDate = "",
    salesSearch = "",
    saleTargetLabel,
    salesTotal,
    getAttrs,
    getChannelName,
    getChatwootUrl,
    getLeadName,
    getLeadPhone,
    getLeadEmail,
    getLeadExternalUrl,
    getLeadOperationDate,
    formatDateTime,
}: BuildSalesReportDataParams<TLead>): SalesReportData => {
    const fields = resolveSalesExportFields(activeFields);

    const detailRows = leads.map((lead) => {
        const attrs = getAttrs(lead);
        const createdAt = toUnixDate(lead.created_at);
        const lastActivity = toUnixDate(lead.timestamp);
        const channel = getChannelName(lead);
        const row: SalesReportRow = {};

        fields.forEach((field) => {
            const displayField = formatFieldLabel(field);

            if (displayField === "Enlace de conversación") {
                row[displayField] = getChatwootUrl(lead.id);
                return;
            }

            switch (field) {
                case "ID":
                    row[displayField] = lead.id;
                    break;
                case "Nombre":
                    row[displayField] = getLeadName(lead);
                    break;
                case "Telefono":
                    row[displayField] = getLeadPhone(lead, channel);
                    break;
                case "Canal":
                    row[displayField] = channel;
                    break;
                case "Estados":
                case "Etiquetas":
                    row[displayField] = formatBusinessList(lead.labels || []);
                    break;
                case "Correo":
                    row[displayField] = getLeadEmail(lead);
                    break;
                case "Monto":
                    row[displayField] = toSalesReportCell(attrs.monto_operacion);
                    break;
                case "Fecha Monto":
                    row[displayField] = getLeadOperationDate(lead);
                    break;
                case "Agencia":
                    row[displayField] = toSalesReportCell(attrs.agencia);
                    break;
                case "Check-in":
                    row[displayField] = toSalesReportCell(attrs.checkincat);
                    break;
                case "Check-out":
                    row[displayField] = toSalesReportCell(attrs.checkoutcat);
                    break;
                case "Campana":
                    row[displayField] = toSalesReportCell(attrs.campana);
                    break;
                case "Ciudad":
                    row[displayField] = toSalesReportCell(attrs.ciudad);
                    break;
                case "Responsable":
                    row[displayField] = toSalesReportCell(attrs.responsable || lead.meta?.assignee?.name);
                    break;
                case "URL Red Social":
                    row[displayField] = getLeadExternalUrl(lead, channel);
                    break;
                case "Fecha Ingreso":
                    row[displayField] = createdAt ? formatDateTime(createdAt.getTime()) : "";
                    break;
                case "Ultima Interaccion":
                    row[displayField] = lastActivity ? formatDateTime(lastActivity.getTime()) : "";
                    break;
                case "ID Contacto":
                    row[displayField] = toSalesReportCell(lead.meta?.sender?.id);
                    break;
                case "ID Inbox":
                    row[displayField] = toSalesReportCell(lead.inbox_id);
                    break;
                case "ID Cuenta":
                    row[displayField] = toSalesReportCell(lead.account_id);
                    break;
                case "Origen Dato":
                    row[displayField] = toSalesReportCell(lead.source);
                    break;
                default:
                    row[displayField] = toSalesReportCell(attrs[field]);
                    break;
            }
        });

        row["Monto numérico"] = parseAmount(attrs.monto_operacion);
        return row;
    });

    const byChannel = new Map<string, { canal: string; ventas: number; monto: number }>();
    const byMonth = new Map<string, { periodo: string; ventas: number; monto: number }>();

    leads.forEach((lead) => {
        const amount = parseAmount(getAttrs(lead).monto_operacion);
        const channel = getChannelName(lead);
        const month = (getLeadOperationDate(lead) || "Sin fecha").slice(0, 7);

        const channelRow = byChannel.get(channel) || { canal: channel, ventas: 0, monto: 0 };
        channelRow.ventas += 1;
        channelRow.monto += amount;
        byChannel.set(channel, channelRow);

        const monthRow = byMonth.get(month) || { periodo: month, ventas: 0, monto: 0 };
        monthRow.ventas += 1;
        monthRow.monto += amount;
        byMonth.set(month, monthRow);
    });

    return {
        summaryRows: [
            ["Generado", generatedAt],
            ["Filtro fecha inicio", salesStartDate || "Todos"],
            ["Filtro fecha fin", salesEndDate || "Todos"],
            ["Filtro busqueda", salesSearch || "Todos"],
            ["Estado de venta usado", formatBusinessLabel(saleTargetLabel)],
            ["Ventas exitosas", leads.length],
            ["Monto total", salesTotal],
            ["Ticket promedio", leads.length > 0 ? salesTotal / leads.length : 0],
        ],
        byChannelRows: Array.from(byChannel.values()),
        byMonthRows: Array.from(byMonth.values()),
        detailRows,
    };
};
