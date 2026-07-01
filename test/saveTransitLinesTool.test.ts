import assert from "node:assert/strict";
import { before, beforeEach, describe, it, mock } from "node:test";

const mockAddPreferenceToMemory = mock.fn();
mock.module("../src/services/memoryService.js", {
	exports: { addPreferenceToMemory: mockAddPreferenceToMemory },
});

const mockWriteLog = mock.fn();
mock.module("../src/utils/logger.js", {
	exports: { writeLog: mockWriteLog },
});

describe("saveTransitLinesTool (save_transit_lines)", () => {
	let saveTransitLinesTool: any;

	before(async () => {
		({ saveTransitLinesTool } = await import(
			"../src/tools/saveTransitLinesTool.js"
		));
	});

	beforeEach(() => {
		mockAddPreferenceToMemory.mock.resetCalls();
		mockWriteLog.mock.resetCalls();
	});

	it("dedupes and forwards canonical lines with structured metadata", async () => {
		mockAddPreferenceToMemory.mock.mockImplementationOnce(async () => ({
			success: true,
		}));

		const tool = saveTransitLinesTool({ mem0ApiUrl: "https://mem0" });
		const result = await tool.invoke(
			{},
			JSON.stringify({ lines: ["T8", "T8", "AIRPORT"] }),
		);

		assert.equal(mockAddPreferenceToMemory.mock.calls.length, 1);
		const [, text, metadata] =
			mockAddPreferenceToMemory.mock.calls[0].arguments;
		assert.equal(text, "User's preferred transit lines: T8, AIRPORT.");
		assert.deepEqual(metadata, {
			type: "transit_lines",
			lines: ["T8", "AIRPORT"],
		});

		assert.deepEqual(result, {
			success: true,
			message: "Saved preferred transit lines: T8, AIRPORT.",
			lines: ["T8", "AIRPORT"],
		});
	});

	it("returns success:false when the memory service reports failure", async () => {
		mockAddPreferenceToMemory.mock.mockImplementationOnce(async () => ({
			success: false,
			error: "mem0 unreachable",
		}));

		const tool = saveTransitLinesTool({});
		const result = await tool.invoke({}, JSON.stringify({ lines: ["T8"] }));

		// Unlike saveUserPreferenceTool's documented pre-existing bug (see
		// saveUserPreferenceTool.test.ts), this tool correctly checks
		// result.success rather than the always-truthy result object itself.
		assert.deepEqual(result, {
			success: false,
			message: "Failed to save transit line preference. Please try again.",
		});
	});

	it("rejects an empty lines array via schema validation", async () => {
		const tool = saveTransitLinesTool({});
		const result = await tool.invoke({}, JSON.stringify({ lines: [] }));

		assert.equal(mockAddPreferenceToMemory.mock.calls.length, 0);
		assert.match(result, /error occurred while running the tool/i);
	});

	it("rejects an unrecognized line code via schema validation", async () => {
		const tool = saveTransitLinesTool({});
		const result = await tool.invoke(
			{},
			JSON.stringify({ lines: ["NOT_A_REAL_LINE"] }),
		);

		assert.equal(mockAddPreferenceToMemory.mock.calls.length, 0);
		assert.match(result, /error occurred while running the tool/i);
	});
});
