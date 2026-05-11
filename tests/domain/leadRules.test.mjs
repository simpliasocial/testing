import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const {
    bucketFromScore,
    getLabelDelta,
    normalizeScoreThresholds,
    parseAmount,
    resolveLeadChannel,
    resolveLeadStage,
} = jiti("../../src/domain/lead/index.ts");

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

test("parseAmount normalizes common currency inputs", () => {
    assert.equal(parseAmount("$1,250.50"), 1250.5);
    assert.equal(parseAmount("1250,50"), 1250.5);
    assert.equal(parseAmount("sin monto"), 0);
});

test("resolveLeadStage prioritizes sale over other stages", () => {
    const tags = {
        sqlTags: ["interesado"],
        appointmentTags: ["cita_agendada"],
        saleTags: ["venta_exitosa"],
    };

    assert.equal(resolveLeadStage({ labels: ["interesado", "cita_agendada", "venta_exitosa"] }, tags), "sale");
    assert.equal(resolveLeadStage({ labels: ["interesado"] }, tags), "sql");
});

test("resolveLeadChannel uses inbox and lead hints", () => {
    assert.equal(resolveLeadChannel({ custom_attributes: { canal: "whatsapp" } }, null), "WhatsApp");
    assert.equal(resolveLeadChannel({}, { id: 1, channel_type: "Channel::FacebookPage" }), "Facebook");
});

test("score thresholds keep hot above warm", () => {
    assert.deepEqual(normalizeScoreThresholds({ hotMin: 10, warmMin: 20 }), { hotMin: 70, warmMin: 45 });
    assert.equal(bucketFromScore(80, { hotMin: 70, warmMin: 45 }), "hot");
    assert.equal(bucketFromScore(null, { hotMin: 70, warmMin: 45 }), "cold");
});

test("label delta normalizes duplicates before comparing", () => {
    assert.deepEqual(getLabelDelta(["venta", "venta", " agenda "], ["agenda", "caliente"]), {
        previous: ["agenda", "venta"],
        next: ["agenda", "caliente"],
        added: ["caliente"],
        removed: ["venta"],
    });
});
