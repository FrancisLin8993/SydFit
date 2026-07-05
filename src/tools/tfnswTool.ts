import { tool } from "@openai/agents";
import { z } from "zod";
import { getGcpAuthHeaders } from "../services/gcpAuth.js";
import { writeLog } from "../utils/logger.js";
import {
	alertMentionsLine,
	type CanonicalLine,
	normalizeLine,
} from "../utils/transitLines.js";

// Fetches TfNSW alerts for a mode AND filters them down to the user's
// preferred lines in one tool call. This used to be two separate tools
// (fetch, then a model-driven filter_relevant_alerts call) — but filtering
// is a deterministic word-boundary match with no LLM judgment involved, so
// routing it through the model just forced it to ingest the full unfiltered
// alert payload and then regenerate it as tool-call arguments, adding tens
// of thousands of wasted tokens (and several seconds of latency) per
// request. Filtering here, in code, means the model only ever sees the
// already-relevant alerts.
export const getRelevantTfnswAlertsTool = (config) =>
	tool({
		name: "get_relevant_tfnsw_alerts",
		description:
			"Fetches real-time Transport for NSW (TfNSW) service alerts for a single transport mode and filters them down to only those relevant to the user's preferred transit lines. Call this once per relevant mode (e.g. once for 'train', once for 'lightrail') if the user commutes on multiple modes.",
		parameters: z.object({
			mode: z
				.enum(["train", "metro", "lightrail", "bus", "ferry", "all"])
				.describe("The transport mode to fetch alerts for."),
			preferredLines: z
				.array(z.string())
				.describe(
					"The user's preferred canonical transit line codes (e.g. ['T8', 'AIRPORT']), as returned by get_user_transit_lines.",
				),
		}),
		execute: async ({ mode, preferredLines }) => {
			const mcpServerUrl = config.mcpServerUrl;
			const fetchUrl = `${mcpServerUrl}/alerts`;

			writeLog("INFO", "[Tool] Fetch TfNSW alerts", { mode });

			const response = await fetch(fetchUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Worker-Token": config.mcpAccessToken,
					...(await getGcpAuthHeaders(mcpServerUrl)),
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
			const alerts = Array.isArray(data?.alerts) ? data.alerts : [];

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

			writeLog("INFO", "[Tool] Filtered TfNSW alerts", {
				mode,
				totalAlerts: alerts.length,
				relevantAlerts: relevantAlerts.length,
			});

			return {
				mode,
				relevant_alerts: relevantAlerts,
				matched_preferences: Array.from(matchedPreferences),
			};
		},
	});
