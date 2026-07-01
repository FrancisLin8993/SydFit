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

const mockGetUserLocationMemoryTool = mock.fn((config) => ({
	name: "get_user_location_memory",
	config,
}));
mock.module("../src/tools/locationMemoryTool.js", {
	exports: { getUserLocationMemoryTool: mockGetUserLocationMemoryTool },
});

const mockGetWeatherTool = mock.fn((config) => ({
	name: "get_weather",
	config,
}));
mock.module("../src/tools/weatherTool.js", {
	exports: { getWeatherTool: mockGetWeatherTool },
});

describe("weatherAgent factory", () => {
	let weatherAgent: any;

	before(async () => {
		({ weatherAgent } = await import("../src/agents/weatherAgent.js"));
	});

	it("builds a sydney-weather-agent with location memory and weather tools", () => {
		const config = { scheduleTimezone: "Australia/Sydney" };
		const agent = weatherAgent(config);

		assert.ok(agent instanceof MockAgent);
		assert.equal(agent.name, "sydney-weather-agent");
		assert.match(agent.instructions, /Sydney weather and clothing advisor/);
		assert.deepEqual(
			agent.tools.map((t) => t.name),
			["get_user_location_memory", "get_weather"],
		);
		// Regression guard: without a forced tool choice, the model could
		// answer directly instead of checking location/weather first — see
		// weatherAgent.ts and the matching guard in trafficAgent.ts.
		assert.equal(agent.modelSettings?.toolChoice, "required");
	});

	it("threads config through to both tool factories", () => {
		const config = { scheduleTimezone: "Pacific/Auckland" };
		weatherAgent(config);

		const lastLocationCall =
			mockGetUserLocationMemoryTool.mock.calls.at(-1).arguments[0];
		const lastWeatherCall = mockGetWeatherTool.mock.calls.at(-1).arguments[0];

		assert.equal(lastLocationCall, config);
		assert.equal(lastWeatherCall, config);
	});
});
