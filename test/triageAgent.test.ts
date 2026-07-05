import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";

class MockAgent {
	static create(options) {
		return new MockAgent(options);
	}
	constructor(options) {
		Object.assign(this, options);
	}
}
mock.module("@openai/agents", {
	exports: { Agent: MockAgent },
});

const mockGetPromptInstructions = mock.fn(
	async () => "You are the SydFit triage agent.",
);
mock.module("../src/services/langfuse.js", {
	exports: { getPromptInstructions: mockGetPromptInstructions },
});

const mockWriteLog = mock.fn();
mock.module("../src/utils/logger.js", {
	exports: { writeLog: mockWriteLog },
});

const mockSaveUserPreferenceTool = mock.fn((config) => ({
	name: "save_preference",
	config,
}));
mock.module("../src/tools/saveUserPreferenceTool.js", {
	exports: { saveUserPreferenceTool: mockSaveUserPreferenceTool },
});

const mockSaveTransitLinesTool = mock.fn((config) => ({
	name: "save_transit_lines",
	config,
}));
mock.module("../src/tools/saveTransitLinesTool.js", {
	exports: { saveTransitLinesTool: mockSaveTransitLinesTool },
});

const mockTrafficAgent = mock.fn((config) => ({
	name: "sydney-traffic-agent",
	config,
}));
mock.module("../src/agents/trafficAgent.js", {
	exports: { trafficAgent: mockTrafficAgent },
});

const mockWeatherAgent = mock.fn((config) => ({
	name: "sydney-weather-agent",
	config,
}));
mock.module("../src/agents/weatherAgent.js", {
	exports: { weatherAgent: mockWeatherAgent },
});

describe("triageAgent factory", () => {
	let triageAgent: any;

	before(async () => {
		({ triageAgent } = await import("../src/agents/triageAgent.js"));
	});

	it("builds a sydfit-triage agent with both save tools and both specialist handoffs", () => {
		const config = { tfnswApiKey: "tfnsw-key" };
		const agent = triageAgent(config);

		assert.ok(agent instanceof MockAgent);
		assert.equal(agent.name, "sydfit-triage");
		assert.equal(agent.instructions, "You are the SydFit triage agent.");
		assert.deepEqual(
			agent.tools.map((t) => t.name),
			["save_preference", "save_transit_lines"],
		);
		assert.deepEqual(
			agent.handoffs.map((h) => h.name),
			["sydney-traffic-agent", "sydney-weather-agent"],
		);
		// Regression guard: confirms the agent fetches its instructions via
		// the resilient helper (with a fallback), not a raw promptClient call
		// that would crash the server on a missing/mislabeled prompt.
		assert.equal(
			mockGetPromptInstructions.mock.calls[0].arguments[0],
			"triage-agent",
		);
	});

	it("threads config through to both save tool factories", () => {
		const config = { tfnswApiKey: "another-key" };
		triageAgent(config);

		assert.equal(
			mockSaveUserPreferenceTool.mock.calls.at(-1).arguments[0],
			config,
		);
		assert.equal(
			mockSaveTransitLinesTool.mock.calls.at(-1).arguments[0],
			config,
		);
	});
});
