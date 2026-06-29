import { Agent } from "@openai/agents";
import { promptClient } from "../services/langfuse.js";
import { trafficAgent } from "./trafficAgent.js";
import { weatherAgent } from "./weatherAgent.js";
import { saveUserPreferenceTool } from "../tools/saveUserPreferenceTool.js";
import { writeLog } from "../utils/logger.js";
// CHANGED: replaces the manual determineIntentAndMode() classification call
// + the hand-written if/else in index.ts (old "3.1 Core intent routing" and
// "3.2 Memory storage intent" blocks). This single agent now owns the entire
// routing decision in one Runner.run() call.
//
// Memory-saving is exposed as a TOOL (save_preference) rather than a handoff
// target, since saving a preference is a single side-effecting action the
// triage agent can perform directly and then respond to the user itself —
// it isn't a multi-turn conversation a separate specialist needs to "own".
// Traffic and weather remain real handoffs, since those genuinely benefit
// from a specialist agent with its own focused instructions and tools
// taking over the response.
//
// Use Agent.create (not `new Agent`) so finalOutput's TypeScript type
// correctly reflects the union of possible outputs across the handoff graph.
const message = promptClient.prompt.get("triage-agent");
writeLog("INOF", `triage agent message: ${message}`);
export const triageAgent = (config) => Agent.create({
    name: "sydfit-triage",
    instructions: message,
    tools: [saveUserPreferenceTool(config)],
    handoffs: [trafficAgent(config), weatherAgent(config)],
});
