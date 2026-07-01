import { describe, it, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// Create native mock functions
const mockCreateTask = mock.fn(async () => [{ name: "test-task-name" }]);
const mockQueuePath = mock.fn(() => "projects/p/locations/l/queues/q");
const mockWriteLog = mock.fn();

// Mock the Google Cloud Tasks SDK
mock.module("@google-cloud/tasks", {
	exports: {
		CloudTasksClient: class {
			createTask = mockCreateTask;
			queuePath = mockQueuePath;
		},
	},
});

// Mock the structured logger
mock.module("../src/utils/logger.js", {
	exports: {
		writeLog: mockWriteLog,
	},
});

describe("Cloud Tasks Utility", () => {
	let cloudTasks;

	before(async () => {
		// Dynamically import the module AFTER setting up the native mocks
		cloudTasks = await import("../src/services/googleCloudTask.js");
	});

	beforeEach(() => {
		// Reset call counts and histories before each test
		mockCreateTask.mock.resetCalls();
		mockQueuePath.mock.resetCalls();
		mockWriteLog.mock.resetCalls();
	});

	it("should successfully enqueue a task", async () => {
		const config = {
			gcpProjectId: "test-project",
			gcpLocation: "test-location",
			gcpQueueName: "test-queue",
			sydFitServiceUrl: "https://test.run.app",
			sydFitApiKey: "test-api-key",
		};

		const response = await cloudTasks.enqueueSydFitTask(
			config,
			"/test-endpoint",
			{ prompt: "test" },
		);
		assert.strictEqual(response.name, "test-task-name");

		const [level, message, meta] = mockWriteLog.mock.calls[0].arguments;
		assert.strictEqual(level, "INFO");
		assert.strictEqual(message, "Cloud Task enqueued successfully");
		assert.ok(typeof meta === "object");
	});

	it("should throw an error if cloud task config is incomplete", async () => {
		const config = { gcpProjectId: "test-project" };

		await assert.rejects(
			() => cloudTasks.enqueueSydFitTask(config, "/test", {}),
			/Cloud Tasks configuration is incomplete/,
		);
	});
});
