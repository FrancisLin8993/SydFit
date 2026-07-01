import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it, mock } from "node:test";

const mockGetGcpAuthHeaders = mock.fn(async () => ({
	Authorization: "Bearer gcp-token",
}));
mock.module("../src/services/gcpAuth.js", {
	exports: { getGcpAuthHeaders: mockGetGcpAuthHeaders },
});

const mockWriteLog = mock.fn();
mock.module("../src/utils/logger.js", {
	exports: { writeLog: mockWriteLog },
});

describe("memoryService", () => {
	let addPreferenceToMemory, getRelevantMemories;
	const originalFetch = global.fetch;
	const originalToken = process.env.MEM0_ACCESS_TOKEN;

	before(async () => {
		({ addPreferenceToMemory, getRelevantMemories } = await import(
			"../src/services/memoryService.js"
		));
	});

	beforeEach(() => {
		mockGetGcpAuthHeaders.mock.resetCalls();
		mockWriteLog.mock.resetCalls();
	});

	after(() => {
		global.fetch = originalFetch;
		process.env.MEM0_ACCESS_TOKEN = originalToken;
	});

	describe("addPreferenceToMemory", () => {
		it("fails fast when mem0ApiUrl is not configured", async (t) => {
			const result = await addPreferenceToMemory({}, "User likes T8");
			assert.deepEqual(result, {
				success: false,
				error: "MEM0_API_URL is not configured in config",
			});
		});

		it("fails fast when mem0AccessToken is missing", async () => {
			const result = await addPreferenceToMemory(
				{ mem0ApiUrl: "https://mem0.test" },
				"User likes T8",
			);
			assert.deepEqual(result, {
				success: false,
				error: "MEM0_ACCESS_TOKEN is missing for memory service",
			});
		});

		it("posts the preference text and merges GCP auth headers", async () => {
			let captured;
			global.fetch = mock.fn(async (url, options) => {
				captured = { url, options };
				return { ok: true };
			});

			const result = await addPreferenceToMemory(
				{
					mem0ApiUrl: "https://mem0.test",
					mem0AccessToken: "mem0-token",
				},
				"User likes T8",
			);

			assert.deepEqual(result, { success: true });
			assert.equal(captured.url, "https://mem0.test/memory/add");
			assert.equal(captured.options.headers["x-worker-token"], "mem0-token");
			assert.equal(captured.options.headers.Authorization, "Bearer gcp-token");
			assert.deepEqual(JSON.parse(captured.options.body), {
				text: "User likes T8",
				user_id: "francis",
			});
		});

		it("returns success:false with the response details on a failed request", async () => {
			global.fetch = mock.fn(async () => ({
				ok: false,
				status: 502,
				text: async () => "upstream down",
			}));

			const result = await addPreferenceToMemory(
				{ mem0ApiUrl: "https://mem0.test", mem0AccessToken: "mem0-token" },
				"User likes T8",
			);

			assert.equal(result.success, false);
			assert.match(result.error, /502/);
			assert.match(result.error, /upstream down/);
		});
	});

	describe("getRelevantMemories", () => {
		beforeEach(() => {
			process.env.MEM0_ACCESS_TOKEN = "  env-token  ";
		});

		it("short-circuits when mem0ApiUrl is not configured", async () => {
			const result = await getRelevantMemories({}, "transit preferences");
			assert.deepEqual(result, {
				memories: [],
				error: "mem0ApiUrl not configured",
			});
		});

		it("maps and filters search results, trimming the worker token header", async () => {
			let captured;
			global.fetch = mock.fn(async (url, options) => {
				captured = { url, options };
				return {
					ok: true,
					json: async () => ({
						memories: {
							results: [
								{ memory: "User takes T8", score: 0.9, created_at: "t1" },
								{ memory: "", score: 0.1, created_at: "t2" },
								{ memory: "Prefers window seat", score: 0.7 },
							],
						},
					}),
				};
			});

			const result = await getRelevantMemories(
				{ mem0ApiUrl: "https://mem0.test" },
				"transit preferences",
			);

			assert.equal(captured.url, "https://mem0.test/memory/search");
			assert.equal(captured.options.headers["X-Worker-Token"], "env-token");
			assert.deepEqual(result.memories, [
				{ text: "User takes T8", score: 0.9, timestamp: "t1" },
				{ text: "Prefers window seat", score: 0.7, timestamp: null },
			]);
			assert.equal(result.query, "transit preferences");
		});

		it("returns an empty memories list and the error text on a failed search", async () => {
			global.fetch = mock.fn(async () => ({
				ok: false,
				status: 500,
				text: async () => "search failed",
			}));

			const result = await getRelevantMemories(
				{ mem0ApiUrl: "https://mem0.test" },
				"transit preferences",
			);

			assert.deepEqual(result, { memories: [], error: "search failed" });
		});
	});
});
