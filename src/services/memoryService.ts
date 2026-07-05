import { MemoryClient } from "mem0ai";
import { writeLog } from "../utils/logger.js";

// The SDK's shipped `Memory` type declares camelCase fields (e.g.
// `createdAt`), but search()'s implementation returns the raw REST response
// verbatim (verified by reading the installed package's source) — the
// actual wire shape is snake_case, matching Mem0's public API docs. This
// local type reflects runtime reality, not the (inaccurate) shipped types.
interface RawMem0SearchResult {
	memory?: string;
	score?: number;
	created_at?: string;
	metadata?: Record<string, unknown> | null;
}

let client: MemoryClient | undefined;

function getClient(apiKey: string): MemoryClient {
	if (!client) {
		client = new MemoryClient({ apiKey });
	}
	return client;
}

/**
 * Add a memory via the Mem0 Platform API.
 *
 * NOTE: Platform's add() queues extraction asynchronously — the underlying
 * endpoint returns `{status: "PENDING", event_id}` immediately, not a
 * confirmation that the memory is indexed/searchable yet (verified directly
 * against the installed SDK's implementation, not just its — slightly
 * stale — type declarations). We deliberately don't poll for completion;
 * this app's usage pattern is "save now, read later," not same-turn
 * read-after-write, so eventual consistency is an acceptable trade for not
 * adding polling complexity.
 */
export async function addPreferenceToMemory(
	config,
	text,
	metadata?: Record<string, unknown>,
) {
	try {
		if (!config.mem0ApiKey) {
			throw new Error("MEM0_API_KEY is not configured in config");
		}

		const mem0 = getClient(config.mem0ApiKey);

		await mem0.add([{ role: "user", content: text }], {
			userId: "francis",
			...(metadata ? { metadata } : {}),
		});

		writeLog("INFO", "[Memory] Queued memory add", { text });

		return { success: true };
	} catch (error) {
		writeLog("ERROR", "[Memory service] Failed to add memory", {
			error: error.message,
		});

		return { success: false, error: error.message };
	}
}

/**
 * Returns structured memories for LLM / Agent tool usage
 */
export async function getRelevantMemories(config, query) {
	try {
		if (!config.mem0ApiKey) {
			return {
				memories: [],
				error: "mem0ApiKey not configured",
			};
		}

		const mem0 = getClient(config.mem0ApiKey);

		const response = await mem0.search(query, {
			filters: { user_id: "francis" },
			topK: 5,
		});

		const memoriesArray = (response?.results ??
			[]) as unknown as RawMem0SearchResult[];

		const memories = memoriesArray
			.map((m) => ({
				text: m.memory,
				score: m.score ?? null,
				timestamp: m.created_at ?? null,
				metadata: m.metadata ?? null,
			}))
			.filter((m) => m.text);

		writeLog("INFO", "[Memory] Retrieved memories", {
			count: memories.length,
		});

		return {
			memories,
			query,
		};
	} catch (error) {
		writeLog("ERROR", "[Memory service] Failed to retrieve memories", {
			error: error.message,
		});

		return {
			memories: [],
			error: error.message,
		};
	}
}
