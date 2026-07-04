import { Agent } from "@openai/agents";
import { getPromptInstructions } from "../services/langfuse.js";
import { getUserLocationMemoryTool } from "../tools/locationMemoryTool.js";
import { getWeatherTool } from "../tools/weatherTool.js";

// Generic fallback, used only if the Langfuse-hosted "weather-advice" prompt
// can't be fetched (missing, not yet labeled "production", network error,
// etc). See getPromptInstructions for why this matters — without a
// fallback, a failed fetch here crashes the entire server at startup. This
// is deliberately short/generic rather than a full duplicate of the curated
// Langfuse prompt, to avoid two copies drifting out of sync.
const FALLBACK_INSTRUCTIONS =
	"You are a Sydney weather and clothing advisor. Use your tools to check the user's preferred location and the current weather, then give a concise, practical clothing recommendation.";

const instructions = await getPromptInstructions(
	"weather-advice",
	FALLBACK_INSTRUCTIONS,
);

export const weatherAgent = (config) => {
	return new Agent({
		name: "sydney-weather-agent",
		instructions,
		tools: [getUserLocationMemoryTool(config), getWeatherTool(config)],
		modelSettings: {
			toolChoice: "required",
		},
	});
};
