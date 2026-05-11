import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const {
    buildFunnelConversionRows,
    buildFunnelRows,
    buildLabelRows,
    buildNamedValueRows,
    buildQualityConfigRows,
    buildQualityDistributionRows,
    buildSalesSummaryRows,
    buildSourceRows,
    buildStageRows,
    buildStatusRows,
    endOfLocalDay,
    ensureReportRows,
    filterReportConversations,
    formatCurrencyValue,
    formatConversationStatus,
    formatDataOrigin,
    formatDuration,
    formatLeadStage,
    formatPercentValue,
    getReportConversationLabels,
    normalizeCell,
    numberCell,
    parseTimestampMs,
    rowsFromArray,
    safeDivision,
    safeFilePart,
    safeSheetName,
    startOfLocalDay,
    withSection,
} = jiti("../../src/features/reporting/model/reportExportModel.ts");

const test = (name, fn) => {
    try {
        fn();
        console.log(`ok - ${name}`);
    } catch (error) {
        console.error(`not ok - ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
};

test("safe report names normalize invalid spreadsheet and filename characters", () => {
    assert.equal(safeSheetName("Reporte/Ventas?[Mayo]:2026"), "Reporte Ventas  Mayo  2026");
    assert.equal(safeSheetName(""), "Reporte");
    assert.equal(safeSheetName("12345678901234567890123456789012345").length, 31);
    assert.equal(safeFilePart("Reporte Ventas Éxitosas 2026"), "reporte_ventas_exitosas_2026");
    assert.equal(safeFilePart(""), "reporte");
});

test("parseTimestampMs supports seconds, milliseconds and invalid input", () => {
    assert.equal(parseTimestampMs(1778400000), 1778400000000);
    assert.equal(parseTimestampMs(1778400000000), 1778400000000);
    assert.equal(parseTimestampMs("not-a-date"), 0);
});

test("filterReportConversations applies inbox and full-day date filters", () => {
    const rows = filterReportConversations([
        { id: 1, inbox_id: 10, created_at: new Date("2026-05-07T12:00:00").getTime() },
        { id: 2, inbox_id: 10, created_at: new Date("2026-05-08T12:00:00").getTime() },
        { id: 3, inbox_id: 11, created_at: new Date("2026-05-08T12:00:00").getTime() },
        { id: 4, inbox_id: 10, created_at: new Date("2026-05-09T12:00:00").getTime() },
    ], {
        startDate: new Date("2026-05-08T12:00:00"),
        endDate: new Date("2026-05-08T12:00:00"),
        selectedInboxes: [10],
    });

    assert.deepEqual(rows.map((row) => row.id), [2]);
});

test("local day helpers preserve the date and normalize boundaries", () => {
    const start = startOfLocalDay(new Date("2026-05-07T16:30:00"));
    const end = endOfLocalDay(new Date("2026-05-07T16:30:00"));

    assert.equal(start.getHours(), 0);
    assert.equal(start.getMinutes(), 0);
    assert.equal(end.getHours(), 23);
    assert.equal(end.getMinutes(), 59);
});

test("normalizeCell and numberCell keep exports stable", () => {
    assert.equal(normalizeCell(["a", null, "b"]), "a, b");
    assert.equal(normalizeCell({ ok: true }), '{"ok":true}');
    assert.equal(numberCell("42.5"), 42.5);
    assert.equal(numberCell("bad"), 0);
});

test("rowsFromArray normalizes dashboard arrays for report tables", () => {
    assert.deepEqual(rowsFromArray([
        { label: "venta_exitosa", count: 3, percentage: 60 },
        { name: "Instagram", leads: 2, winRate: 50 },
    ], "label", "value"), [
        { Nombre: "Venta exitosa", Valor: 3, Porcentaje: 60 },
        { Nombre: "Instagram", Valor: 2, Porcentaje: 50 },
    ]);
});

test("stage and label helpers prepare conversation distributions", () => {
    const conversations = [
        { status: "open", source: "api", resolvedStage: "sale", resolvedLabels: ["venta_exitosa", "instagram"] },
        { status: "resolved", source: "supabase", resolvedStage: "appointment", labels: ["cita_agendada"] },
        { status: "open", source: "cache", resolvedStage: "", labels: ["instagram"] },
    ];

    assert.equal(formatLeadStage("sale"), "Venta exitosa");
    assert.equal(formatLeadStage("custom_stage"), "custom_stage");
    assert.deepEqual(getReportConversationLabels(conversations[0]), ["venta_exitosa", "instagram"]);
    assert.deepEqual(buildStatusRows(conversations), [
        { Estado: "Abierto", Leads: 2 },
        { Estado: "Resuelto", Leads: 1 },
    ]);
    assert.deepEqual(buildStageRows(conversations), [
        { Etapa: "Venta exitosa", Leads: 1 },
        { Etapa: "Cita agendada", Leads: 1 },
        { Etapa: "Otro", Leads: 1 },
    ]);
    assert.deepEqual(buildLabelRows(conversations), [
        { Etiqueta: "Instagram", Leads: 2 },
        { Etiqueta: "Venta exitosa", Leads: 1 },
        { Etiqueta: "Cita agendada", Leads: 1 },
    ]);
    assert.deepEqual(buildSourceRows(conversations), [
        { Origen: "Datos recientes", Leads: 1 },
        { Origen: "Historial disponible", Leads: 1 },
        { Origen: "Información guardada", Leads: 1 },
    ]);
});

test("empty report helpers add readable placeholders and section labels", () => {
    assert.deepEqual(ensureReportRows([]), [{
        Estado: "Sin datos",
        Detalle: "Sin datos con los filtros actuales",
    }]);
    assert.deepEqual(withSection("KPIs", []), [{
        Sección: "KPIs",
        Estado: "Sin datos",
        Detalle: "Sin datos para KPIs",
    }]);
});

test("safeDivision avoids invalid ratios", () => {
    assert.equal(safeDivision(5, 10), 0.5);
    assert.equal(safeDivision(5, 0), 0);
});

test("report value formatters normalize currency, percentages and durations", () => {
    assert.equal(formatCurrencyValue("1234.5"), "$1.234,50");
    assert.equal(formatPercentValue(0.25), "25%");
    assert.equal(formatPercentValue(12.5), "12,5%");
    assert.equal(formatDuration(3665), "1h 1m");
});

test("funnel and named rows prepare dashboard arrays for export sections", () => {
    assert.deepEqual(buildFunnelRows([
        { label: "lead", value: 10, percentage: 100 },
        { label: "cita_agendada", value: 4, percentage: 40 },
    ], "Embudo"), [
        { Sección: "Embudo", Orden: 1, Etapa: "Lead", Leads: 10, Porcentaje: "100%" },
        { Sección: "Embudo", Orden: 2, Etapa: "Cita agendada", Leads: 4, Porcentaje: "40%" },
    ]);

    assert.deepEqual(buildFunnelConversionRows([
        { label: "lead", value: 10 },
        { label: "venta_exitosa", value: 2 },
    ]), [{
        Desde: "Lead",
        Hacia: "Venta exitosa",
        "Base anterior": 10,
        Resultado: 2,
        Conversión: "20%",
    }]);

    assert.deepEqual(buildNamedValueRows([
        { name: "Instagram", leads: 5, winRate: 0.2 },
    ], "Canal", "Leads", "name", "leads"), [{
        Canal: "Instagram",
        Leads: 5,
        Porcentaje: "20%",
    }]);
});

test("sales summaries group by channel and month with the numeric amount column", () => {
    const summary = buildSalesSummaryRows([
        { Canal: "Instagram", "Monto numérico": 100, "Fecha en que se registró el monto": "2026-05-07" },
        { Canal: "Instagram", "Monto numérico": "25.5", "Fecha en que se registró el monto": "2026-05-08" },
        { Canal: "", "Monto numérico": 50, "Fecha en que se registró el monto": "" },
    ]);

    assert.equal(summary.salesTotal, 175.5);
    assert.deepEqual(summary.byChannel, [
        { Canal: "Instagram", Ventas: 2, Monto: 125.5 },
        { Canal: "Otro", Ventas: 1, Monto: 50 },
    ]);
    assert.deepEqual(summary.byMonth, [
        { Periodo: "2026-05", Ventas: 2, Monto: 125.5 },
        { Periodo: "Sin fecha", Ventas: 1, Monto: 50 },
    ]);
});

test("quality rows classify scores with configured thresholds", () => {
    const qualityItems = [
        { score: 90 },
        { score: 60 },
        { score: 20 },
        { score: null },
    ];
    const config = {
        scoreAttributeKey: "score_interes",
        scoreThresholds: { hotMin: 80, warmMin: 50 },
    };

    assert.deepEqual(buildQualityDistributionRows(qualityItems, config), [
        { Nivel: "Caliente", Rango: "Desde 80", Leads: 1, Porcentaje: "25%", "Sin puntaje incluidos": "" },
        { Nivel: "Tibio", Rango: "Desde 50 y antes de 80", Leads: 1, Porcentaje: "25%", "Sin puntaje incluidos": "" },
        { Nivel: "Frío", Rango: "Menor a 50 o sin puntaje", Leads: 2, Porcentaje: "50%", "Sin puntaje incluidos": 1 },
    ]);
    assert.deepEqual(buildQualityConfigRows(qualityItems, config), [
        { Metrica: "Campo de puntaje usado", Valor: "score_interes" },
        { Metrica: "Total encontrados", Valor: 4 },
        { Metrica: "Sin puntaje incluidos en Frío", Valor: 1 },
        { Metrica: "Desde Caliente", Valor: 80 },
        { Metrica: "Desde Tibio", Valor: 50 },
        { Metrica: "Rangos usados", Valor: "Caliente: Desde 80 | Tibio: Desde 50 y antes de 80 | Frío: Menor a 50 o sin puntaje" },
    ]);
});

test("status and data origin use dashboard-facing labels", () => {
    assert.equal(formatConversationStatus("open"), "Abierto");
    assert.equal(formatConversationStatus("resolved"), "Resuelto");
    assert.equal(formatDataOrigin("api"), "Datos recientes");
    assert.equal(formatDataOrigin("supabase"), "Historial disponible");
});
