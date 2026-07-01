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

describe("tfnswTool (get_tfnsw_alerts)", () => {
	let getTfnswAlertsTool;
	const originalFetch = global.fetch;

	before(async () => {
		({ getTfnswAlertsTool } = await import("../src/tools/tfnswTool.js"));
	});

	beforeEach(() => {
		mockGetGcpAuthHeaders.mock.resetCalls();
		mockWriteLog.mock.resetCalls();
	});

	after(() => {
		global.fetch = originalFetch;
	});

	it("posts to the MCP alerts endpoint and returns parsed JSON", async () => {
		let capturedRequest;
		global.fetch = mock.fn(async (url, options) => {
			capturedRequest = { url, options };
			return {
				ok: true,
				json: async () => ({ mode: "train", alerts: [] }),
			};
		});

		const tool = getTfnswAlertsTool({
			mcpServerUrl: "https://mcp.test",
			mcpAccessToken: "mcp-token",
		});

		const result = await tool.invoke({}, JSON.stringify({ mode: "train" }));

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
		assert.deepEqual(result, { mode: "train", alerts: [] });
	});

	it("surfaces an error message when the MCP server responds with a non-ok status", async () => {
		global.fetch = mock.fn(async () => ({ ok: false, status: 503 }));

		const tool = getTfnswAlertsTool({
			mcpServerUrl: "https://mcp.test",
			mcpAccessToken: "mcp-token",
		});

		// FunctionTool.invoke swallows execute() errors via the SDK's default
		// tool error function, resolving with a description instead of
		// rejecting — so we assert on the resolved string, not a rejection.
		const result = await tool.invoke({}, JSON.stringify({ mode: "bus" }));
		assert.match(result, /TfNSW tool failed: 503/);
	});

	it("rejects an unsupported transport mode via zod validation", async () => {
		global.fetch = mock.fn(async () => ({
			ok: true,
			json: async () => ({}),
		}));

		const tool = getTfnswAlertsTool({
			mcpServerUrl: "https://mcp.test",
			mcpAccessToken: "mcp-token",
		});

		const result = await tool.invoke({}, JSON.stringify({ mode: "monorail" }));
		assert.match(result, /error occurred while running the tool/i);
	});
});
