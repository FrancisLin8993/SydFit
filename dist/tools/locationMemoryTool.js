import { z } from "zod";
import { tool } from "@openai/agents";
import { getRelevantMemories } from "../services/memoryService.js";
import { writeLog } from "../utils/logger.js";
// CHANGED: location memory retrieval was previously inlined directly inside
// getWeather() in weatherAgent.js, calling getRelevantMemories() as a plain
// function call. For the Agent SDK pattern, this becomes its own tool — same
// reasoning as createGetUserTransitMemoryTool in the traffic agent: the LLM
// decides when to call it, rather than it always running unconditionally
// before every weather fetch.
export const getUserLocationMemoryTool = (config) =>
	tool({
		name: "get_user_location_memory",
		description:
			"Fetches the user's saved preferred location/suburb/city for weather forecasts from long-term memory. Returns an empty string if no preference is saved — in that case default to 'Mascot'.",
		parameters: z.object({
			query: z
				.string()
				.describe(
					"A short description of what kind of location memory to search for, e.g. 'preferred location, suburb, or city for weather forecast'.",
				),
		}),
		execute: async ({ query }) => {
			const locationMemory = await getRelevantMemories(config, query);
			writeLog(
				"INFO",
				`🧠 [Memory] Retrieved weather location query: "${locationMemory || "None"}"`,
			);
			return locationMemory || "";
		},
	});
