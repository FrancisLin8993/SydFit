import assert from "node:assert/strict";
import test from "node:test";

import { filterAlertsTool } from "../src/tools/filterAlertsTool.js";

async function run(input) {
	return filterAlertsTool.invoke({}, JSON.stringify(input));
}

test("filterAlertsTool keeps only alerts matching preferred lines", async () => {
	const result = await run({
		memories: "User takes the T8 train from Central",
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

	assert.deepEqual(result.matched_preferences, ["t8"]);
	assert.equal(result.relevant_alerts.length, 1);
	assert.equal(result.relevant_alerts[0].mode, "train");
	assert.equal(result.relevant_alerts[0].alerts.length, 1);
	assert.equal(result.relevant_alerts[0].alerts[0].title, "T8 Line Delay");
});

test("filterAlertsTool drops modes with no relevant alerts", async () => {
	const result = await run({
		memories: "User takes T1 only",
		alertsByMode: [
			{
				mode: "lightrail",
				alerts: [{ title: "L1 delay", description: "Track issue" }],
			},
		],
	});

	assert.deepEqual(result.relevant_alerts, []);
	assert.deepEqual(result.matched_preferences, ["t1"]);
});

test("filterAlertsTool extracts multiple lines and the airport keyword", async () => {
	const result = await run({
		memories: "User commutes on T4 and the Airport line",
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

	assert.deepEqual(result.matched_preferences, ["t4", "airport"]);
	assert.equal(result.relevant_alerts[0].alerts.length, 2);
});

test("filterAlertsTool returns no matched preferences when memory has no known lines", async () => {
	const result = await run({
		memories: "User walks to work",
		alertsByMode: [
			{ mode: "bus", alerts: [{ title: "Bus delay", description: "traffic" }] },
		],
	});

	assert.deepEqual(result.matched_preferences, []);
	assert.deepEqual(result.relevant_alerts, []);
});
