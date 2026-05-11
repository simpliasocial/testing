import type { LeadLike, LeadStage, LeadStageTagConfig } from "./types";
import { hasAnyLabel } from "./labels";

const compactLabels = (labels: Array<string | undefined>) =>
    labels.map((label) => String(label || "").trim()).filter(Boolean);

export const getSaleStageLabels = (tags: LeadStageTagConfig = {}) =>
    compactLabels([
        ...(tags.saleTags || []),
        tags.humanSaleTargetLabel || "venta_exitosa",
    ]);

export const getAppointmentStageLabels = (tags: LeadStageTagConfig = {}) =>
    compactLabels([
        ...(tags.appointmentTags || []),
        ...(tags.humanSalesQueueTags || []),
        tags.humanAppointmentTargetLabel || "cita_agendada_humano",
    ]);

export const resolveLeadStage = (lead: LeadLike, tags: LeadStageTagConfig = {}): LeadStage => {
    const labels = lead.labels || lead.resolvedLabels || [];

    if (hasAnyLabel(labels, getSaleStageLabels(tags))) return "sale";
    if (hasAnyLabel(labels, getAppointmentStageLabels(tags))) return "appointment";
    if (hasAnyLabel(labels, tags.unqualifiedTags || [])) return "unqualified";
    if (hasAnyLabel(labels, tags.humanFollowupQueueTags || [])) return "followup";
    if (hasAnyLabel(labels, tags.sqlTags || [])) return "sql";

    return "other";
};
