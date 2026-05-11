import type { ResolvedConversation } from "@/context/dashboardDataTypes";
import type { TagConfig } from "@/domain/dashboard";
import type { ReportSection } from "@/domain/report";
import { REPORT_TAB_LABELS, type ReportTabId } from "../domain/reportCatalog";
import { getLeadName, getLeadPhone, getChatwootUrl, getLeadExternalUrl, getLeadChannelName, getMessagePreview } from "@/lib/leadDisplay";
import { formatBusinessList, formatFieldLabel } from "@/lib/displayCopy";
import { formatScoreValue, bucketFromScore, normalizeScoreThresholds, SCORE_BUCKET_COPY, SCORE_BUCKET_ORDER, type ScoreBucket } from "@/lib/leadScoreClassification";
import {
    buildFunnelRows,
    buildFunnelConversionRows,
    buildStageRows,
    buildNamedValueRows,
    buildStatusRows,
    buildSourceRows,
    buildQualityConfigRows,
    buildQualityDistributionRows,
    buildLabelRows,
    ensureReportRows,
    filterReportConversations,
    formatConversationStatus,
    metricRow,
    numberCell,
    formatPercentValue,
    formatDuration,
    formatCurrencyValue,
    formatDataOrigin,
    getReportConversationLabels,
    withSection,
    safeDivision,
} from "@/features/reporting/model/reportExportModel";
import { buildCommercialAuditRows } from "@/lib/commercialFacts";
import { formatReportDateTime, REPORT_TIME_ZONE } from "@/shared/report/reportFormatting";
import { asRecord, asRecordArray } from "@/domain/common/types";
import type { InboxMap, DashboardReportInput, DashboardReportData } from "../domain/reportTypes";
import {
    getScoreNumber,
    getFieldsForTab,
    getFieldValue,
    getCampaignValue,
    getConversationStage,
    hasUnansweredCustomerMessage,
    getConversationRevenue,
    getRangeLabel,
    getSelectedInboxSummary,
    getTabInterpretation,
    getConversationSummary,
    getOwnerPerformanceRows,
    getResponsibleValue,
    getInboxMap,
} from "./reportDataExtractors";

const formatExcelTimestamp = (value: unknown) => {
    if (!value) return "";
    return String(value);
};

export const buildConversationRows = (
    tabId: ReportTabId,
    conversations: ResolvedConversation[],
    inboxMap: InboxMap,
    tagSettings: TagConfig,
) => {
    const fields = getFieldsForTab(tabId, tagSettings);
    return conversations.map((conversation) => {
        const row: Record<string, unknown> = {};
        fields.forEach((field) => {
            row[formatFieldLabel(field)] = getFieldValue(field, conversation, inboxMap, tagSettings);
        });
        return row;
    });
};

export const buildScoringRows = (
    conversations: ResolvedConversation[],
    inboxMap: InboxMap,
    tagSettings: TagConfig,
) => conversations
    .map((conversation) => {
        const inbox = conversation.inbox_id ? inboxMap.get(Number(conversation.inbox_id)) : undefined;
        const canal = getLeadChannelName(conversation, inbox);
        const score = getScoreNumber(conversation, tagSettings);
        const bucket = bucketFromScore(score, normalizeScoreThresholds(tagSettings.scoreThresholds));

        return {
            "ID Conversacion": conversation.id,
            "Nombre del Lead": getLeadName(conversation),
            Canal: canal,
            Número: getLeadPhone(conversation, canal),
            Estados: formatBusinessList(getReportConversationLabels(conversation), " | "),
            "Historial de mensajes": getMessagePreview(conversation),
            "URL comercial": getLeadExternalUrl(conversation, canal),
            "Enlace de conversación": getChatwootUrl(conversation.id),
            Nivel: SCORE_BUCKET_COPY[bucket].label,
            Puntaje: formatScoreValue(score),
            Campaña: getCampaignValue(conversation),
            "Fecha de ingreso": formatExcelTimestamp(conversation.created_at || conversation.timestamp),
            "Última interacción": formatExcelTimestamp(conversation.timestamp || conversation.created_at),
            "Origen del dato": formatDataOrigin(conversation.source),
        };
    })
    .sort((a, b) => {
        const scoreA = getScoreNumber(conversations.find(c => c.id === a["ID Conversacion"])!, tagSettings) ?? Number.NEGATIVE_INFINITY;
        const scoreB = getScoreNumber(conversations.find(c => c.id === b["ID Conversacion"])!, tagSettings) ?? Number.NEGATIVE_INFINITY;
        return scoreB - scoreA;
    });

const createBucketCounter = () =>
    Object.fromEntries(SCORE_BUCKET_ORDER.map((bucket) => [bucket, 0])) as Record<ScoreBucket, number>;

export const buildDimensionRows = (
    conversations: ResolvedConversation[],
    inboxMap: InboxMap,
    tagSettings: TagConfig,
    dimensionLabel: string,
    resolveDimension: (conversation: ResolvedConversation, inboxMap: InboxMap) => unknown,
) => {
    const thresholds = normalizeScoreThresholds(tagSettings.scoreThresholds);
    const grouped = new Map<string, {
        leads: number;
        sqls: number;
        appointments: number;
        sales: number;
        unanswered: number;
        revenue: number;
        scoreSum: number;
        scored: number;
        buckets: Record<ScoreBucket, number>;
    }>();

    conversations.forEach((conversation) => {
        const key = String(resolveDimension(conversation, inboxMap)) || "Sin dato";
        const current = grouped.get(key) || {
            leads: 0,
            sqls: 0,
            appointments: 0,
            sales: 0,
            unanswered: 0,
            revenue: 0,
            scoreSum: 0,
            scored: 0,
            buckets: createBucketCounter(),
        };
        const stage = getConversationStage(conversation);
        const score = getScoreNumber(conversation, tagSettings);
        const bucket = bucketFromScore(score, thresholds);

        current.leads += 1;
        if (stage === "sql") current.sqls += 1;
        if (stage === "appointment") current.appointments += 1;
        // isCurrentSale usage needs tagSettings
        const isSale = getConversationRevenue(conversation, tagSettings) > 0; 
        if (isSale) current.sales += 1;
        if (hasUnansweredCustomerMessage(conversation)) current.unanswered += 1;
        current.revenue += getConversationRevenue(conversation, tagSettings);
        current.buckets[bucket] += 1;
        if (score !== null) {
            current.scoreSum += score;
            current.scored += 1;
        }
        grouped.set(key, current);
    });

    return Array.from(grouped.entries())
        .map(([key, value]) => ({
            [dimensionLabel]: key,
            Leads: value.leads,
            SQLs: value.sqls,
            Citas: value.appointments,
            Ventas: value.sales,
            "Sin respuesta": value.unanswered,
            "Monto ventas": value.revenue,
            "Tasa cita": formatPercentValue(safeDivision(value.appointments, value.leads) * 100),
            "Tasa venta": formatPercentValue(safeDivision(value.sales, value.leads) * 100),
            "Puntaje promedio": value.scored > 0 ? Number((value.scoreSum / value.scored).toFixed(2)) : "",
            Caliente: value.buckets.hot,
            Tibio: value.buckets.warm,
            Frío: value.buckets.cold,
        }))
        .sort((a, b) => numberCell(b.Leads) - numberCell(a.Leads));
};

export const buildSummaryRows = (
    input: DashboardReportInput,
    tabId: ReportTabId,
    conversations: ResolvedConversation[],
) => {
    const { start, end } = getRangeLabel(input.globalFilters);
    const selectedTabs = input.tabIds.map((id) => REPORT_TAB_LABELS[id]).join(", ");

    return [
        { Campo: "Reporte", Valor: input.title },
        { Campo: "Pestaña", Valor: REPORT_TAB_LABELS[tabId] },
        { Campo: "Pestañas solicitadas", Valor: selectedTabs },
        { Campo: "Periodo", Valor: `${start} a ${end}` },
        { Campo: "Canales filtrados", Valor: getSelectedInboxSummary(input) },
        { Campo: "Generado", Valor: formatReportDateTime() },
        { Campo: "Zona horaria", Valor: REPORT_TIME_ZONE },
        { Campo: "Total encontrado", Valor: conversations.length },
        { Campo: "Datos incluidos", Valor: "Resumen ejecutivo, KPIs, análisis por dimensión, cambios relevantes cuando existan y detalle de leads." },
        { Campo: "Lectura recomendada", Valor: getTabInterpretation(tabId) },
        { Campo: "Nota de uso", Valor: "Excel y CSV contienen el detalle completo; PDF prioriza lectura ejecutiva y puede recortar tablas largas." },
    ];
};

export const buildKpiRows = (
    tabId: ReportTabId,
    conversations: ResolvedConversation[],
    inboxMap: InboxMap,
    dashboardData: DashboardReportData | undefined,
    tagSettings: TagConfig,
) => {
    const kpis = asRecord(dashboardData?.kpis);
    const operational = asRecord(dashboardData?.operationalMetrics);
    const human = asRecord(dashboardData?.humanMetrics);
    const totals = getConversationSummary(conversations, tagSettings);

    if (tabId === "overview") {
        return [
            metricRow("Total leads", numberCell(kpis.totalLeads || totals.leads), "Leads creados en el periodo filtrado", "Volumen total de oportunidades recibidas."),
            metricRow("SQLs", numberCell(kpis.interestedLeads || totals.sqls), "Leads en etapa SQL/interesado", "Oportunidades con señal comercial clara."),
            metricRow("Citas agendadas", numberCell(kpis.scheduledAppointments || totals.appointments), "Leads que llegaron a cita", "Paso clave antes de venta o cierre."),
            metricRow("Ventas exitosas", numberCell(kpis.closedSales || totals.sales), "Leads cerrados como venta", "Resultado comercial final del periodo."),
            metricRow("Tasa de cita", formatPercentValue(kpis.schedulingRate || totals.appointmentRate), "Citas / Leads", "Eficiencia para convertir leads en citas."),
            metricRow("Tasa de venta", formatPercentValue(totals.salesRate), "Ventas / Leads", "Eficiencia general del embudo."),
            metricRow("Monto periodo", formatCurrencyValue(kpis.monthlyProfit || totals.revenue), "Suma de montos de venta", "Ingreso atribuido al periodo filtrado."),
            metricRow("Monto total", formatCurrencyValue(kpis.totalProfit || totals.revenue), "Suma total disponible", "Referencia de ingreso acumulado disponible en datos."),
        ];
    }

    if (tabId === "funnel") {
        return [
            metricRow("Leads en embudo", totals.leads, "Total filtrado", "Base sobre la que se calculan las tasas."),
            metricRow("SQLs", numberCell(kpis.interestedLeads || totals.sqls), "Leads interesados/SQL", "Primer nivel de intención comercial."),
            metricRow("Citas", numberCell(kpis.scheduledAppointments || totals.appointments), "Leads con cita", "Conversión intermedia relevante."),
            metricRow("Ventas", numberCell(kpis.closedSales || totals.sales), "Leads con venta", "Cierres comerciales."),
            metricRow("Descartados", numberCell(kpis.unqualified || totals.unqualified), "Leads no calificados", "Pérdidas o leads fuera de perfil."),
            metricRow("Conversión lead a venta", formatPercentValue(totals.salesRate), "Ventas / Leads", "Lectura de salud del embudo."),
        ];
    }

    if (tabId === "operational") {
        return [
            metricRow("Promedio primera respuesta", formatDuration(operational.firstResponseAverageSeconds), "Tiempo medio hasta primera respuesta", "Velocidad operativa de atención."),
            metricRow("Mediana primera respuesta", formatDuration(operational.firstResponseMedianSeconds), "Mediana de muestras válidas", "Referencia menos sensible a casos extremos."),
            metricRow("Leads con responsable", numberCell(operational.leadsWithOwnerCount), "Leads asignados", "Cobertura de asignación del equipo."),
            metricRow("Asignación", formatPercentValue(operational.leadsWithOwnerPercentage), "Leads con responsable / total", "Qué tan ordenada está la carga comercial."),
            metricRow("Leads sin respuesta", numberCell(operational.leadsSinRespuesta ?? totals.noResponse), "Última interacción del cliente sin respuesta posterior", "Misma lógica usada por la tarjeta de Operación."),
            metricRow("Leads activos", totals.unresolved, "Leads no resueltos", "Carga viva del periodo."),
        ];
    }

    if (tabId === "followup") {
        return [
            metricRow("Cola de seguimiento", numberCell(human.followupCurrent ?? human.followup ?? totals.followups), "Leads con etiquetas de seguimiento", "Trabajo pendiente para gestión humana."),
            metricRow("Conversiones a cita", numberCell(human.humanAppointmentConversions || human.appointments || totals.appointments), "Seguimientos que pasaron a cita", "Efectividad del equipo humano."),
            metricRow("Tasa conversión seguimiento", formatPercentValue(human.humanAppointmentConversionRate || human.conversionRate), "Citas humanas / cola gestionada", "Calidad de la gestión humana."),
            metricRow("Ventas humanas", numberCell(human.salesCount || totals.sales), "Ventas con etiqueta objetivo", "Cierres atribuibles a gestión humana."),
            metricRow("Volumen ventas", formatCurrencyValue(human.salesVolume || totals.revenue), "Suma de montos de venta", "Impacto económico del seguimiento."),
            metricRow("Ticket promedio", formatCurrencyValue(human.averageTicket || totals.averageTicket), "Monto ventas / ventas", "Valor medio de cierre."),
        ];
    }

    if (tabId === "performance") {
        const owners = getOwnerPerformanceRows(dashboardData);
        const bestOwner = [...owners].sort((a, b) => numberCell(b.appointments) - numberCell(a.appointments))[0];
        const followupCount = numberCell(human.followupCurrent ?? human.followup ?? totals.followups);
        const humanAppointments = numberCell(human.humanAppointmentConversions ?? human.appointments ?? totals.appointments);
        const humanConversion = human.humanAppointmentConversionRate ?? human.conversionRate ?? safeDivision(humanAppointments, followupCount + humanAppointments) * 100;
        const humanSales = numberCell(human.salesCount ?? totals.sales);
        const humanRevenue = human.salesVolume ?? totals.revenue;
        const humanAverageTicket = human.averageTicket ?? totals.averageTicket;
        return [
            metricRow("Responsables con actividad", owners.length || new Set(conversations.map(getResponsibleValue)).size, "Responsables únicos", "Cobertura de trabajo humano."),
            metricRow("Seguimiento", followupCount, "Leads en seguimiento humano", "Trabajo gestionado por el equipo."),
            metricRow("Citas humanas", humanAppointments, "Leads que llegaron a cita", "Resultado directo del seguimiento."),
            metricRow("Conversión", formatPercentValue(humanConversion), "Citas / (seguimiento + citas)", "Mismo cálculo visible en Rendimiento Humano."),
            metricRow("Ventas", humanSales, "Leads vendidos", "Cierres por equipo."),
            metricRow("Total vendido", formatCurrencyValue(humanRevenue), "Suma de montos de venta", "Ingreso atribuido a ventas."),
            metricRow("Ticket promedio", formatCurrencyValue(humanAverageTicket), "Total vendido / ventas", "Valor promedio de cierre."),
            metricRow("Mejor responsable por citas", bestOwner?.name || "Sin dato", "Ranking por citas", "Referencia rápida del responsable con mayor resultado."),
        ];
    }

    if (tabId === "trends") {
        return [
            metricRow("Leads analizados", totals.leads, "Total filtrado", "Base de tendencias."),
            metricRow("Canales con leads", new Set(conversations.map((conversation) => getFieldValue("Canal", conversation, inboxMap, tagSettings))).size, "Canales distintos", "Diversidad de origen comercial."),
            metricRow("Campañas con leads", new Set(conversations.map(getCampaignValue)).size, "Campañas distintas", "Diversidad de campaña/origen."),
            metricRow("Ingresos detectados", formatCurrencyValue(totals.revenue), "Suma de ventas", "Impacto económico de las tendencias."),
            metricRow("Puntaje promedio", totals.scored > 0 ? Number(totals.averageScore.toFixed(2)) : "Sin puntajes", "Promedio de leads con score", "Calidad media de leads con dato disponible."),
        ];
    }

    if (tabId === "scoring") {
        const thresholds = normalizeScoreThresholds(tagSettings.scoreThresholds);
        return [
            metricRow("Leads evaluados", totals.leads, "Total filtrado", "Leads considerados para calidad."),
            metricRow("Con puntaje", totals.scored, "Leads con score numérico", "Base con dato real de scoring."),
            metricRow("Sin puntaje", totals.missingScore, "Leads sin score", "Se clasifican como Frío para no quedar fuera del reporte."),
            metricRow("Puntaje promedio", totals.scored > 0 ? Number(totals.averageScore.toFixed(2)) : "Sin puntajes", "Promedio de puntajes", "Lectura general de calidad."),
            metricRow("Rangos activos", `Caliente ${thresholds.hotMin}+ | Tibio ${thresholds.warmMin}-${thresholds.hotMin - 1} | Frío <${thresholds.warmMin} o sin puntaje`, "Configuración admin", "Rangos usados en tabla, KPIs, gráficas y exportes."),
        ];
    }

    return [
        metricRow("Conversaciones exportadas", totals.leads, "Total filtrado", "Conversaciones incluidas en el reporte."),
        metricRow("Con mensajes cargados", totals.withMessages, "Conversaciones con historial de mensajes", "Disponibilidad de contexto conversacional."),
        metricRow("Canales", new Set(conversations.map((conversation) => getFieldValue("Canal", conversation, inboxMap, tagSettings))).size, "Canales distintos", "Cobertura de origen."),
        metricRow("Estados distintos", new Set(conversations.map((conversation) => formatConversationStatus(conversation.status))).size, "Estados Chatwoot", "Variedad de estados operativos."),
    ];
};

export const buildAnalysisRows = (
    tabId: ReportTabId,
    conversations: ResolvedConversation[],
    inboxMap: InboxMap,
    dashboardData: DashboardReportData | undefined,
    tagSettings: TagConfig,
) => {
    const trends = asRecord(dashboardData?.trendMetrics);
    const addRows: Array<Record<string, unknown>> = [];
    const add = (sectionName: string, rows: Array<Record<string, unknown>>) => {
        addRows.push(...withSection(sectionName, rows));
    };

    if (tabId === "overview") {
        add("Embudo resumido", buildFunnelRows(asRecordArray(dashboardData?.funnelData), "Embudo resumido").map(({ Sección, ...row }) => row));
        add("Leads por canal", buildDimensionRows(conversations, inboxMap, tagSettings, "Canal", (conversation, map) => {
            const inbox = conversation.inbox_id ? map.get(Number(conversation.inbox_id)) : undefined;
            return getLeadChannelName(conversation, inbox);
        }));
        add("Detalle comercial por campaña", buildDimensionRows(conversations, inboxMap, tagSettings, "Campaña", getCampaignValue));
        return addRows;
    }

    if (tabId === "funnel") {
        add("Embudo actual", buildFunnelRows(asRecordArray(dashboardData?.funnelData), "Embudo actual").map(({ Sección, ...row }) => row));
        add("Embudo histórico", buildFunnelRows(asRecordArray(dashboardData?.historicalFunnelData), "Embudo histórico").map(({ Sección, ...row }) => row));
        add("Conversión entre etapas", buildFunnelConversionRows(asRecordArray(dashboardData?.funnelData)));
        add("Distribución por etapa", buildStageRows(conversations));
        add("Pérdidas y descalificación", buildNamedValueRows(asRecordArray(dashboardData?.disqualificationReasons || trends.disqualificationStats), "Motivo", "Leads"));
        return addRows;
    }

    if (tabId === "operational") {
        add("Carga por responsable", buildDimensionRows(conversations, inboxMap, tagSettings, "Responsable", getResponsibleValue));
        add("Carga por canal", buildDimensionRows(conversations, inboxMap, tagSettings, "Canal", (conversation, map) => {
            const inbox = conversation.inbox_id ? map.get(Number(conversation.inbox_id)) : undefined;
            return getLeadChannelName(conversation, inbox);
        }));
        add("Estados operativos", buildStatusRows(conversations));
        add("Origen de datos", buildSourceRows(conversations));
        return addRows;
    }

    if (tabId === "followup") {
        // Simple filter for sales in the context of this report
        const saleConversations = conversations.filter(c => getConversationRevenue(c, tagSettings) > 0);
        add("Colas por etapa", buildStageRows(conversations));
        add("Ventas por canal", buildDimensionRows(saleConversations, inboxMap, tagSettings, "Canal", (conversation, map) => {
            const inbox = conversation.inbox_id ? map.get(Number(conversation.inbox_id)) : undefined;
            return getLeadChannelName(conversation, inbox);
        }));
        add("Ventas por día", buildNamedValueRows(asRecordArray(asRecord(dashboardData?.humanMetrics).salesByDate), "Fecha", "Ventas", "date", "sales"));
        add("Detalle por responsable", buildDimensionRows(conversations, inboxMap, tagSettings, "Responsable", getResponsibleValue));
        return addRows;
    }

    if (tabId === "performance") {
        add("Ranking por responsable", getOwnerPerformanceRows(dashboardData).map((owner) => ({
            Responsable: owner.name || "Sin responsable",
            Leads: owner.leads || 0,
            Citas: owner.appointments || 0,
            "Sin respuesta": owner.unanswered || 0,
            Conversión: formatPercentValue(owner.winRate || 0),
            Origen: owner.source || "",
        })));
        add("Detalle por responsable", buildDimensionRows(conversations, inboxMap, tagSettings, "Responsable", getResponsibleValue));
        return addRows;
    }

    if (tabId === "trends") {
        add("Leads por canal", buildNamedValueRows(asRecordArray(trends.channelLeads || dashboardData?.channelData), "Canal", "Leads"));
        add("Campañas", buildNamedValueRows(asRecordArray(dashboardData?.campaignData || trends.campaignList), "Campaña", "Leads", "name", "leads"));
        add("Ingresos por periodo", buildNamedValueRows(asRecordArray(trends.revenuePeaks || trends.revenuePeakDays), "Periodo", "Monto", "date", "value"));
        add("Calidad por canal", buildDimensionRows(conversations, inboxMap, tagSettings, "Canal", (conversation, map) => {
            const inbox = conversation.inbox_id ? map.get(Number(conversation.inbox_id)) : undefined;
            return getLeadChannelName(conversation, inbox);
        }));
        return addRows;
    }

    if (tabId === "scoring") {
        const qualityItems = conversations.map((conversation) => ({ score: getScoreNumber(conversation, tagSettings) }));
        add("Rangos usados", buildQualityConfigRows(qualityItems, tagSettings));
        add("Distribución de calidad", buildQualityDistributionRows(qualityItems, tagSettings));
        add("Promedio por canal", buildDimensionRows(conversations, inboxMap, tagSettings, "Canal", (conversation, map) => {
            const inbox = conversation.inbox_id ? map.get(Number(conversation.inbox_id)) : undefined;
            return getLeadChannelName(conversation, inbox);
        }));
        add("Promedio por campaña", buildDimensionRows(conversations, inboxMap, tagSettings, "Campaña", getCampaignValue));
        add("Promedio por estado", buildDimensionRows(conversations, inboxMap, tagSettings, "Estado", (conversation) => formatConversationStatus(conversation.status)));
        return addRows;
    }

    add("Estados de conversación", buildStatusRows(conversations));
    add("Canales", buildDimensionRows(conversations, inboxMap, tagSettings, "Canal", (conversation, map) => {
        const inbox = conversation.inbox_id ? map.get(Number(conversation.inbox_id)) : undefined;
        return getLeadChannelName(conversation, inbox);
    }));
    add("Etiquetas", buildLabelRows(conversations));
    add("Origen de datos", buildSourceRows(conversations));
    return addRows;
};

const getSheetNameForSection = (tabId: ReportTabId, baseName: string, isSingleTab: boolean) =>
    isSingleTab ? baseName : `${REPORT_TAB_LABELS[tabId]} ${baseName}`;

export const buildTabReportSections = (
    input: DashboardReportInput,
    tabId: ReportTabId,
    filteredConversations: ResolvedConversation[],
    inboxMap: InboxMap,
): ReportSection[] => {
    const tabLabel = REPORT_TAB_LABELS[tabId];
    const isSingleTab = input.tabIds.length === 1;
    const auditEvents = input.commercialAuditEvents || [];
    const auditRows = buildCommercialAuditRows(filteredConversations, auditEvents, input.tagSettings);
    const detailRows = tabId === "scoring"
        ? buildScoringRows(filteredConversations, inboxMap, input.tagSettings)
        : buildConversationRows(tabId, filteredConversations, inboxMap, input.tagSettings);

    const sections: ReportSection[] = [
        {
            title: `${tabLabel} - 00 Resumen`,
            sheetName: getSheetNameForSection(tabId, "00 Resumen", isSingleTab),
            kind: "summary",
            description: "Contexto del reporte, filtros aplicados, fecha de generación y notas de lectura.",
            rows: ensureReportRows(buildSummaryRows(input, tabId, filteredConversations)),
        },
        {
            title: `${tabLabel} - 01 KPIs`,
            sheetName: getSheetNameForSection(tabId, "01 KPIs", isSingleTab),
            kind: "kpi",
            description: "Métricas principales con fórmula e interpretación para lectura gerencial.",
            rows: ensureReportRows(buildKpiRows(tabId, filteredConversations, inboxMap, input.dashboardData, input.tagSettings)),
        },
        {
            title: `${tabLabel} - 02 Analisis`,
            sheetName: getSheetNameForSection(tabId, "02 Analisis", isSingleTab),
            kind: "analysis",
            description: "Cortes por canal, campaña, etapa, responsable, estado o calidad según la pestaña.",
            rows: ensureReportRows(buildAnalysisRows(tabId, filteredConversations, inboxMap, input.dashboardData, input.tagSettings)),
        },
    ];

    if (auditRows.length > 0) {
        sections.push({
            title: `${tabLabel} - 03 Cambios relevantes`,
            sheetName: getSheetNameForSection(tabId, "03 Cambios relevantes", isSingleTab),
            kind: "analysis",
            description: "Cambios comerciales importantes que ayudan a entender ventas y montos del reporte.",
            rows: auditRows,
        });
    }

    sections.push(
        {
            title: `${tabLabel} - 99 Detalle`,
            sheetName: getSheetNameForSection(tabId, "99 Detalle", isSingleTab),
            kind: "detail",
            description: "Filas completas listas para filtrar, revisar o cruzar con otras fuentes.",
            rows: ensureReportRows(detailRows, "No hay leads en el detalle con los filtros actuales."),
        },
    );

    return sections;
};

export const buildDashboardReportSections = (input: DashboardReportInput): ReportSection[] => {
    const filteredConversations = filterReportConversations(input.conversations, input.globalFilters);
    const inboxMap = getInboxMap(input.inboxes);

    return input.tabIds.flatMap((tabId) =>
        buildTabReportSections(input, tabId, filteredConversations, inboxMap)
    );
};
