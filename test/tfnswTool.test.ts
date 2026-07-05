import assert from "node:assert/strict";
import { before, beforeEach, describe, it, mock } from "node:test";

const mockFetchTfnswAlerts = mock.fn(async () => [] as unknown[]);
mock.module("../src/services/tfnsw.js", {
	exports: { fetchTfnswAlerts: mockFetchTfnswAlerts },
});

const mockGetUserTransitLines = mock.fn(async () => [] as string[]);
mock.module("../src/tools/transitLinesMemory.js", {
	exports: { getUserTransitLines: mockGetUserTransitLines },
});

const mockWriteLog = mock.fn();
mock.module("../src/utils/logger.js", {
	exports: { writeLog: mockWriteLog },
});

describe("tfnswTool (get_transit_disruptions)", () => {
	let getTransitDisruptionsTool: any;

	before(async () => {
		({ getTransitDisruptionsTool } = await import("../src/tools/tfnswTool.js"));
	});

	beforeEach(() => {
		mockFetchTfnswAlerts.mock.resetCalls();
		mockGetUserTransitLines.mock.resetCalls();
		mockWriteLog.mock.resetCalls();
	});

	const config = { tfnswApiKey: "tfnsw-key" };

	function withLinesAndAlerts(lines: string[], alerts: unknown[]) {
		mockGetUserTransitLines.mock.mockImplementationOnce(async () => lines);
		mockFetchTfnswAlerts.mock.mockImplementationOnce(async () => alerts);
	}

	async function run() {
		const tool = getTransitDisruptionsTool(config);
		return tool.invoke({}, JSON.stringify({}));
	}

	it("fetches all-mode alerts via the tfnsw service with the agent config", async () => {
		withLinesAndAlerts(["T8"], []);

		await run();

		assert.equal(mockFetchTfnswAlerts.mock.calls.length, 1);
		assert.deepEqual(mockFetchTfnswAlerts.mock.calls[0].arguments, [
			config,
			"all",
		]);
	});

	it("returns preferred lines, filtered alerts, and matched preferences", async () => {
		withLinesAndAlerts(
			["T8"],
			[
				{ title: "T8 Line Delay", description: "Trackwork on T8" },
				{ title: "T2 Line Delay", description: "Signal fault on T2" },
			],
		);

		const result = await run();

		assert.deepEqual(result.preferred_lines, ["T8"]);
		assert.equal(result.relevant_alerts.length, 1);
		assert.equal(result.relevant_alerts[0].title, "T8 Line Delay");
		assert.deepEqual(result.matched_preferences, ["T8"]);
	});

	it("returns no relevant alerts when the user has no saved lines", async () => {
		withLinesAndAlerts(
			[],
			[{ title: "T8 Line Delay", description: "Trackwork on T8" }],
		);

		const result = await run();

		assert.deepEqual(result.preferred_lines, []);
		assert.deepEqual(result.relevant_alerts, []);
		assert.deepEqual(result.matched_preferences, []);
	});

	it("matches multiple preferred lines across all-mode alert text", async () => {
		withLinesAndAlerts(
			["T4", "AIRPORT"],
			[
				{ title: "T4 delay", description: "Trackwork" },
				{ title: "Airport Line closure", description: "Maintenance" },
				{ title: "T3 delay", description: "Unrelated" },
			],
		);

		const result = await run();

		assert.equal(result.relevant_alerts.length, 2);
		assert.deepEqual(result.matched_preferences.sort(), ["AIRPORT", "T4"]);
	});

	it("silently ignores unknown/malformed line codes without crashing", async () => {
		withLinesAndAlerts(
			["NOT_A_REAL_LINE", "T8"],
			[{ title: "T8 Line Delay", description: "Trackwork on T8" }],
		);

		const result = await run();

		assert.equal(result.relevant_alerts.length, 1);
		assert.deepEqual(result.matched_preferences, ["T8"]);
	});

	it("does not false-positive match T1 inside unrelated alert text", async () => {
		// The naive substring matcher this replaced would have wrongly matched
		// "t1" inside "t19"; transitLines.ts uses word-boundary matching.
		withLinesAndAlerts(
			["T1"],
			[
				{
					title: "Replacement bus T19 diverted via Anzac Parade",
					description: "Diversion in effect",
				},
			],
		);

		const result = await run();

		assert.deepEqual(result.relevant_alerts, []);
		assert.deepEqual(result.matched_preferences, []);
	});

	it("surfaces an error message when the alerts fetch fails", async () => {
		mockGetUserTransitLines.mock.mockImplementationOnce(async () => ["T8"]);
		mockFetchTfnswAlerts.mock.mockImplementationOnce(async () => {
			throw new Error("TfNSW tool failed: 503");
		});

		// FunctionTool.invoke swallows execute() errors via the SDK's default
		// tool error function, resolving with a description instead of
		// rejecting — so we assert on the resolved string, not a rejection.
		const result = await run();
		assert.match(result, /TfNSW tool failed: 503/);
	});
});
