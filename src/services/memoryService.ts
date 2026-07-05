import { LRUCache } from "lru-cache";
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

interface MappedMemory {
	text: string;
	score: number | null;
	timestamp: string | null;
	metadata: Record<string, unknown> | null;
}

let client: MemoryClient | undefined;

function getClient(apiKey: string): MemoryClient {
	if (!client) {
		client = new MemoryClient({ apiKey });
	}
	return client;
}

// Caches search() results by query text, so repeat lookups (e.g. the same
// "preferred transit lines" query on every trafficAgent run) skip the mem0
// round-trip entirely. Keyed on query alone since this app hardcodes a
// single user_id ("francis") — a multi-user version would need to key on
// (userId, query) instead.
//
// `ttl` is a safety net for staleness from any source outside this
// process (e.g. editing memories directly via Mem0's dashboard); the more
// important invalidation path is explicit — see addPreferenceToMemory,
// which clears the whole cache on a successful write, since semantic
// search means we can't know in advance which cached queries a new memory
// might now match. Set generously (30 min) since transit-line/location
// preferences change rarely, and mem0's own add() is itself asynchronous
// (queued, not immediately searchable) — a short TTL here wouldn't close
// that gap anyway, it would just re-ask mem0 more often for an answer that
// might still be stale on mem0's side.
const SEARCH_CACHE_TTL_MS = 30 * 60 * 1000;
const memorySearchCache = new LRUCache<string, MappedMemory[]>({
	max: 100,
	ttl: SEARCH_CACHE_TTL_MS,
});

/**
 * Test-only escape hatch: the cache above is a module-level singleton, so
 * tests that exercise getRelevantMemories/addPreferenceToMemory with
 * overlapping query strings need to reset it between cases to avoid one
 * test's cached result leaking into another's assertions.
 */
export function resetMemoryCacheForTests() {
	memorySearchCache.clear();
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

		// Invalidate cached searches — a new memory could match any
		// previously-cached query, and semantic search means we can't tell
		// which ones without asking mem0, so we just clear everything.
		memorySearchCache.clear();

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

		const cached = memorySearchCache.get(query);
		if (cached) {
			writeLog("INFO", "[Memory] Cache hit, skipping mem0 search", {
				query,
				count: cached.length,
			});
			return { memories: cached, query };
		}

		const mem0 = getClient(config.mem0ApiKey);

		const response = await mem0.search(query, {
			filters: { user_id: "francis" },
			topK: 5,
		});

		const memoriesArray = (response?.results ??
			[]) as unknown as RawMem0SearchResult[];

		const memories: MappedMemory[] = memoriesArray
			.map((m) => ({
				text: m.memory,
				score: m.score ?? null,
				timestamp: m.created_at ?? null,
				metadata: m.metadata ?? null,
			}))
			.filter((m): m is MappedMemory => Boolean(m.text));

		memorySearchCache.set(query, memories);

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
