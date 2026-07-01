import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";

class MockAgent {
	constructor(options) {
		Object.assign(this, options);
	}
}
mock.module("@openai/agents", {
	exports: { Agent: MockAgent },
});

const mockGetUserTransitLinesTool = mock.fn((config) => ({
	name: "get_user_transit_lines",
	config,
}));
mock.module("../src/tools/transitLinesMemoryTool.js", {
	exports: { getUserTransitLinesTool: mockGetUserTransitLinesTool },
});

const mockGetTfnswAlertsTool = mock.fn((config) => ({
	name: "get_tfnsw_alerts",
	config,
}));
mock.module("../src/tools/tfnswTool.js", {
	exports: { getTfnswAlertsTool: mockGetTfnswAlertsTool },
});

mock.module("../src/tools/filterAlertsTool.js", {
	exports: { filterAlertsTool: { name: "filter_relevant_alerts" } },
});

describe("trafficAgent factory", () => {
	let trafficAgent: any;

	before(async () => {
		({ trafficAgent } = await import("../src/agents/trafficAgent.js"));
	});

	it("builds a sydney-traffic-agent with transit-lines, alerts, and filter tools", () => {
		const config = { mcpServerUrl: "https://mcp.test" };
		const agent = trafficAgent(config);

		assert.ok(agent instanceof MockAgent);
		assert.equal(agent.name, "sydney-traffic-agent");
		assert.match(agent.instructions, /Sydney public transport assistant/);
		assert.deepEqual(
			agent.tools.map((t) => t.name),
			["get_user_transit_lines", "get_tfnsw_alerts", "filter_relevant_alerts"],
		);
		// Regression guard: without a forced tool choice, a vague/short input
		// (e.g. "Alert") can lead the model to answer directly instead of
		// checking transit preferences or alerts first — see trafficAgent.ts.
		assert.equal(agent.modelSettings?.toolChoice, "required");
	});

	it("threads config through to the transit-lines and alerts tool factories", () => {
		const config = { mcpServerUrl: "https://another.test" };
		trafficAgent(config);

		assert.equal(
			mockGetUserTransitLinesTool.mock.calls.at(-1).arguments[0],
			config,
		);
		assert.equal(mockGetTfnswAlertsTool.mock.calls.at(-1).arguments[0], config);
	});
});
