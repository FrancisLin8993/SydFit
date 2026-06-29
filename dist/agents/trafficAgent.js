import { Agent } from "@openai/agents";
import { filterAlertsTool } from "../tools/filterAlertsTool.js";
import { getUserMemoryTool } from "../tools/memoryTool.js";
import { getTfnswAlertsTool } from "../tools/tfnswTool.js";
export const trafficAgent = (config) => {
    return new Agent({
        name: "sydney-traffic-agent",
        instructions: `
You are a Sydney public transport assistant.

Your job:
1. Use tools to get user transit preferences
2. Use tools to fetch real-time TfNSW alerts — call the alerts tool once per
   relevant mode found in the user's transit memory (e.g. once for "train",
   once for "lightrail" if both are relevant)
3. Use filtering tool to remove irrelevant alerts
4. Only respond with relevant disruptions

Rules:
- If no relevant alerts exist, say: "Today's commute is smooth."
- Be extremely concise
- Do NOT include unrelated Sydney-wide alerts
`,
        tools: [
            getUserMemoryTool(config),
            getTfnswAlertsTool(config),
            filterAlertsTool
        ],
    });
};
