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

const mockLoadPromptInstructions = mock.fn(
	() => "You are a Sydney public transport assistant.",
);
mock.module("../src/utils/prompts.js", {
	exports: { loadPromptInstructions: mockLoadPromptInstructions },
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
		const config = { tfnswApiKey: "tfnsw-key" };
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
		// Confirms the agent loads its instructions from the local prompt
		// file (src/prompts/traffic-advice.md), not Langfuse.
		assert.equal(
			mockLoadPromptInstructions.mock.calls[0].arguments[0],
			"traffic-advice",
		);
	});

	it("threads config through to the disruptions tool factory", () => {
		const config = { tfnswApiKey: "another-key" };
		trafficAgent(config);

		assert.equal(
			mockGetTransitDisruptionsTool.mock.calls.at(-1).arguments[0],
			config,
		);
	});
});
