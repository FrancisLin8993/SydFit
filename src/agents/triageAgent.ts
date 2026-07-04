import { Agent } from "@openai/agents";
import { getPromptInstructions } from "../services/langfuse.js";
import { saveTransitLinesTool } from "../tools/saveTransitLinesTool.js";
import { saveUserPreferenceTool } from "../tools/saveUserPreferenceTool.js";
import { trafficAgent } from "./trafficAgent.js";
import { weatherAgent } from "./weatherAgent.js";

// Generic fallback, used only if the Langfuse-hosted "triage-agent" prompt
// can't be fetched (missing, not yet labeled "production", network error,
// etc). See getPromptInstructions for why this matters — without a
// fallback, a failed fetch here crashes the entire server at startup. This
// is deliberately short/generic rather than a full duplicate of the curated
// Langfuse prompt, to avoid two copies drifting out of sync.
const FALLBACK_INSTRUCTIONS =
	"You are the front door for a Sydney-based personal assistant. For each message, decide whether the user wants you to remember a preference (call save_transit_lines for transit line preferences, save_preference for anything else), is asking about traffic/transit, or is asking about weather — then hand off to the matching specialist or use the matching tool.";

const instructions = await getPromptInstructions(
	"triage-agent",
	FALLBACK_INSTRUCTIONS,
);

export const triageAgent = (config) =>
	Agent.create({
		name: "sydfit-triage",
		instructions,
		tools: [saveUserPreferenceTool(config), saveTransitLinesTool(config)],
		handoffs: [trafficAgent(config), weatherAgent(config)],
	});
