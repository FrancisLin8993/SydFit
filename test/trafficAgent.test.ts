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

const mockGetPromptInstructions = mock.fn(
	async () => "You are a Sydney public transport assistant.",
);
mock.module("../src/services/langfuse.js", {
	exports: { getPromptInstructions: mockGetPromptInstructions },
});

const mockGetTransitDisruptionsTool = mock.fn((config) => ({
	name: "get_transit_disruptions",
	config,
}));
mock.module("../src/tools/tfnswTool.js", {
	exports: { getTransitDisruptionsTool: mockGetTransitDisruptionsTool },
});

describe("trafficAgent factory", () => {
	let trafficAgent: any;

	before(async () => {
		({ trafficAgent } = await import("../src/agents/trafficAgent.js"));
	});

	it("builds a sydney-traffic-agent with the merged disruptions tool", () => {
		const config = { mcpServerUrl: "https://mcp.test" };
		const agent = trafficAgent(config);

		assert.ok(agent instanceof MockAgent);
		assert.equal(agent.name, "sydney-traffic-agent");
		assert.match(agent.instructions, /Sydney public transport assistant/);
		assert.deepEqual(
			agent.tools.map((t) => t.name),
			["get_transit_disruptions"],
		);
		// Regression guard: without a forced tool choice, a vague/short input
		// (e.g. "Alert") can lead the model to answer directly instead of
		// fetching disruptions first — see trafficAgent.ts.
		assert.equal(agent.modelSettings?.toolChoice, "required");
		// Regression guard: confirms the agent fetches its instructions via
		// the resilient helper (with a fallback), not a raw promptClient call
		// that would crash the server on a missing/mislabeled prompt.
		assert.equal(
			mockGetPromptInstructions.mock.calls[0].arguments[0],
			"traffic-advice",
		);
	});

	it("threads config through to the disruptions tool factory", () => {
		const config = { mcpServerUrl: "https://another.test" };
		trafficAgent(config);

		assert.equal(
			mockGetTransitDisruptionsTool.mock.calls.at(-1).arguments[0],
			config,
		);
	});
});
