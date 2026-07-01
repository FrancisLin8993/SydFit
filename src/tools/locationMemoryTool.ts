import { tool } from "@openai/agents";
import { z } from "zod";
import { getRelevantMemories } from "../services/memoryService.js";
import { writeLog } from "../utils/logger.js";

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
			const { memories } = await getRelevantMemories(config, query);

			const locationText = memories?.[0]?.text || "";

			writeLog(
				"INFO",
				`🧠 [Memory] Retrieved weather location query: "${locationText || "None"}"`,
			);
			return locationText;
		},
	});
