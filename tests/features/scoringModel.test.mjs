import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const {
    buildScoreAttributeOptions,
    extractLeadLabels,
    parseDate,
    percent,
    resolveLeadCampaign,
    scoreAverage,
    unique,
} = jiti("../../src/features/scoring/model/leadScoringModel.ts");

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

test("unique trims, deduplicates and sorts values", () => {
    assert.deepEqual(unique([" tibio ", "caliente", "tibio", ""]), ["caliente", "tibio"]);
});

test("parseDate accepts unix seconds, milliseconds and invalid values", () => {
    assert.equal(parseDate(1778400000).toISOString(), "2026-05-10T08:00:00.000Z");
    assert.equal(parseDate(1778400000000).toISOString(), "2026-05-10T08:00:00.000Z");
    assert.equal(parseDate("not-a-date").getTime(), 0);
});

test("buildScoreAttributeOptions keeps numeric fields and prioritizes score_interes", () => {
    const options = buildScoreAttributeOptions([
        {
            attribute_key: "monto_operacion",
            attribute_display_name: "Monto operación",
            attribute_display_type: "number",
        },
        {
            attribute_key: "nombre",
            attribute_display_name: "Nombre",
            attribute_display_type: "text",
        },
        {
            attribute_key: "score_interes",
            attribute_display_name: "Score interés",
            attribute_display_type: "decimal",
            attribute_description: "Puntaje del lead",
        },
    ]);

    assert.deepEqual(options.map((option) => option.key), ["score_interes", "monto_operacion"]);
    assert.equal(options[0].description, "Puntaje del lead");
});

test("extractLeadLabels merges resolved and raw labels", () => {
    assert.deepEqual(extractLeadLabels({
        resolvedLabels: ["caliente", "seguimiento"],
        labels: ["seguimiento", "nuevo"],
    }), ["caliente", "nuevo", "seguimiento"]);
});

test("resolveLeadCampaign uses known campaign attrs and falls back clearly", () => {
    assert.equal(resolveLeadCampaign({ resolvedAttrs: { campana: "Meta Mayo" } }), "Meta Mayo");
    assert.equal(resolveLeadCampaign({ resolvedAttrs: {} }), "Sin campaña");
});

test("scoreAverage and percent handle empty totals", () => {
    assert.equal(scoreAverage([{ score: 10 }, { score: null }, { score: 25 }]), 11.7);
    assert.equal(scoreAverage([]), 0);
    assert.equal(percent(2, 3), 67);
    assert.equal(percent(1, 0), 0);
});
