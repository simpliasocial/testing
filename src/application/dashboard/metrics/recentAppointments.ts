import { cleanText, type UnknownRecord } from "../../../domain/common/types";
import type { LeadStage } from "../../../domain/lead";
import { toDisplayText, type RecentAppointmentViewModel } from "../viewModel";

interface AppointmentConversation {
    id?: number;
    resolvedStage?: LeadStage;
    resolvedAttrs?: UnknownRecord;
    created_at?: number | string;
    timestamp?: number | string;
    meta?: {
        sender?: {
            name?: string;
            phone_number?: string;
        };
    };
}

const isAppointmentStage = (stage?: LeadStage) =>
    stage === "appointment" || stage === "sale";

export const buildRecentAppointments = (
    conversations: AppointmentConversation[],
    limit = 5,
): RecentAppointmentViewModel[] =>
    conversations
        .filter((conversation) => isAppointmentStage(conversation.resolvedStage))
        .slice(0, limit)
        .map((conversation) => {
            const attrs = conversation.resolvedAttrs || {};

            return {
                id: Number(conversation.id),
                name: toDisplayText(conversation.meta?.sender?.name || attrs.nombre_completo, "Sin Nombre"),
                cellphone: toDisplayText(conversation.meta?.sender?.phone_number || attrs.celular, "Sin Teléfono"),
                agency: toDisplayText(attrs.agencia, "Sin Agencia"),
                date: toDisplayText(attrs.fecha_visita, "Pendiente"),
                time: cleanText(attrs.hora_visita),
                status: conversation.resolvedStage === "sale" ? "Finalizado" : "Confirmado",
                createdAt: conversation.created_at || conversation.timestamp || 0,
                lastInteractionAt: conversation.timestamp || conversation.created_at || 0,
            };
        });
