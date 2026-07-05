import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it, mock } from "node:test";

const mockGetGcpAuthHeaders = mock.fn(async () => ({
	Authorization: "Bearer test",
}));
mock.module("../src/services/gcpAuth.js", {
	exports: { getGcpAuthHeaders: mockGetGcpAuthHeaders },
});

const mockWriteLog = mock.fn();
mock.module("../src/utils/logger.js", {
	exports: { writeLog: mockWriteLog },
});

describe("tfnswTool (get_relevant_tfnsw_alerts)", () => {
	let getRelevantTfnswAlertsTool: any;
	const originalFetch = global.fetch;

	before(async () => {
		({ getRelevantTfnswAlertsTool } = await import(
			"../src/tools/tfnswTool.js"
		));
	});

	beforeEach(() => {
		mockGetGcpAuthHeaders.mock.resetCalls();
		mockWriteLog.mock.resetCalls();
	});

	after(() => {
		global.fetch = originalFetch;
	});

	async function run(config, args) {
		const tool = getRelevantTfnswAlertsTool(config);
		return tool.invoke({}, JSON.stringify(args));
	}

	it("posts to the MCP alerts endpoint with the requested mode", async () => {
		let capturedRequest: any;
		global.fetch = mock.fn(async (url, options) => {
			capturedRequest = { url, options };
			return {
				ok: true,
				json: async () => ({ mode: "train", alerts: [] }),
			};
		});

		const result = await run(
			{ mcpServerUrl: "https://mcp.test", mcpAccessToken: "mcp-token" },
			{ mode: "train", preferredLines: ["T8"] },
		);

		assert.equal(capturedRequest.url, "https://mcp.test/alerts");
		assert.equal(capturedRequest.options.method, "POST");
		assert.equal(
			capturedRequest.options.headers["X-Worker-Token"],
			"mcp-token",
		);
		assert.equal(capturedRequest.options.headers.Authorization, "Bearer test");
		assert.deepEqual(JSON.parse(capturedRequest.options.body), {
			method: "get_sydney_transport_alerts",
			arguments: { mode: "train" },
		});
		assert.deepEqual(result, {
			mode: "train",
			relevant_alerts: [],
			matched_preferences: [],
		});
	});

	it("surfaces an error message when the MCP server responds with a non-ok status", async () => {
		global.fetch = mock.fn(async () => ({ ok: false, status: 503 }));

		// FunctionTool.invoke swallows execute() errors via the SDK's default
		// tool error function, resolving with a description instead of
		// rejecting — so we assert on the resolved string, not a rejection.
		const result = await run(
			{ mcpServerUrl: "https://mcp.test", mcpAccessToken: "mcp-token" },
			{ mode: "bus", preferredLines: ["T8"] },
		);
		assert.match(result, /TfNSW tool failed: 503/);
	});

	it("rejects an unsupported transport mode via zod validation", async () => {
		global.fetch = mock.fn(async () => ({
			ok: true,
			json: async () => ({}),
		}));

		const result = await run(
			{ mcpServerUrl: "https://mcp.test", mcpAccessToken: "mcp-token" },
			{ mode: "monorail", preferredLines: ["T8"] },
		);
		assert.match(result, /error occurred while running the tool/i);
	});

	describe("filtering", () => {
		function withAlerts(alerts: unknown[]) {
			global.fetch = mock.fn(async () => ({
				ok: true,
				json: async () => ({ mode: "train", alerts }),
			}));
		}

		it("keeps only alerts matching preferred lines", async () => {
			withAlerts([
				{ title: "T8 Line Delay", description: "Trackwork on T8" },
				{ title: "T2 Line Delay", description: "Signal fault on T2" },
			]);

			const result = await run(
				{ mcpServerUrl: "https://mcp.test", mcpAccessToken: "mcp-token" },
				{ mode: "train", preferredLines: ["T8"] },
			);

			assert.equal(result.relevant_alerts.length, 1);
			assert.equal(result.relevant_alerts[0].title, "T8 Line Delay");
			assert.deepEqual(result.matched_preferences, ["T8"]);
		});

		it("returns no matches and an empty matched_preferences list when nothing hits", async () => {
			withAlerts([{ title: "L1 delay", description: "Track issue" }]);

			const result = await run(
				{ mcpServerUrl: "https://mcp.test", mcpAccessToken: "mcp-token" },
				{ mode: "lightrail", preferredLines: ["T1"] },
			);

			assert.deepEqual(result.relevant_alerts, []);
			assert.deepEqual(result.matched_preferences, []);
		});

		it("matches multiple preferred lines against alert text", async () => {
			withAlerts([
				{ title: "T4 delay", description: "Trackwork" },
				{ title: "Airport Line closure", description: "Maintenance" },
				{ title: "T3 delay", description: "Unrelated" },
			]);

			const result = await run(
				{ mcpServerUrl: "https://mcp.test", mcpAccessToken: "mcp-token" },
				{ mode: "train", preferredLines: ["T4", "AIRPORT"] },
			);

			assert.equal(result.relevant_alerts.length, 2);
			assert.deepEqual(result.matched_preferences.sort(), ["AIRPORT", "T4"]);
		});

		it("silently ignores unknown/malformed line codes without crashing", async () => {
			withAlerts([{ title: "T8 Line Delay", description: "Trackwork on T8" }]);

			const result = await run(
				{ mcpServerUrl: "https://mcp.test", mcpAccessToken: "mcp-token" },
				{ mode: "train", preferredLines: ["NOT_A_REAL_LINE", "T8"] },
			);

			assert.equal(result.relevant_alerts.length, 1);
			assert.deepEqual(result.matched_preferences, ["T8"]);
		});

		it("does not false-positive match T1 inside unrelated alert text", async () => {
			// The old naive `content.includes("t1")` matcher (before
			// transitLines.ts's word-boundary matching) would have wrongly
			// matched "t1" inside "t19" here.
			withAlerts([
				{
					title: "Replacement bus T19 diverted via Anzac Parade",
					description: "Diversion in effect",
				},
			]);

			const result = await run(
				{ mcpServerUrl: "https://mcp.test", mcpAccessToken: "mcp-token" },
				{ mode: "bus", preferredLines: ["T1"] },
			);

			assert.deepEqual(result.relevant_alerts, []);
			assert.deepEqual(result.matched_preferences, []);
		});
	});
});
