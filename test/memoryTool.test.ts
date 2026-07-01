import assert from "node:assert/strict";
import { before, beforeEach, describe, it, mock } from "node:test";

const mockGetRelevantMemories = mock.fn();
mock.module("../src/services/memoryService.js", {
	exports: { getRelevantMemories: mockGetRelevantMemories },
});

const mockWriteLog = mock.fn();
mock.module("../src/utils/logger.js", {
	exports: { writeLog: mockWriteLog },
});

describe("memoryTool (get_user_memory)", () => {
	let getUserMemoryTool: any;

	before(async () => {
		({ getUserMemoryTool } = await import("../src/tools/memoryTool.js"));
	});

	beforeEach(() => {
		mockGetRelevantMemories.mock.resetCalls();
		mockWriteLog.mock.resetCalls();
	});

	it("joins memory texts with newlines", async () => {
		mockGetRelevantMemories.mock.mockImplementationOnce(async () => ({
			memories: [{ text: "User takes T8" }, { text: "Prefers window seat" }],
		}));

		const tool = getUserMemoryTool({});
		const result = await tool.invoke({}, JSON.stringify({ query: "transit" }));

		assert.equal(result, "User takes T8\nPrefers window seat");
	});

	it("returns a fallback message when no memories are found", async () => {
		mockGetRelevantMemories.mock.mockImplementationOnce(async () => ({
			memories: [],
		}));

		const tool = getUserMemoryTool({});
		const result = await tool.invoke({}, JSON.stringify({ query: "transit" }));

		assert.equal(result, "No relevant transit preferences found.");
	});

	it("logs a warning but still returns memories when the service reports an error", async () => {
		mockGetRelevantMemories.mock.mockImplementationOnce(async () => ({
			memories: [{ text: "User takes T8" }],
			error: "partial failure",
		}));

		const tool = getUserMemoryTool({});
		await tool.invoke({}, JSON.stringify({ query: "transit" }));

		const warningCall = mockWriteLog.mock.calls.find(
			(c) => c.arguments[0] === "WARNING",
		);
		assert.ok(warningCall, "expected a WARNING log call");
	});
});
