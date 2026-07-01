import { tool } from "@openai/agents";
import { z } from "zod";
import { addPreferenceToMemory } from "../services/memoryService.js";
import { writeLog } from "../utils/logger.js";
import { canonicalLineEnum } from "../utils/transitLines.js";

export const saveTransitLinesTool = (config) =>
	tool({
		name: "save_transit_lines",
		description:
			"Saves the user's preferred Sydney public transport lines/modes (e.g. T1, T8, Airport, Lightrail) to long-term memory as structured data. Call this specifically when the user states which train line(s), light rail, or airport line they use for commuting — NOT for other kinds of preferences (clothing, general habits, etc.), which should go through save_preference instead. Always pass canonical line codes, not freeform text.",
		parameters: z.object({
			lines: z
				.array(canonicalLineEnum)
				.min(1)
				.describe(
					"One or more canonical transit line codes the user prefers/commutes on, e.g. ['T8', 'AIRPORT'].",
				),
		}),
		execute: async ({ lines }) => {
			const uniqueLines = Array.from(new Set(lines));

			// Build our own canonical sentence rather than trusting the LLM to
			// phrase it — this is the text mem0 semantically indexes/rephrases;
			// the actual structured data lives in metadata below.
			const text = `User's preferred transit lines: ${uniqueLines.join(", ")}.`;

			writeLog("INFO", "[Tool] Saving transit line preference to memory", {
				lines: uniqueLines,
			});

			const result = await addPreferenceToMemory(config, text, {
				type: "transit_lines",
				lines: uniqueLines,
			});

			if (!result?.success) {
				writeLog("ERROR", "[Tool] Failed to save transit line preference", {
					lines: uniqueLines,
					error: result?.error,
				});
				return {
					success: false,
					message: "Failed to save transit line preference. Please try again.",
				};
			}

			return {
				success: true,
				message: `Saved preferred transit lines: ${uniqueLines.join(", ")}.`,
				lines: uniqueLines,
			};
		},
	});
