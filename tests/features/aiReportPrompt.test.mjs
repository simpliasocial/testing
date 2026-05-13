import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const {
    AI_REPORT_PROFILES,
    composeAiReportPrompt,
    openAiReportErrorMessage,
    renderAiReportFileFromOpenAiResponse,
    resolveOpenAiReportModel,
} = jiti("../../supabase/functions/_shared/ai-reporting.ts");
const { getAiReportPromptTemplate } = jiti("../../supabase/functions/_shared/ai-report-prompts.ts");

const getStoredZipFileText = (buffer, fileName) => {
    let offset = 0;
    while (offset < buffer.length - 30) {
        if (buffer.readUInt32LE(offset) !== 0x04034b50) {
            offset += 1;
            continue;
        }

        const compressedSize = buffer.readUInt32LE(offset + 18);
        const nameLength = buffer.readUInt16LE(offset + 26);
        const extraLength = buffer.readUInt16LE(offset + 28);
        const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
        const dataStart = offset + 30 + nameLength + extraLength;
        const dataEnd = dataStart + compressedSize;
        if (name === fileName) return buffer.subarray(dataStart, dataEnd).toString("utf8");
        offset = dataEnd;
    }
    throw new Error(`No se encontró ${fileName} dentro del xlsx.`);
};

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

test("AI report prompt composes base instruction, company context, TXT prompt and dataset", () => {
    const prompt = composeAiReportPrompt({
        profile: AI_REPORT_PROFILES.management,
        format: "pdf",
        companyContext: "Empresa: Simplia. Mercado: Ecuador.",
        rangeLabel: "2026-05-01_a_2026-05-31",
        dataset: { leads: 12, ventas: 3 },
    });

    assert.match(prompt, /Usa únicamente la información entregada/);
    assert.match(prompt, /Empresa: Simplia\. Mercado: Ecuador\./);
    assert.match(prompt, /Analista Comercial Senior/);
    assert.match(prompt, /2026-05-01_a_2026-05-31/);
    assert.match(prompt, /"leads": 12/);
    assert.match(prompt, /Estrategia, Embudo, Rendimiento Humano, Tendencias/);
});

test("backend prompt registry preserves TXT source structure", () => {
    assert.equal(
        getAiReportPromptTemplate("management"),
        readFileSync("archive/promt gerencial.txt", "utf8"),
    );
    assert.equal(
        getAiReportPromptTemplate("daily_operations"),
        readFileSync("archive/promt operacion comercial.txt", "utf8"),
    );
    assert.equal(
        getAiReportPromptTemplate("team_performance"),
        readFileSync("archive/promt rendimiento Equipo.txt", "utf8"),
    );
    assert.equal(
        getAiReportPromptTemplate("marketing_quality"),
        readFileSync("archive/promt calidad leads.txt", "utf8"),
    );
});

test("backend prompt registry includes required structure for every report", () => {
    assert.match(getAiReportPromptTemplate("management"), /Reporte Gerencial Comercial/);
    assert.match(getAiReportPromptTemplate("daily_operations"), /HOJA 1: Resumen Ejecutivo/);
    assert.match(getAiReportPromptTemplate("team_performance"), /FORMATO DEL REPORTE PDF/);
    assert.match(getAiReportPromptTemplate("marketing_quality"), /Diagnóstico general de calidad de leads/);
});

test("AI model resolver supports cheap default and scoped overrides", () => {
    const originalDeno = globalThis.Deno;
    try {
        globalThis.Deno = { env: { get: (key) => ({
            OPENAI_REPORT_MODEL: "gpt-5.4-nano",
            OPENAI_REPORT_MODEL_TABLE: "gpt-5.4-mini",
            OPENAI_REPORT_MODEL_DAILY_OPERATIONS_EXCEL: "gpt-5.4",
        }[key]) } };

        assert.equal(resolveOpenAiReportModel("management", "pdf"), "gpt-5.4-nano");
        assert.equal(resolveOpenAiReportModel("marketing_quality", "csv"), "gpt-5.4-mini");
        assert.equal(resolveOpenAiReportModel("daily_operations", "excel"), "gpt-5.4");
    } finally {
        globalThis.Deno = originalDeno;
    }
    if (!originalDeno) assert.equal(resolveOpenAiReportModel("management", "pdf"), "gpt-5.4-mini");
});

test("AI errors with nested objects produce readable messages", () => {
    assert.equal(
        openAiReportErrorMessage({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }),
        "OpenAI cortó la respuesta por límite de salida; el reporte se reducirá o se debe reintentar con menor rango.",
    );
    const message = openAiReportErrorMessage({ error: { code: "invalid_model", message: "Modelo no disponible" } });
    assert.equal(message, "Modelo no disponible");
    assert.notEqual(message, "[object Object]");
});

test("AI renderers create branded PDF and deterministic Excel/CSV sheets", () => {
    const longPdfTitle = "Reporte Gerencial Comercial - Implanta | período 2026-05-01_a_2026-05-31 con análisis, campaña, próxima acción, desempeño, año comercial y seguimiento extraordinariamente largo";
    const responseBody = {
        status: "completed",
        output_text: JSON.stringify({
            title: longPdfTitle,
            executiveSummary: ["La operación tiene oportunidades claras de mejora con campaña, próxima acción, desempeño y año comercial."],
            insights: [{
                title: "Seguimiento concentrado",
                evidence: "2 leads en seguimiento",
                impact: "Riesgo de demora",
                recommendation: "Priorizar contacto",
                priority: "Alta",
            }],
            risks: ["Baja calidad registrada"],
            recommendations: [{
                action: "Revisar SLA de primera respuesta",
                owner: "Supervisor comercial",
                priority: "Alta",
                rationale: "Reduce pérdida por demora",
            }],
            tables: [],
        }),
    };
    const rows = [
        {
            id: "1",
            chatwoot_conversation_id: 101,
            labels: ["interesado"],
            status: "open",
            created_at_chatwoot: "2026-05-01T12:00:00Z",
            first_reply_created_at_chatwoot: "2026-05-01T12:05:00Z",
            conversation_custom_attributes: { responsable: "Ana", campana: "Meta Mayo", score_interes: 72 },
        },
        {
            id: "2",
            chatwoot_conversation_id: 102,
            labels: ["venta_exitosa"],
            status: "open",
            monto_operacion: "900",
            created_at_chatwoot: "2026-05-02T12:00:00Z",
            waiting_since_chatwoot: "2026-05-02T12:15:00Z",
            last_non_activity_message: {
                message_direction: "incoming",
                created_at: "2026-05-02T12:15:00Z",
                content: "Hola, sigo esperando información.",
            },
            conversation_custom_attributes: { responsable: "Luis", canal: "WhatsApp", score_interes: 80 },
        },
    ];
    const longCompanyContext = "Empresa: Simplia. Industria: software comercial para control comercial. Mercado: Ecuador y Latinoamérica. ICP: equipos comerciales que necesitan seguimiento, reportes, automatización y trazabilidad completa de leads desde captación hasta cierre.";

    const pdf = renderAiReportFileFromOpenAiResponse({
        responseBody,
        profileKey: "management",
        format: "pdf",
        rangeLabel: "2026-05-01_a_2026-05-31",
        rows,
        auditEvents: [],
        companyContext: longCompanyContext,
        filters: { startDate: "2026-05-01", endDate: "2026-05-31", selectedInboxes: [1] },
    });
    const pdfText = Buffer.from(pdf.contentBase64, "base64").toString("latin1");
    assert.equal(pdfText.startsWith("%PDF-1.4"), true);
    assert.doesNotMatch(pdfText, /þÿ|FEFF/);
    assert.match(pdfText, /Implanta/);
    assert.match(pdfText, /período/);
    assert.match(pdfText, /análisis/);
    assert.match(pdfText, /campaña/);
    assert.match(pdfText, /próxima/);
    assert.match(pdfText, /desempeño/);
    assert.match(pdfText, /año/);
    assert.doesNotMatch(pdfText, new RegExp(longPdfTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(pdfText, /1\. Resumen ejecutivo/);
    assert.match(pdfText, /10\. Limitaciones del análisis/);
    assert.match(pdfText, /KPI: Leads contactados/);
    assert.match(pdfText, /KPI: Leads sin contactar/);
    assert.match(pdfText, /KPI: Tasa de contactabilidad[\s\S]{0,500}Valor: 50%/);
    assert.doesNotMatch(pdfText, /KPI: Llamadas totales/);
    assert.doesNotMatch(pdfText, /No calculable/);
    assert.doesNotMatch(pdfText, /\.\.\./);

    const excel = renderAiReportFileFromOpenAiResponse({
        responseBody,
        profileKey: "daily_operations",
        format: "excel",
        rangeLabel: "2026-05-01_a_2026-05-31",
        rows,
        auditEvents: [],
        companyContext: longCompanyContext,
        filters: { startDate: "2026-05-01", endDate: "2026-05-31", selectedInboxes: [1] },
    });
    const excelBuffer = Buffer.from(excel.contentBase64, "base64");
    const excelText = excelBuffer.toString("utf8");
    assert.equal(excel.filename.endsWith(".xlsx"), true);
    assert.equal(excel.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.equal(excelBuffer[0], 0x50);
    assert.equal(excelBuffer[1], 0x4b);
    assert.ok(excelBuffer.includes(Buffer.from("xl/workbook.xml")));
    assert.match(excelText, /00 Filtros aplicados/);
    assert.match(excelText, /00 Resumen Ejecutivo/);
    assert.match(excelText, /01 KPIs Operativos/);
    assert.match(excelText, /02 Analisis por Asesor/);
    assert.match(excelText, /08 Limitaciones Data/);
    assert.match(excelText, /99 Detalle Leads/);
    assert.doesNotMatch(excelText, /No disponible/);
    const stylesXml = getStoredZipFileText(excelBuffer, "xl/styles.xml");
    const filtersXml = getStoredZipFileText(excelBuffer, "xl/worksheets/sheet1.xml");
    const summaryXml = getStoredZipFileText(excelBuffer, "xl/worksheets/sheet2.xml");
    assert.doesNotMatch(filtersXml, /<autoFilter/);
    assert.doesNotMatch(filtersXml, /s="1"/);
    assert.match(filtersXml, /width="96"/);
    assert.match(filtersXml, /s="2"/);
    assert.match(stylesXml, /wrapText="1"/);
    assert.match(summaryXml, /<autoFilter/);

    const csv = renderAiReportFileFromOpenAiResponse({
        responseBody,
        profileKey: "marketing_quality",
        format: "csv",
        rangeLabel: "2026-05-01_a_2026-05-31",
        rows,
        auditEvents: [],
        companyContext: longCompanyContext,
        filters: { startDate: "2026-05-01", endDate: "2026-05-31", selectedInboxes: [1] },
    });
    const csvText = Buffer.from(csv.contentBase64, "base64").toString("utf8");
    assert.match(csvText, /00 Filtros aplicados/);
    assert.match(csvText, /01 Diagnostico Calidad/);
    assert.match(csvText, /04 Causas Score/);
    assert.match(csvText, /10 Limitaciones Data/);
    assert.match(csvText, /99 Detalle Leads/);
    assert.doesNotMatch(csvText, /No disponible/);
    assert.match(csvText, /Contexto empresarial aplicado 1/);
    assert.match(csvText, /Contexto empresarial aplicado 2/);
});
