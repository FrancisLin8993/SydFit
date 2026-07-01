import assert from "node:assert/strict";
import test from "node:test";

import { filterAlertsTool } from "../src/tools/filterAlertsTool.js";

async function run(input) {
	return filterAlertsTool.invoke({}, JSON.stringify(input));
}

test("filterAlertsTool keeps only alerts matching preferred lines", async () => {
	const result = await run({
		preferredLines: ["T8"],
		alertsByMode: [
			{
				mode: "train",
				alerts: [
					{ title: "T8 Line Delay", description: "Trackwork on T8" },
					{ title: "T2 Line Delay", description: "Signal fault on T2" },
				],
			},
		],
	});

	assert.deepEqual(result.matched_preferences, ["T8"]);
	assert.equal(result.relevant_alerts.length, 1);
	assert.equal(result.relevant_alerts[0].mode, "train");
	assert.equal(result.relevant_alerts[0].alerts.length, 1);
	assert.equal(result.relevant_alerts[0].alerts[0].title, "T8 Line Delay");
});

test("filterAlertsTool drops modes with no relevant alerts and reports no matched preferences", async () => {
	const result = await run({
		preferredLines: ["T1"],
		alertsByMode: [
			{
				mode: "lightrail",
				alerts: [{ title: "L1 delay", description: "Track issue" }],
			},
		],
	});

	assert.deepEqual(result.relevant_alerts, []);
	// Unlike the old prose-mining version, matched_preferences now reflects
	// actual alert hits, not just echoed-back guesses — so an unmatched
	// preference no longer appears here.
	assert.deepEqual(result.matched_preferences, []);
});

test("filterAlertsTool matches multiple preferred lines against alert text", async () => {
	const result = await run({
		preferredLines: ["T4", "AIRPORT"],
		alertsByMode: [
			{
				mode: "train",
				alerts: [
					{ title: "T4 delay", description: "Trackwork" },
					{ title: "Airport Line closure", description: "Maintenance" },
					{ title: "T3 delay", description: "Unrelated" },
				],
			},
		],
	});

	assert.deepEqual(result.matched_preferences.sort(), ["AIRPORT", "T4"]);
	assert.equal(result.relevant_alerts[0].alerts.length, 2);
});

test("filterAlertsTool silently ignores unknown/malformed line codes without crashing", async () => {
	const result = await run({
		preferredLines: ["NOT_A_REAL_LINE", "T8"],
		alertsByMode: [
			{
				mode: "train",
				alerts: [{ title: "T8 Line Delay", description: "Trackwork on T8" }],
			},
		],
	});

	assert.deepEqual(result.matched_preferences, ["T8"]);
	assert.equal(result.relevant_alerts[0].alerts.length, 1);
});

test("filterAlertsTool returns no matches when preferredLines is empty", async () => {
	const result = await run({
		preferredLines: [],
		alertsByMode: [
			{ mode: "bus", alerts: [{ title: "Bus delay", description: "traffic" }] },
		],
	});

	assert.deepEqual(result.matched_preferences, []);
	assert.deepEqual(result.relevant_alerts, []);
});

test("filterAlertsTool does not false-positive match T1 inside unrelated alert text", async () => {
	// The old naive `content.includes("t1")` matcher would have wrongly
	// matched "t1" inside "t19" here, incorrectly flagging a T9-area bus
	// alert as relevant to a user who only prefers T1. The new word-boundary
	// matcher requires \bT1\b, which "T19" does not satisfy.
	const result = await run({
		preferredLines: ["T1"],
		alertsByMode: [
			{
				mode: "bus",
				alerts: [
					{
						title: "Replacement bus T19 diverted via Anzac Parade",
						description: "Diversion in effect",
					},
				],
			},
		],
	});

	assert.deepEqual(result.relevant_alerts, []);
	assert.deepEqual(result.matched_preferences, []);
});
