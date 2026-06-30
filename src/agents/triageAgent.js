import { Agent } from "@openai/agents";
import { promptClient } from "../services/langfuse.js";
import { trafficAgent } from "./trafficAgent.js";
import { weatherAgent } from "./weatherAgent.js";
import { saveUserPreferenceTool } from "../tools/saveUserPreferenceTool.js";
import { writeLog } from "../utils/logger.js";

const message = promptClient.prompt.get("triage-agent");
writeLog("INOF", `triage agent message: ${message}`);
export const triageAgent = (config) =>
	Agent.create({
		name: "sydfit-triage",
		instructions: message,
		tools: [saveUserPreferenceTool(config)],
		handoffs: [trafficAgent(config), weatherAgent(config)],
	});
