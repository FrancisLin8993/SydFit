import { Agent } from "@openai/agents";
import { getPromptInstructions } from "../services/langfuse.js";
import { filterAlertsTool } from "../tools/filterAlertsTool.js";
import { getTfnswAlertsTool } from "../tools/tfnswTool.js";
import { getUserTransitLinesTool } from "../tools/transitLinesMemoryTool.js";

// Generic fallback, used only if the Langfuse-hosted "traffic-advice" prompt
// can't be fetched (missing, not yet labeled "production", network error,
// etc). See getPromptInstructions for why this matters — without a
// fallback, a failed fetch here crashes the entire server at startup. This
// is deliberately short/generic rather than a full duplicate of the curated
// Langfuse prompt, to avoid two copies drifting out of sync.
const FALLBACK_INSTRUCTIONS =
	"You are a Sydney public transport assistant. Use your tools to check the user's preferred transit lines and current TfNSW alerts, filter out irrelevant disruptions, and summarize what's relevant to their commute today.";

const instructions = await getPromptInstructions(
	"traffic-advice",
	FALLBACK_INSTRUCTIONS,
);

export const trafficAgent = (config) => {
	return new Agent({
		name: "sydney-traffic-agent",
		instructions,
		tools: [
			getUserTransitLinesTool(config),
			getTfnswAlertsTool(config),
			filterAlertsTool,
		],
		modelSettings: {
			toolChoice: "required",
		},
	});
};
