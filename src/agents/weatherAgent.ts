import { Agent } from "@openai/agents";
import { getUserLocationMemoryTool } from "../tools/locationMemoryTool.js";
import { getWeatherTool } from "../tools/weatherTool.js";
import { loadPromptInstructions } from "../utils/prompts.js";

const instructions = loadPromptInstructions("weather-advice");

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
