import { z } from "zod";
import { tool } from "@openai/agents";
import { addPreferenceToMemory } from "../services/memoryService.js";
import { writeLog } from "../utils/logger.js";
export const saveUserPreferenceTool = (config) => tool({
    name: "save_preference",
    description: "Saves a personal preference, habit, or instruction to the user's long-term memory for future use. Call this when the user wants SydFit to remember something about them (e.g. 'I prefer the T8 train', 'I need a scarf on windy days'). Extract a clean, third-person statement before calling — e.g. turn 'remember that I hate getting wet' into 'User dislikes getting wet, prefers covered transport routes'.",
    parameters: z.object({
        preference: z
            .string()
            .describe("A clean, third-person, standalone preference statement extracted from the user's message. Must not be empty."),
    }),
    execute: async ({ preference }) => {
        const trimmed = (preference || "").trim();
        if (!trimmed) {
            writeLog("WARNING", "[Tool] save_preference called with empty preference");
            return { success: false, message: "No preference text was provided to save." };
        }
        writeLog("INFO", "[Tool] Saving preference to memory", { preference: trimmed });
        const isSaved = await addPreferenceToMemory(config, trimmed);
        if (!isSaved) {
            writeLog("ERROR", "[Tool] Failed to save preference — mem0 sync failed", {
                preference: trimmed,
            });
            return {
                success: false,
                message: "Memory cluster sync failed. Please check Mem0 status.",
            };
        }
        return { success: true, message: "Preference saved successfully." };
    },
});
