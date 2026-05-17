import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const {
    CRITICAL_REPORT_PROFILES,
    resolveCriticalProfile,
} = jiti("../../src/features/reporting/domain/reportCatalog.ts");

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

test("critical report catalog has requested names, formats and prompt files", () => {
    assert.deepEqual(CRITICAL_REPORT_PROFILES.management, {
        key: "management",
        label: "Reporte Gerencial",
        description: "Vista ejecutiva para gerencia con KPIs, embudo y tendencia comercial.",
        tabIds: ["overview", "funnel", "performance", "trends"],
        fileFormats: ["pdf"],
        formatLabel: "PDF",
        promptFileName: "archive/promt gerencial.txt",
        isActive: true,
    });
    assert.deepEqual(CRITICAL_REPORT_PROFILES.daily_operations.fileFormats, ["excel", "csv"]);
    assert.equal(CRITICAL_REPORT_PROFILES.daily_operations.formatLabel, "Excel + CSV");
    assert.equal(CRITICAL_REPORT_PROFILES.daily_operations.promptFileName, "archive/promt operacion comercial.txt");
    assert.deepEqual(CRITICAL_REPORT_PROFILES.team_performance.fileFormats, ["pdf"]);
    assert.equal(CRITICAL_REPORT_PROFILES.team_performance.promptFileName, "archive/promt rendimiento Equipo.txt");
    assert.deepEqual(CRITICAL_REPORT_PROFILES.marketing_quality.fileFormats, ["excel", "csv"]);
    assert.equal(CRITICAL_REPORT_PROFILES.marketing_quality.formatLabel, "Excel + CSV");
    assert.equal(CRITICAL_REPORT_PROFILES.marketing_quality.promptFileName, "archive/promt calidad leads.txt");
});

test("critical report profile resolution keeps fixed tabs and formats", () => {
    const resolved = resolveCriticalProfile("team_performance", {
        team_performance: {
            tabIds: ["chats"],
            fileFormats: ["excel", "csv"],
            isActive: false,
        },
    });

    assert.deepEqual(resolved.tabIds, ["operational", "performance", "followup", "funnel"]);
    assert.deepEqual(resolved.fileFormats, ["pdf"]);
    assert.equal(resolved.isActive, true);
});
