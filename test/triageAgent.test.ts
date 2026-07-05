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

const mockLoadPromptInstructions = mock.fn(
	() => "You are the SydFit triage agent.",
);
mock.module("../src/utils/prompts.js", {
	exports: { loadPromptInstructions: mockLoadPromptInstructions },
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

const mockGetTransitDisruptionsTool = mock.fn((config) => ({
	name: "get_transit_disruptions",
	config,
}));
mock.module("../src/tools/tfnswTool.js", {
	exports: { getTransitDisruptionsTool: mockGetTransitDisruptionsTool },
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

	it("builds a sydfit-triage agent with save + disruptions tools and the weather handoff", () => {
		const config = { tfnswApiKey: "tfnsw-key" };
		const agent = triageAgent(config);

		assert.ok(agent instanceof MockAgent);
		assert.equal(agent.name, "sydfit-triage");
		assert.equal(agent.instructions, "You are the SydFit triage agent.");
		// Traffic is a TOOL of triage, not a handoff — see triageAgent.ts.
		assert.deepEqual(
			agent.tools.map((t) => t.name),
			["save_preference", "save_transit_lines", "get_transit_disruptions"],
		);
		assert.deepEqual(
			agent.handoffs.map((h) => h.name),
			["sydney-weather-agent"],
		);
		// Confirms the agent loads its instructions from the local prompt
		// file (src/prompts/triage-agent.md), not Langfuse.
		assert.equal(
			mockLoadPromptInstructions.mock.calls[0].arguments[0],
			"triage-agent",
		);
	});

	it("threads config through to all three tool factories", () => {
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
		assert.equal(
			mockGetTransitDisruptionsTool.mock.calls.at(-1).arguments[0],
			config,
		);
	});
});
