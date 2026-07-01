import { Agent } from "@openai/agents";
import { promptClient } from "../services/langfuse.js";
import { saveUserPreferenceTool } from "../tools/saveUserPreferenceTool.js";
import { writeLog } from "../utils/logger.js";
import { trafficAgent } from "./trafficAgent.js";
import { weatherAgent } from "./weatherAgent.js";

const message = await promptClient.prompt.get("triage-agent");
writeLog("INFO", `triage agent message: ${JSON.stringify(message)}`);
export const triageAgent = (config) =>
	Agent.create({
		name: "sydfit-triage",
		instructions: message.compile(),
		tools: [saveUserPreferenceTool(config)],
		handoffs: [trafficAgent(config), weatherAgent(config)],
	});
