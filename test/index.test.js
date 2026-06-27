import { describe, it, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// Create native mocks
const mockWriteLog = mock.fn();
mock.module("../src/logger.js", { namedExports: { writeLog: mockWriteLog } });

const mockEnqueueSydFitTask = mock.fn(async () => ({ name: "mock-task" }));
mock.module("../src/googleCloudTask.js", {
	namedExports: { enqueueSydFitTask: mockEnqueueSydFitTask },
});

const mockLoadConfig = mock.fn(() => ({
	sydFitApiKey: "test-secret",
	openaiApiKey: "fake-key",
	openaiModel: "gpt-4o-mini",
	barkDeviceKey: "fake-device-key",
}));
mock.module("../src/config.js", {
	namedExports: { loadConfig: mockLoadConfig },
});

const mockAddPreference = mock.fn();
const mockGetMemories = mock.fn(async () => "mock memory");
mock.module("../src/memoryService.js", {
	namedExports: {
		addPreferenceToMemory: mockAddPreference,
		getRelevantMemories: mockGetMemories,
	},
});

const mockDetermineIntent = mock.fn(async () => ({
	intent: "weather",
	mode: null,
}));
mock.module("../src/intentRouter.js", {
	namedExports: { determineIntentAndMode: mockDetermineIntent },
});

const mockGetWeather = mock.fn(async () => ({}));
const mockGenerateClothing = mock.fn(async () => "Wear a jacket");
mock.module("../src/weatherAgent.js", {
	namedExports: {
		getWeather: mockGetWeather,
		generateClothingRecommendation: mockGenerateClothing,
	},
});

const mockSendBark = mock.fn(async () => {});
mock.module("../src/bark.js", {
	namedExports: { sendBarkNotification: mockSendBark },
});

describe("Index API Routes", () => {
	let app;

	before(async () => {
		// Dynamic import must happen after mock.module definitions
		const index = await import("../src/index.js");
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
