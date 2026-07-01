import { tool } from "@openai/agents";
import { z } from "zod";
import { getRelevantMemories } from "../services/memoryService.js";
import { writeLog } from "../utils/logger.js";

export const getUserTransitLinesTool = (config) =>
	tool({
		name: "get_user_transit_lines",
		description:
			"Fetches the user's saved preferred Sydney transit lines (e.g. T1, T8, Airport, Lightrail) as a structured list, based on previously saved structured preferences (not freeform memory text). Returns an empty array if no structured transit line preference is saved.",
		parameters: z.object({
			query: z
				.string()
				.describe(
					"A short description of what kind of transit memory to search for, e.g. 'preferred transit lines commuting sydney'.",
				),
		}),
		execute: async ({ query }) => {
			writeLog("INFO", "[Tool] Fetch user transit lines", { query });

			const { memories, error } = await getRelevantMemories(config, query);

			if (error) {
				writeLog(
					"WARNING",
					"[Tool] Transit lines retrieval returned an error",
					{
						error,
					},
				);
			}

			if (!memories || memories.length === 0) {
				return [];
			}

			// Filter to structured transit-line entries only — entries saved via
			// the freeform save_preference path (or entries predating this
			// feature) simply have no `metadata` key at all, so this safely
			// excludes them without special-casing null vs undefined vs missing.
			const lineSets = memories
				.filter((m) => m.metadata?.type === "transit_lines")
				.map((m) => (Array.isArray(m.metadata?.lines) ? m.metadata.lines : []));

			const uniqueLines = Array.from(new Set(lineSets.flat()));

			writeLog("INFO", "[Tool] Retrieved structured transit lines", {
				count: uniqueLines.length,
			});

			return uniqueLines;
		},
	});
