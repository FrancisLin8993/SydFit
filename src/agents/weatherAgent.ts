import { Agent } from "@openai/agents";
import { promptClient } from "../services/langfuse.js";
import { getUserLocationMemoryTool } from "../tools/locationMemoryTool.js";
import { getWeatherTool } from "../tools/weatherTool.js";

const message = await promptClient.prompt.get("weather-advice");
export const weatherAgent = (config) => {
	return new Agent({
		name: "sydney-weather-agent",
		instructions: message.compile(),
		tools: [getUserLocationMemoryTool(config), getWeatherTool(config)],
		modelSettings: {
			toolChoice: "required",
		},
	});
};
