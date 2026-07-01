import { Agent } from "@openai/agents";
import { filterAlertsTool } from "../tools/filterAlertsTool.js";
import { getTfnswAlertsTool } from "../tools/tfnswTool.js";
import { getUserTransitLinesTool } from "../tools/transitLinesMemoryTool.js";

export const trafficAgent = (config) => {
	return new Agent({
		name: "sydney-traffic-agent",
		instructions: `
You are a Sydney public transport assistant.

Your job:
1. Use the get_user_transit_lines tool to get the user's preferred transit
   lines — a structured list of canonical line codes (e.g. ["T8", "AIRPORT"]).
2. Use tools to fetch real-time TfNSW alerts — call the alerts tool once per
   relevant mode implied by the user's preferred lines (e.g. "train" for
   T-lines, "lightrail" for LIGHTRAIL).
3. Use the filter_relevant_alerts tool, passing the preferred lines list, to
   remove irrelevant alerts.
4. Only respond with relevant disruptions.

Rules:
- If get_user_transit_lines returns an empty list, say: "No transit preferences saved yet."
- If no relevant alerts exist, say: "Today's commute is smooth."
- Be extremely concise
- Do NOT include unrelated Sydney-wide alerts
`,

		tools: [
			getUserTransitLinesTool(config),
			getTfnswAlertsTool(config),
			filterAlertsTool,
		],
	});
};
