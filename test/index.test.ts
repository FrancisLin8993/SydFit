import assert from "node:assert/strict";
import { before, beforeEach, describe, it, mock } from "node:test";

const mockRunnerRun = mock.fn(async (agent: any) => {
	if (agent?.__kind === "weather") {
		return { finalOutput: "Wear a light jacket." };
	}
	if (agent?.__kind === "traffic") {
		return { finalOutput: "T8 delays until 5pm." };
	}
	return { finalOutput: "mock reply", lastAgent: { name: "sydfit-triage" } };
});
mock.module("@openai/agents", {
	exports: {
		Runner: class {
			run = mockRunnerRun;
		},
	},
});

const mockWriteLog = mock.fn();
mock.module("../src/utils/logger.ts", {
	exports: { writeLog: mockWriteLog },
});

const mockLoadConfig = mock.fn(() => ({ sydFitApiKey: "test-secret" }));
mock.module("../src/utils/config.ts", {
	exports: { loadConfig: mockLoadConfig },
});

const mockEnqueueSydFitTask = mock.fn(async () => ({ name: "mock-task" }));
mock.module("../src/services/googleCloudTask.ts", {
	exports: { enqueueSydFitTask: mockEnqueueSydFitTask },
});

const mockTriageAgentInstance = { __kind: "triage" };
mock.module("../src/agents/triageAgent.ts", {
	exports: { triageAgent: mock.fn(() => mockTriageAgentInstance) },
});

const mockWeatherAgentInstance = { __kind: "weather" };
mock.module("../src/agents/weatherAgent.ts", {
	exports: { weatherAgent: mock.fn(() => mockWeatherAgentInstance) },
});

const mockTrafficAgentInstance = { __kind: "traffic" };
mock.module("../src/agents/trafficAgent.ts", {
	exports: { trafficAgent: mock.fn(() => mockTrafficAgentInstance) },
});

const mockSendBark = mock.fn(async () => {});
mock.module("../src/services/bark.ts", {
	exports: { sendBarkNotification: mockSendBark },
});

mock.module("../src/services/langfuse.ts", {
	exports: {
		flushLangfuse: async () => {},
		startActiveObservation: async (_name: string, fn: any) =>
			fn({ update: () => {} }),
		propagateAttributes: async (_attrs: any, fn: any) => fn(),
	},
});

function authedRequest(path: string, body: Record<string, unknown> = {}) {
	return new Request(`http://localhost${path}`, {
		method: "POST",
		headers: {
			"x-sydfit-token": "test-secret",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
}

describe("index.ts HTTP routes", () => {
	let app: any;

	before(async () => {
		const index = await import("../src/index.ts");
		app = index.app;
	});

	beforeEach(() => {
		mockWriteLog.mock.resetCalls();
		mockEnqueueSydFitTask.mock.resetCalls();
		mockSendBark.mock.resetCalls();
		mockRunnerRun.mock.resetCalls();
	});

	it("rejects requests without a valid x-sydfit-token", async () => {
		const res = await app.request(
			new Request("http://localhost/api/ask", { method: "POST" }),
		);
		assert.strictEqual(res.status, 401);
	});

	it("bypasses auth for /doc and /swagger", async () => {
		const doc = await app.request(new Request("http://localhost/doc"));
		assert.strictEqual(doc.status, 200);
		const docBody = await doc.json();
		assert.equal(docBody.info.title, "SydFit Personal Assistant API");

		const swagger = await app.request(new Request("http://localhost/swagger"));
		assert.strictEqual(swagger.status, 200);
	});

	it("enqueues a background task on /api/ask", async () => {
		const res = await app.request(
			authedRequest("/api/ask", { query: "gym today" }),
		);
		assert.strictEqual(res.status, 202);
		const data = await res.json();

		assert.strictEqual(data.success, true);
		assert.strictEqual(mockEnqueueSydFitTask.mock.calls.length, 1);

		const args = mockEnqueueSydFitTask.mock.calls[0].arguments;
		assert.strictEqual(args[1], "/api/process-task");
		assert.deepEqual(args[2], { query: "gym today" });
	});

	it("returns 500 when enqueuing fails on /api/ask", async () => {
		mockEnqueueSydFitTask.mock.mockImplementationOnce(async () => {
			throw new Error("queue unavailable");
		});

		const res = await app.request(
			authedRequest("/api/ask", { query: "gym today" }),
		);
		assert.strictEqual(res.status, 500);
		const data = await res.json();
		assert.strictEqual(data.success, false);
		assert.match(data.error, /queue unavailable/);
	});

	it("processes a memory-path task directly handled by the triage agent", async () => {
		const res = await app.request(
			authedRequest("/api/process-task", { query: "remember I like T8" }),
		);
		assert.strictEqual(res.status, 200);
		const data = await res.json();
		assert.strictEqual(data.success, true);

		assert.strictEqual(mockSendBark.mock.calls.length, 1);
		const [notification] = mockSendBark.mock.calls[0].arguments.slice(1);
		assert.equal(notification.title, "🧠 SydFit Memory Sync");
	});

	it("titles the push notification for a traffic handoff", async () => {
		mockRunnerRun.mock.mockImplementationOnce(async () => ({
			finalOutput: "T8 delays until 5pm.",
			lastAgent: { name: "sydney-traffic-agent" },
		}));

		await app.request(
			authedRequest("/api/process-task", { query: "how's my commute" }),
		);

		const [notification] = mockSendBark.mock.calls[0].arguments.slice(1);
		assert.equal(notification.title, "🚆 Sydney Traffic Update");
	});

	it("titles the push notification for a weather handoff", async () => {
		mockRunnerRun.mock.mockImplementationOnce(async () => ({
			finalOutput: "Wear a light jacket.",
			lastAgent: { name: "sydney-weather-agent" },
		}));

		await app.request(
			authedRequest("/api/process-task", { query: "what should I wear" }),
		);

		const [notification] = mockSendBark.mock.calls[0].arguments.slice(1);
		assert.equal(notification.title, "☀️ Mascot Outfit Suggestion");
	});

	it("returns 500 and sends an error push when the triage run throws", async () => {
		mockRunnerRun.mock.mockImplementationOnce(async () => {
			throw new Error("agent run failed");
		});

		const res = await app.request(
			authedRequest("/api/process-task", { query: "gym today" }),
		);
		assert.strictEqual(res.status, 500);
		const data = await res.json();
		assert.strictEqual(data.success, false);

		const [notification] = mockSendBark.mock.calls[0].arguments.slice(1);
		assert.equal(notification.title, "❌ SydFit API Error");
	});

	it("sends both outfit and transport notifications on /api/cron", async () => {
		const res = await app.request(authedRequest("/api/cron"));
		assert.strictEqual(res.status, 200);
		const data = await res.json();
		assert.strictEqual(data.success, true);

		const titles = mockSendBark.mock.calls.map(
			(c) => c.arguments.slice(1)[0].title,
		);
		assert.deepEqual(
			new Set(titles),
			new Set(["☀️ Today's Outfit", "🚆 Transport Alerts"]),
		);
	});

	it("still sends the transport notification when the weather agent fails", async () => {
		// /api/cron invokes Runner#run for weather then traffic, synchronously,
		// before either settles — so queuing implementations against explicit
		// call indices (beforeEach resets the call count to 0 for every test)
		// reliably targets "weather call" (0) then "traffic call" (1),
		// regardless of which one resolves first. Without an explicit index,
		// mockImplementationOnce would silently overwrite the first queued
		// implementation instead of stacking both.
		mockRunnerRun.mock.mockImplementationOnce(async () => {
			throw new Error("weather down");
		}, 0);
		mockRunnerRun.mock.mockImplementationOnce(
			async () => ({
				finalOutput: "T8 delays.",
			}),
			1,
		);

		const res = await app.request(authedRequest("/api/cron"));
		assert.strictEqual(res.status, 200);

		const titles = mockSendBark.mock.calls.map(
			(c) => c.arguments.slice(1)[0].title,
		);
		assert.ok(titles.includes("❌ Weather Agent Error"));
		assert.ok(titles.includes("🚆 Transport Alerts"));
	});
});
