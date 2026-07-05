import { getRelevantMemories } from "../services/memoryService.js";
import { writeLog } from "../utils/logger.js";

// Semantic-search query used to locate the user's saved transit-line
// preference in mem0. Fixed constant rather than an LLM-supplied argument —
// this is called internally by the merged disruptions tool, not exposed to
// the model, so there's nothing for the model to decide.
const TRANSIT_LINES_QUERY = "preferred transit lines commuting sydney";

/**
 * Fetches the user's saved preferred Sydney transit lines as a structured
 * list of canonical line codes (e.g. ["T8", "AIRPORT"]), based on
 * previously saved structured preferences. Returns an empty array if no
 * structured transit-line preference is saved.
 *
 * This used to be exposed as its own agent tool (get_user_transit_lines),
 * but the traffic workflow never branches — lines are always looked up,
 * then used to fetch alerts — so it's now a plain helper the merged
 * disruptions tool calls in code, saving an LLM round-trip.
 */
export async function getUserTransitLines(
	config,
	query: string = TRANSIT_LINES_QUERY,
): Promise<string[]> {
	writeLog("INFO", "[Memory] Fetch user transit lines", { query });

	const { memories, error } = await getRelevantMemories(config, query);

	if (error) {
		writeLog("WARNING", "[Memory] Transit lines retrieval returned an error", {
			error,
		});
	}

	if (!memories || memories.length === 0) {
		return [];
	}

	// Filter to structured transit-line entries only — entries saved via the
	// freeform save_preference path (or entries predating this feature) have
	// no `metadata` key at all, so this safely excludes them without
	// special-casing null vs undefined vs missing.
	const lineSets = memories
		.filter((m) => m.metadata?.type === "transit_lines")
		.map((m) => (Array.isArray(m.metadata?.lines) ? m.metadata.lines : []));

	const uniqueLines = Array.from(new Set(lineSets.flat()));

	writeLog("INFO", "[Memory] Retrieved structured transit lines", {
		count: uniqueLines.length,
	});

	return uniqueLines;
}
