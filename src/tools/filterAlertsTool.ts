import { tool } from "@openai/agents";
import { z } from "zod";

export const filterAlertsTool = tool({
	name: "filter_relevant_alerts",
	description:
		"Filters a set of TfNSW alerts down to only those relevant to the user's preferred transit lines, based on their transit memories.",
	parameters: z.object({
		memories: z
			.string()
			.describe(
				"The user's transit memory text, used to determine which lines/modes they care about.",
			),
		alertsByMode: z
			.array(
				z.object({
					mode: z.string(),
					alerts: z.array(
						z
							.object({
								title: z.string(),
								description: z.string(),
							})
							.passthrough(),
					),
				}),
			)
			.describe(
				"Raw alert blocks grouped by transport mode, as returned by the TfNSW alerts tool.",
			),
	}),
	execute: async ({ memories, alertsByMode }) => {
		const preferredLines = extractLines(memories);

		const filtered = [];

		for (const block of alertsByMode) {
			const matched = block.alerts.filter((alert) =>
				isRelevant(alert, preferredLines),
			);

			if (matched.length > 0) {
				filtered.push({
					mode: block.mode,
					alerts: matched,
				});
			}
		}

		return {
			relevant_alerts: filtered,
			matched_preferences: preferredLines,
		};
	},
});

/**
 * naive but effective extraction
 */
function extractLines(memory) {
	const text = JSON.stringify(memory).toLowerCase();

	const lines = [];

	if (text.includes("t1")) lines.push("t1");
	if (text.includes("t2")) lines.push("t2");
	if (text.includes("t3")) lines.push("t3");
	if (text.includes("t4")) lines.push("t4");
	if (text.includes("t5")) lines.push("t5");
	if (text.includes("t6")) lines.push("t6");
	if (text.includes("t8")) lines.push("t8");
	if (text.includes("t9")) lines.push("t9");
	if (text.includes("airport")) lines.push("airport");

	return lines;
}

function isRelevant(alert, lines) {
	const content = `${alert.title} ${alert.description}`.toLowerCase();

	return lines.some((line) => content.includes(line));
}
