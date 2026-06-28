import { getRelevantMemories } from "../memoryService.js";
import { writeLog } from "../logger.js";

export async function getUserTransitMemory(userId) {
	writeLog("INFO", "[Tool] Fetch user transit memory", { userId });

	const memories = await getRelevantMemories(userId);
	return memories.map((m) => m.text ?? m.memory ?? m).join("\n");
}
