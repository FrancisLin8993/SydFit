import { tool } from "@openai/agents";
import { z } from "zod";
import { getRelevantMemories } from "../services/memoryService.js";
import { writeLog } from "../utils/logger.js";
export const getUserMemoryTool = (config) => tool({
    name: "get_user_transit_memory",
    description: "Fetches the user's saved transit preferences and habits from long-term memory (e.g. preferred train line, commute patterns).",
    parameters: z.object({
        query: z.string().describe("A short description of what kind of transit memory to search for, e.g. 'preferred public transport mode commuting sydney'."),
    }),
    execute: async ({ query }) => {
        writeLog("INFO", "[Tool] Fetch user memory", { query });
        const memories = await getRelevantMemories(config, query);
        return memories.map((m) => m.text ?? m.memory ?? m).join("\n");
    },
});
