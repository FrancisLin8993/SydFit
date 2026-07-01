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

describe("locationMemoryTool (get_user_location_memory)", () => {
	let getUserLocationMemoryTool: any;

	before(async () => {
		({ getUserLocationMemoryTool } = await import(
			"../src/tools/locationMemoryTool.js"
		));
	});

	beforeEach(() => {
		mockGetRelevantMemories.mock.resetCalls();
		mockWriteLog.mock.resetCalls();
	});

	it("returns the top memory's text as the location", async () => {
		mockGetRelevantMemories.mock.mockImplementationOnce(async () => ({
			memories: [{ text: "Mascot" }, { text: "Sydney CBD" }],
		}));

		const tool = getUserLocationMemoryTool({});
		const result = await tool.invoke(
			{},
			JSON.stringify({ query: "preferred location" }),
		);

		assert.equal(result, "Mascot");
	});

	it("returns an empty string when no location memory is saved", async () => {
		mockGetRelevantMemories.mock.mockImplementationOnce(async () => ({
			memories: [],
		}));

		const tool = getUserLocationMemoryTool({});
		const result = await tool.invoke(
			{},
			JSON.stringify({ query: "preferred location" }),
		);

		assert.equal(result, "");
	});
});
