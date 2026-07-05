import { Agent } from "@openai/agents";
import { getTransitDisruptionsTool } from "../tools/tfnswTool.js";
import { loadPromptInstructions } from "../utils/prompts.js";

const instructions = loadPromptInstructions("traffic-advice");

// Used directly by the /api/cron morning briefing. On the /api/ask path,
// traffic queries are handled by the triage agent calling the same
// get_transit_disruptions tool itself — see triageAgent.ts.
export const trafficAgent = (config) => {
	return new Agent({
		name: "sydney-traffic-agent",
		instructions,
		tools: [getTransitDisruptionsTool(config)],
		modelSettings: {
			// Force the single tool call before the model answers — otherwise a
			// vague/short input (e.g. "Alert") can lead it to answer directly
			// without checking the user's lines or current alerts at all.
			toolChoice: "required",
		},
	});
};
