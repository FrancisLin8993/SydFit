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

describe("transitLinesMemoryTool (get_user_transit_lines)", () => {
	let getUserTransitLinesTool: any;

	before(async () => {
		({ getUserTransitLinesTool } = await import(
			"../src/tools/transitLinesMemoryTool.js"
		));
	});

	beforeEach(() => {
		mockGetRelevantMemories.mock.resetCalls();
		mockWriteLog.mock.resetCalls();
	});

	it("unions and dedupes lines across multiple structured memory entries", async () => {
		mockGetRelevantMemories.mock.mockImplementationOnce(async () => ({
			memories: [
				{ text: "...", metadata: { type: "transit_lines", lines: ["T8"] } },
				{
					text: "...",
					metadata: { type: "transit_lines", lines: ["T8", "AIRPORT"] },
				},
			],
		}));

		const tool = getUserTransitLinesTool({});
		const result = await tool.invoke(
			{},
			JSON.stringify({ query: "transit lines" }),
		);

		assert.deepEqual(result, ["T8", "AIRPORT"]);
	});

	it("ignores memories without transit_lines metadata (backward compatibility)", async () => {
		mockGetRelevantMemories.mock.mockImplementationOnce(async () => ({
			memories: [
				// Old freeform entry, saved before this feature — mem0 omits the
				// metadata key entirely on such entries.
				{ text: "User takes the train sometimes", metadata: null },
				// A hypothetical differently-typed structured entry.
				{ text: "...", metadata: { type: "location", city: "Sydney" } },
				// The one entry that should actually contribute.
				{ text: "...", metadata: { type: "transit_lines", lines: ["T4"] } },
			],
		}));

		const tool = getUserTransitLinesTool({});
		const result = await tool.invoke(
			{},
			JSON.stringify({ query: "transit lines" }),
		);

		assert.deepEqual(result, ["T4"]);
	});

	it("returns an empty array when no memories are found", async () => {
		mockGetRelevantMemories.mock.mockImplementationOnce(async () => ({
			memories: [],
		}));

		const tool = getUserTransitLinesTool({});
		const result = await tool.invoke(
			{},
			JSON.stringify({ query: "transit lines" }),
		);

		assert.deepEqual(result, []);
	});

	it("logs a warning but still returns lines when the service reports an error", async () => {
		mockGetRelevantMemories.mock.mockImplementationOnce(async () => ({
			memories: [
				{ text: "...", metadata: { type: "transit_lines", lines: ["T8"] } },
			],
			error: "partial failure",
		}));

		const tool = getUserTransitLinesTool({});
		const result = await tool.invoke(
			{},
			JSON.stringify({ query: "transit lines" }),
		);

		assert.deepEqual(result, ["T8"]);
		const warningCall = mockWriteLog.mock.calls.find(
			(c) => c.arguments[0] === "WARNING",
		);
		assert.ok(warningCall, "expected a WARNING log call");
	});
});
