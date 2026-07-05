import assert from "node:assert/strict";
import { before, beforeEach, describe, it, mock } from "node:test";

const mockAdd = mock.fn(async () => ({ status: "PENDING", event_id: "evt-1" }));
const mockSearch = mock.fn(async () => ({ results: [] }));
const mockClientConstructor = mock.fn();

class MockMemoryClient {
	constructor(opts: any) {
		mockClientConstructor(opts);
	}
	add(...args: any[]) {
		return mockAdd(...args);
	}
	search(...args: any[]) {
		return mockSearch(...args);
	}
}
mock.module("mem0ai", {
	exports: { MemoryClient: MockMemoryClient },
});

const mockWriteLog = mock.fn();
mock.module("../src/utils/logger.js", {
	exports: { writeLog: mockWriteLog },
});

describe("memoryService", () => {
	let addPreferenceToMemory: any;
	let getRelevantMemories: any;
	let resetMemoryCacheForTests: any;

	before(async () => {
		({ addPreferenceToMemory, getRelevantMemories, resetMemoryCacheForTests } =
			await import("../src/services/memoryService.js"));
	});

	beforeEach(() => {
		mockAdd.mock.resetCalls();
		mockSearch.mock.resetCalls();
		mockClientConstructor.mock.resetCalls();
		mockWriteLog.mock.resetCalls();
		// The search cache is a module-level singleton; reset it so tests
		// reusing the same query string don't see a previous test's cached
		// result instead of calling mem0 fresh.
		resetMemoryCacheForTests();
	});

	describe("addPreferenceToMemory", () => {
		it("fails fast when mem0ApiKey is not configured", async () => {
			const result = await addPreferenceToMemory({}, "User likes T8");
			assert.deepEqual(result, {
				success: false,
				error: "MEM0_API_KEY is not configured in config",
			});
			assert.equal(mockAdd.mock.calls.length, 0);
		});

		it("constructs the client with the configured API key and adds the message", async () => {
			const result = await addPreferenceToMemory(
				{ mem0ApiKey: "test-key" },
				"User likes T8",
			);

			assert.equal(
				mockClientConstructor.mock.calls[0].arguments[0].apiKey,
				"test-key",
			);
			assert.deepEqual(mockAdd.mock.calls[0].arguments[0], [
				{ role: "user", content: "User likes T8" },
			]);
			assert.deepEqual(mockAdd.mock.calls[0].arguments[1], {
				userId: "francis",
			});
			assert.deepEqual(result, { success: true });
		});

		it("includes metadata in the add call when provided", async () => {
			await addPreferenceToMemory(
				{ mem0ApiKey: "test-key" },
				"User's preferred transit lines: T8.",
				{ type: "transit_lines", lines: ["T8"] },
			);

			assert.deepEqual(mockAdd.mock.calls[0].arguments[1], {
				userId: "francis",
				metadata: { type: "transit_lines", lines: ["T8"] },
			});
		});

		it("returns success:false when the SDK call throws", async () => {
			mockAdd.mock.mockImplementationOnce(async () => {
				throw new Error("mem0 platform unreachable");
			});

			const result = await addPreferenceToMemory(
				{ mem0ApiKey: "test-key" },
				"User likes T8",
			);

			assert.deepEqual(result, {
				success: false,
				error: "mem0 platform unreachable",
			});
		});
	});

	describe("getRelevantMemories", () => {
		it("short-circuits when mem0ApiKey is not configured", async () => {
			const result = await getRelevantMemories({}, "transit preferences");
			assert.deepEqual(result, {
				memories: [],
				error: "mem0ApiKey not configured",
			});
			assert.equal(mockSearch.mock.calls.length, 0);
		});

		it("searches scoped to the francis user and maps/filters results", async () => {
			mockSearch.mock.mockImplementationOnce(async () => ({
				results: [
					{ memory: "User takes T8", score: 0.9, created_at: "t1" },
					{ memory: "", score: 0.1, created_at: "t2" },
					{ memory: "Prefers window seat", score: 0.7 },
				],
			}));

			const result = await getRelevantMemories(
				{ mem0ApiKey: "test-key" },
				"transit preferences",
			);

			assert.deepEqual(mockSearch.mock.calls[0].arguments, [
				"transit preferences",
				{ filters: { user_id: "francis" }, topK: 5 },
			]);
			assert.deepEqual(result.memories, [
				{ text: "User takes T8", score: 0.9, timestamp: "t1", metadata: null },
				{
					text: "Prefers window seat",
					score: 0.7,
					timestamp: null,
					metadata: null,
				},
			]);
			assert.equal(result.query, "transit preferences");
		});

		it("surfaces metadata on results that include it", async () => {
			mockSearch.mock.mockImplementationOnce(async () => ({
				results: [
					{
						memory: "User's preferred transit lines: T8.",
						score: 0.95,
						created_at: "t1",
						metadata: { type: "transit_lines", lines: ["T8"] },
					},
				],
			}));

			const result = await getRelevantMemories(
				{ mem0ApiKey: "test-key" },
				"transit lines",
			);

			assert.deepEqual(result.memories, [
				{
					text: "User's preferred transit lines: T8.",
					score: 0.95,
					timestamp: "t1",
					metadata: { type: "transit_lines", lines: ["T8"] },
				},
			]);
		});

		it("returns an empty memories list and the error message on a failed search", async () => {
			mockSearch.mock.mockImplementationOnce(async () => {
				throw new Error("search failed");
			});

			const result = await getRelevantMemories(
				{ mem0ApiKey: "test-key" },
				"transit preferences",
			);

			assert.deepEqual(result, { memories: [], error: "search failed" });
		});

		it("tolerates a missing results envelope", async () => {
			mockSearch.mock.mockImplementationOnce(async () => ({}));

			const result = await getRelevantMemories(
				{ mem0ApiKey: "test-key" },
				"transit preferences",
			);

			assert.deepEqual(result.memories, []);
		});

		describe("caching", () => {
			it("serves a repeated query from cache without calling mem0 again", async () => {
				mockSearch.mock.mockImplementationOnce(async () => ({
					results: [{ memory: "User takes T8", score: 0.9, created_at: "t1" }],
				}));

				const first = await getRelevantMemories(
					{ mem0ApiKey: "test-key" },
					"cached query",
				);
				const second = await getRelevantMemories(
					{ mem0ApiKey: "test-key" },
					"cached query",
				);

				assert.equal(mockSearch.mock.calls.length, 1);
				assert.deepEqual(second.memories, first.memories);
			});

			it("calls mem0 separately for distinct queries", async () => {
				mockSearch.mock.mockImplementation(async () => ({ results: [] }));

				await getRelevantMemories({ mem0ApiKey: "test-key" }, "query one");
				await getRelevantMemories({ mem0ApiKey: "test-key" }, "query two");

				assert.equal(mockSearch.mock.calls.length, 2);
			});

			it("does not cache a failed search, so the next call retries mem0", async () => {
				// Explicit onCall indices: mockImplementationOnce() calls without
				// them silently overwrite each other's "next call" slot instead
				// of stacking (see other test files in this suite for the same
				// gotcha documented against node:test's mock API).
				mockSearch.mock.mockImplementationOnce(async () => {
					throw new Error("search failed");
				}, 0);
				mockSearch.mock.mockImplementationOnce(
					async () => ({
						results: [
							{ memory: "User takes T8", score: 0.9, created_at: "t1" },
						],
					}),
					1,
				);

				const first = await getRelevantMemories(
					{ mem0ApiKey: "test-key" },
					"retry query",
				);
				const second = await getRelevantMemories(
					{ mem0ApiKey: "test-key" },
					"retry query",
				);

				assert.equal(mockSearch.mock.calls.length, 2);
				assert.equal(first.error, "search failed");
				assert.equal(second.memories[0].text, "User takes T8");
			});

			it("invalidates the cache when a new preference is saved", async () => {
				mockSearch.mock.mockImplementationOnce(async () => ({ results: [] }));

				await getRelevantMemories(
					{ mem0ApiKey: "test-key" },
					"invalidation query",
				);
				assert.equal(mockSearch.mock.calls.length, 1);

				await addPreferenceToMemory(
					{ mem0ApiKey: "test-key" },
					"User takes T8",
				);

				mockSearch.mock.mockImplementationOnce(async () => ({
					results: [{ memory: "User takes T8", score: 0.9, created_at: "t1" }],
				}));
				const result = await getRelevantMemories(
					{ mem0ApiKey: "test-key" },
					"invalidation query",
				);

				assert.equal(mockSearch.mock.calls.length, 2);
				assert.equal(result.memories[0]?.text, "User takes T8");
			});
		});
	});
});
