import { z } from "zod";
import { tool } from "@openai/agents";
import { getRelevantMemories } from "../services/memoryService.js";
import { writeLog } from "../utils/logger.js";

export const getUserMemoryTool = (config) =>
	tool({
		name: "get_user_memory",
		description:
			"Fetches the user's saved preferences and commuting habits from long-term memory (e.g. preferred train line, stations, modes they use).",
		parameters: z.object({
			query: z
				.string()
				.describe("A short description of what kind of transit memory to search for, e.g. 'preferred public transport mode commuting sydney'."),
		}),
		execute: async ({ query }) => {
			writeLog("INFO", "[Tool] Fetch user memory", { query });

			const { memories, error } = await getRelevantMemories(config, query);

			if (error) {
				writeLog("WARNING", "[Tool] Memory retrieval returned an error", { error });
			}

			if (!memories || memories.length === 0) {
				return "No relevant transit preferences found.";
			}

			// memoryService.js already shapes each item as { text, score, timestamp }
			return memories.map((m) => m.text).join("\n");
		},
	});