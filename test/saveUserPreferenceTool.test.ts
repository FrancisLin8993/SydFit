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

describe("saveUserPreferenceTool (save_preference)", () => {
	let saveUserPreferenceTool: any;

	before(async () => {
		({ saveUserPreferenceTool } = await import(
			"../src/tools/saveUserPreferenceTool.js"
		));
	});

	beforeEach(() => {
		mockAddPreferenceToMemory.mock.resetCalls();
		mockWriteLog.mock.resetCalls();
	});

	it("rejects an empty preference without calling the memory service", async () => {
		const tool = saveUserPreferenceTool({});
		const result = await tool.invoke({}, JSON.stringify({ preference: "   " }));

		assert.deepEqual(result, {
			success: false,
			message: "No preference text was provided to save.",
		});
		assert.equal(mockAddPreferenceToMemory.mock.calls.length, 0);
	});

	it("trims the preference and forwards it to the memory service", async () => {
		mockAddPreferenceToMemory.mock.mockImplementationOnce(async () => ({
			success: true,
		}));

		const tool = saveUserPreferenceTool({ mem0ApiUrl: "https://mem0" });
		const result = await tool.invoke(
			{},
			JSON.stringify({ preference: "  User prefers T8  " }),
		);

		assert.equal(mockAddPreferenceToMemory.mock.calls.length, 1);
		assert.equal(
			mockAddPreferenceToMemory.mock.calls[0].arguments[1],
			"User prefers T8",
		);
		assert.deepEqual(result, {
			success: true,
			message: "Preference saved successfully.",
		});
	});

	// NOTE: addPreferenceToMemory (src/services/memoryService.js) always
	// resolves with an object — `{ success: true }` or
	// `{ success: false, error }` — never a falsy value. The `if (!isSaved)`
	// check in src/tools/saveUserPreferenceTool.js therefore never triggers,
	// so this tool currently reports success even when the underlying memory
	// write failed. This test documents that actual behavior rather than the
	// intended one.
	it("still reports success when the memory service resolves a failure object", async () => {
		mockAddPreferenceToMemory.mock.mockImplementationOnce(async () => ({
			success: false,
			error: "mem0 unreachable",
		}));

		const tool = saveUserPreferenceTool({});
		const result = await tool.invoke(
			{},
			JSON.stringify({ preference: "User prefers T8" }),
		);

		assert.deepEqual(result, {
			success: true,
			message: "Preference saved successfully.",
		});
	});
});
