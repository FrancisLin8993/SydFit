import assert from "node:assert/strict";
import test from "node:test";

import { describeWeatherCode } from "../src/weatherCodes.js";

test("describeWeatherCode returns known weather descriptions", () => {
	assert.equal(describeWeatherCode(0), "Clear sky");
	assert.equal(describeWeatherCode(63), "Moderate rain");
});

test("describeWeatherCode falls back for unknown codes", () => {
	assert.equal(describeWeatherCode(12345), "Weather code 12345");
});
