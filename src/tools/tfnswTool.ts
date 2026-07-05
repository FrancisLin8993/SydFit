import { tool } from "@openai/agents";
import { z } from "zod";
import { getGcpAuthHeaders } from "../services/gcpAuth.js";
import { writeLog } from "../utils/logger.js";
import {
	alertMentionsLine,
	type CanonicalLine,
	normalizeLine,
} from "../utils/transitLines.js";
import { getUserTransitLines } from "./transitLinesMemory.js";

interface TfnswAlert {
	title?: string;
	description?: string;
	[key: string]: unknown;
}

/**
 * Fetches raw TfNSW alerts for a single mode from the MCP server.
 * "all" returns every mode's alerts in one call — which is what the tool
 * below uses, so it can fetch alerts concurrently with the memory lookup
 * instead of issuing one call per mode after the lines are known.
 */
async function fetchTfnswAlerts(config, mode: string): Promise<TfnswAlert[]> {
	const fetchUrl = `${config.mcpServerUrl}/alerts`;

	const response = await fetch(fetchUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Worker-Token": config.mcpAccessToken,
			...(await getGcpAuthHeaders(config.mcpServerUrl)),
		},
		body: JSON.stringify({
			method: "get_sydney_transport_alerts",
			arguments: { mode },
		}),
	});

	if (!response.ok) {
		throw new Error(`TfNSW tool failed: ${response.status}`);
	}

	const data = await response.json();
	return Array.isArray(data?.alerts) ? data.alerts : [];
}

// Single tool that runs the entire traffic pipeline in code: look up the
// user's preferred lines from memory AND fetch current alerts concurrently,
// then filter alerts down to those lines — all in one call, so the model
// makes one tool call and gets back only the relevant disruptions.
//
// This replaces the old two-tool chain (get_user_transit_lines +
// get_relevant_tfnsw_alerts). That chain forced an extra LLM round-trip: the
// model had to go back to the model after the memory lookup just to issue
// the alerts call with the lines as input. But the workflow never branches —
// it's always lines -> alerts -> filter -> summarize — so orchestrating it
// here removes a whole model round-trip and runs the two fetches in parallel.
export const getTransitDisruptionsTool = (config) =>
	tool({
		name: "get_transit_disruptions",
		description:
			"Fetches the current TfNSW service disruptions relevant to the user's saved preferred transit lines, in one call. Returns the user's preferred lines, the filtered relevant alerts, and which of those lines actually have a disruption. Call this once; it handles looking up the user's lines and fetching + filtering alerts internally.",
		parameters: z.object({}),
		execute: async () => {
			// Memory lookup and alert fetch have no dependency on each other
			// (we fetch "all" modes and filter by line afterwards), so run them
			// concurrently rather than lines-then-alerts.
			const [preferredLines, alerts] = await Promise.all([
				getUserTransitLines(config),
				fetchTfnswAlerts(config, "all"),
			]);

			const normalizedLines = preferredLines
				.map((line) => normalizeLine(line))
				.filter((line): line is CanonicalLine => line !== null);

			const matchedPreferences = new Set<string>();
			const relevantAlerts = alerts.filter((alert) => {
				const content = `${alert?.title ?? ""} ${alert?.description ?? ""}`;
				const hitLines = normalizedLines.filter((line) =>
					alertMentionsLine(content, line),
				);

				for (const line of hitLines) {
					matchedPreferences.add(line);
				}

				return hitLines.length > 0;
			});

			writeLog("INFO", "[Tool] Fetched transit disruptions", {
				preferredLines,
				totalAlerts: alerts.length,
				relevantAlerts: relevantAlerts.length,
			});

			return {
				preferred_lines: preferredLines,
				relevant_alerts: relevantAlerts,
				matched_preferences: Array.from(matchedPreferences),
			};
		},
	});
