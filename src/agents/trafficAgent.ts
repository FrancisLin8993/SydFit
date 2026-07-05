import { Agent } from "@openai/agents";
import { getPromptInstructions } from "../services/langfuse.js";
import { getTransitDisruptionsTool } from "../tools/tfnswTool.js";

// Generic fallback, used only if the Langfuse-hosted "traffic-advice" prompt
// can't be fetched (missing, not yet labeled "production", network error,
// etc). See getPromptInstructions for why this matters — without a
// fallback, a failed fetch here crashes the entire server at startup. This
// is deliberately short/generic rather than a full duplicate of the curated
// Langfuse prompt, to avoid two copies drifting out of sync.
const FALLBACK_INSTRUCTIONS =
	"You are a Sydney public transport assistant. Call get_transit_disruptions to fetch the user's relevant transit alerts, then summarize what matters for their commute today. If preferred_lines is empty, say no transit preferences are saved yet; if there are no relevant alerts, say the commute is smooth.";

const instructions = await getPromptInstructions(
	"traffic-advice",
	FALLBACK_INSTRUCTIONS,
);

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
