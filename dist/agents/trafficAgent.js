import { Agent } from "@openai/agents";
import { filterAlertsTool } from "../tools/filterAlertsTool.js";
import { getUserTransitMemory } from "../tools/memoryTool.js";
import { getTfnswAlerts } from "../tools/tfnswTool.js";
export const createTrafficAgent = (config) => {
    return new Agent({
        name: "sydney-traffic-agent",
        instructions: `
You are a Sydney public transport assistant.

Your job:
1. Use tools to get user transit preferences
2. Use tools to fetch real-time TfNSW alerts
3. Use filtering tool to remove irrelevant alerts
4. Only respond with relevant disruptions

Rules:
- If no relevant alerts exist, say: "Today's commute is smooth."
- Be extremely concise
- Do NOT include unrelated Sydney-wide alerts
`,
        tools: [
            {
                ...getUserTransitMemoryTool,
                execute: (args) => getUserTransitMemoryTool.execute({
                    ...args,
                    config,
                }),
            },
            {
                ...getTfnswAlertsTool,
                execute: (args) => getTfnswAlertsTool.execute({
                    ...args,
                    config,
                }),
            },
            filterAlertsTool,
        ],
    });
};
