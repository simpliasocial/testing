import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const {
    canAccessCriticalReportProfile,
    canConfigureReportContext,
    getVisibleTabs,
    isAdmin,
} = jiti("../../src/domain/auth/permissions.ts");

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

test("company and platform admins can configure report context", () => {
    assert.equal(isAdmin("platform_admin"), true);
    assert.equal(isAdmin("company_admin"), false);
    assert.equal(canConfigureReportContext("platform_admin"), true);
    assert.equal(canConfigureReportContext("company_admin"), true);
    assert.equal(canConfigureReportContext("operator"), false);
});

test("operator sees reporting tab but only daily operations profile", () => {
    assert.deepEqual(getVisibleTabs("operator"), ["followup", "performance", "reporting"]);
    assert.equal(canAccessCriticalReportProfile("operator", "daily_operations"), true);
    assert.equal(canAccessCriticalReportProfile("operator", "management"), false);
    assert.equal(canAccessCriticalReportProfile("operator", "team_performance"), false);
    assert.equal(canAccessCriticalReportProfile("operator", "marketing_quality"), false);
});

test("admins can access every critical report profile", () => {
    ["management", "daily_operations", "team_performance", "marketing_quality"].forEach((profileKey) => {
        assert.equal(canAccessCriticalReportProfile("platform_admin", profileKey), true);
        assert.equal(canAccessCriticalReportProfile("company_admin", profileKey), true);
    });
});
