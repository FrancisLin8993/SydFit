import { tool } from "@openai/agents";
import { z } from "zod";
import {
	alertMentionsLine,
	type CanonicalLine,
	normalizeLine,
} from "../utils/transitLines.js";

export const filterAlertsTool = tool({
	name: "filter_relevant_alerts",
	description:
		"Filters a set of TfNSW alerts down to only those relevant to the user's preferred transit lines.",
	parameters: z.object({
		preferredLines: z
			.array(z.string())
			.describe(
				"The user's preferred canonical transit line codes (e.g. ['T8', 'AIRPORT']), as returned by get_user_transit_lines.",
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
	execute: async ({ preferredLines, alertsByMode }) => {
		// Defensive normalization: unrecognized/malformed codes are dropped
		// rather than causing a runtime error, since preferredLines could in
		// principle come from a stale or unexpected source.
		const normalizedLines = preferredLines
			.map((line) => normalizeLine(line))
			.filter((line): line is CanonicalLine => line !== null);

		const filtered = [];
		const matchedPreferences = new Set<string>();

		for (const block of alertsByMode) {
			const matched = block.alerts.filter((alert) => {
				const content = `${alert.title} ${alert.description}`;
				const hitLines = normalizedLines.filter((line) =>
					alertMentionsLine(content, line),
				);

				for (const line of hitLines) {
					matchedPreferences.add(line);
				}

				return hitLines.length > 0;
			});

			if (matched.length > 0) {
				filtered.push({
					mode: block.mode,
					alerts: matched,
				});
			}
		}

		return {
			relevant_alerts: filtered,
			matched_preferences: Array.from(matchedPreferences),
		};
	},
});
