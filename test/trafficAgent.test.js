import { describe, it, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

const mockWriteLog = mock.fn();
mock.module("../src/utils/logger.js", {
	namedExports: { writeLog: mockWriteLog },
});

mock.module("../src/utils/config.js", {
	namedExports: {
		loadConfig: () => ({
			openaiApiKey: "test-key",
			openaiModel: "test-model",
		}),
	},
});

mock.module("../src/services/langfuse.js", {
	namedExports: {
		promptClient: {
			prompt: {
				get: async () => ({
					compile: ({ userTransitMemories }) =>
						`You are a traffic advisor. User memories: ${userTransitMemories}`,
				}),
			},
		},
	},
});

const mockGetGcpAuthHeaders = mock.fn(async () => ({
	Authorization: "Bearer test",
}));
mock.module("../src/services/gcpAuth.js", {
	namedExports: { getGcpAuthHeaders: mockGetGcpAuthHeaders },
});

const mockGetRelevantMemories = mock.fn(async () => ({
	memories: [{ text: "User takes T8", score: 0.9 }],
}));
mock.module("../src/services/memoryService.js", {
	namedExports: { getRelevantMemories: mockGetRelevantMemories },
});

const mockCreateChatCompletion = mock.fn(async () => ({
	choices: [{ message: { content: "Smooth commute." } }],
}));
mock.module("openai", {
	defaultExport: class OpenAI {
		chat = { completions: { create: mockCreateChatCompletion } };
	},
});

describe("Traffic Agent", () => {
	let traffic;

	before(async () => {
		traffic = await import("../src/services/traffic.js");
	});

	beforeEach(() => {
		mockWriteLog.mock.resetCalls();
		mockGetGcpAuthHeaders.mock.resetCalls();
		mockCreateChatCompletion.mock.resetCalls();
	});

	it("should detect MCP errors correctly", () => {
		assert.strictEqual(
			traffic.containsMcpError({ error: "System failure" }),
			true,
		);
		assert.strictEqual(traffic.containsMcpError({ data: "All good" }), false);
		assert.strictEqual(
			traffic.containsMcpError("[ERROR] System failure"),
			true,
		);
		assert.strictEqual(traffic.containsMcpError("All good"), false);
	});

	it("should filter alerts through handleTrafficQuery using memory", async () => {
		const mockAlertsData = {
			mode: "all",
			alertCount: 1,
			alerts: [
				{
					title: "T8 Line Delay",
					description: "Delays on T8 line due to trackwork",
					activePeriods: [{ start: "9:00 AM", end: "5:00 PM" }],
					cause: "Trackwork",
					effect: "Delays",
					url: null,
				},
			],
		};

		global.fetch = mock.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => mockAlertsData,
		}));

		const config = {
			mcpServerUrl: "https://test.run.app",
			mcpAccessToken: "test-token",
			openaiApiKey: "test-key",
			openaiModel: "test-model",
		};

		const advice = await traffic.handleTrafficQuery(
			config,
			"how is traffic",
			"User takes T8",
			["train"],
		);

		assert.strictEqual(advice, "Smooth commute.");
		assert.strictEqual(mockCreateChatCompletion.mock.calls.length, 1);
	});
});
