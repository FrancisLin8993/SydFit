import { describe, it, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

const mockRun = mock.fn(async () => ({ finalOutput: "mock reply" }));
mock.module("@openai/agents", {
	exports: {
		Runner: class {
			run = mockRun;
		},
		Agent: class {},
		tool: (opts) => opts,
	},
});

const mockWriteLog = mock.fn();
mock.module("../src/utils/logger.js", { exports: { writeLog: mockWriteLog } });

const mockEnqueueSydFitTask = mock.fn(async () => ({ name: "mock-task" }));
mock.module("../src/services/googleCloudTask.js", {
	exports: { enqueueSydFitTask: mockEnqueueSydFitTask },
});

const mockLoadConfig = mock.fn(() => ({
	sydFitApiKey: "test-secret",
	openaiApiKey: "fake-key",
	openaiModel: "gpt-4o-mini",
	barkDeviceKey: "fake-device-key",
}));
mock.module("../src/utils/config.js", {
	exports: { loadConfig: mockLoadConfig },
});

const mockAddPreference = mock.fn();
const mockGetMemories = mock.fn(async () => "mock memory");
mock.module("../src/services/memoryService.js", {
	exports: {
		addPreferenceToMemory: mockAddPreference,
		getRelevantMemories: mockGetMemories,
	},
});

const mockDetermineIntent = mock.fn(async () => ({
	intent: "weather",
	modes: [],
}));
mock.module("../src/intentRouter.js", {
	exports: { determineIntentAndMode: mockDetermineIntent },
});

const mockWeatherAgent = mock.fn(() => ({}));
const mockTrafficAgent = mock.fn(() => ({}));
mock.module("../src/agents/weatherAgent.js", {
	exports: { weatherAgent: mockWeatherAgent },
});
mock.module("../src/agents/trafficAgent.js", {
	exports: { trafficAgent: mockTrafficAgent },
});

const mockBuildTransitError = mock.fn(() => "");
mock.module("../src/services/traffic.js", {
	exports: { buildTransitErrorMessage: mockBuildTransitError },
});

const mockSendBark = mock.fn(async () => {});
mock.module("../src/services/bark.js", {
	exports: { sendBarkNotification: mockSendBark },
});

mock.module("../src/services/langfuse.js", {
	exports: {
		flushLangfuse: async () => {},
		startActiveObservation: async (_name, fn) => fn({ update: () => {} }),
		propagateAttributes: async (_attrs, fn) => fn(),
	},
});

describe("Index API Routes", () => {
	let app;

	before(async () => {
		const index = await import("../src/index.ts");
		app = index.app;
	});

	beforeEach(() => {
		mockWriteLog.mock.resetCalls();
		mockEnqueueSydFitTask.mock.resetCalls();
	});

	it("should reject unauthorized requests to /api/ask", async () => {
		const req = new Request("http://localhost/api/ask", { method: "POST" });
		const res = await app.request(req);
		assert.strictEqual(res.status, 401);
	});

	it("should accept authorized requests to /api/ask and enqueue a task", async () => {
		const req = new Request("http://localhost/api/ask", {
			method: "POST",
			headers: {
				"x-sydfit-token": "test-secret",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query: "gym today" }),
		});

		const res = await app.request(req);
		assert.strictEqual(res.status, 202);
		const data = await res.json();

		assert.strictEqual(data.success, true);
		assert.strictEqual(mockEnqueueSydFitTask.mock.calls.length, 1);

		const args = mockEnqueueSydFitTask.mock.calls[0].arguments;
		assert.strictEqual(args[1], "/api/process-task");
		assert.deepEqual(args[2], { query: "gym today" });
	});

	it("should process the background task successfully on /api/process-task", async () => {
		const req = new Request("http://localhost/api/process-task", {
			method: "POST",
			headers: {
				"x-sydfit-token": "test-secret",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query: "gym today" }),
		});

		const res = await app.request(req);
		assert.strictEqual(res.status, 200);
		const data = await res.json();

		assert.strictEqual(data.success, true);
	});
});
