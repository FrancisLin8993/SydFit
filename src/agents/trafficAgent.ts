import { Agent } from "@openai/agents";
import { promptClient } from "../services/langfuse.js";
import { filterAlertsTool } from "../tools/filterAlertsTool.js";
import { getTfnswAlertsTool } from "../tools/tfnswTool.js";
import { getUserTransitLinesTool } from "../tools/transitLinesMemoryTool.js";

const message = await promptClient.prompt.get("traffic-advice");
export const trafficAgent = (config) => {
	return new Agent({
		name: "sydney-traffic-agent",
		instructions: message.compile(),
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
