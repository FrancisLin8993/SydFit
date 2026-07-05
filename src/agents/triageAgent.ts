import { Agent } from "@openai/agents";
import { saveTransitLinesTool } from "../tools/saveTransitLinesTool.js";
import { saveUserPreferenceTool } from "../tools/saveUserPreferenceTool.js";
import { getTransitDisruptionsTool } from "../tools/tfnswTool.js";
import { loadPromptInstructions } from "../utils/prompts.js";
import { weatherAgent } from "./weatherAgent.js";

const instructions = loadPromptInstructions("triage-agent");

// Traffic is a TOOL here, not a handoff: the whole traffic pipeline
// (preferred lines + fetch + filter) is one deterministic tool call, so
// there's no specialist conversation for a separate agent to own — triage
// calls the tool and writes the briefing itself, saving a full LLM
// round-trip per traffic query. Weather stays a handoff because its
// specialist genuinely makes decisions across two dependent tool calls
// (which location to use, then fetching weather for it).
export const triageAgent = (config) =>
	Agent.create({
		name: "sydfit-triage",
		instructions,
		tools: [
			saveUserPreferenceTool(config),
			saveTransitLinesTool(config),
			getTransitDisruptionsTool(config),
		],
		handoffs: [weatherAgent(config)],
	});
