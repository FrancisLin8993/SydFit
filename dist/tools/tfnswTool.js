import { z } from "zod";
import { tool } from "@openai/agents";
import { getGcpAuthHeaders } from "../gcpAuth.js";
import { writeLog } from "../logger.js";
export const getTfnswAlertsTool = (config) => tool({
    name: "get_tfnsw_alerts",
    description: "Fetches real-time Transport for NSW (TfNSW) service alerts for a single transport mode. Call this once per relevant mode (e.g. once for 'train', once for 'lightrail') if the user commutes on multiple modes.",
    parameters: z.object({
        mode: z
            .enum(["train", "metro", "lightrail", "bus", "ferry", "all"])
            .describe("The transport mode to fetch alerts for."),
    }),
    execute: async ({ mode }) => {
        const mcpServerUrl = config.mcpServerUrl;
        const fetchUrl = `${mcpServerUrl}/alerts`;
        writeLog("INFO", "[Tool] Fetch TfNSW alerts", { mode });
        const response = await fetch(fetchUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Worker-Token": config.mcpAccessToken,
                ...(await getGcpAuthHeaders(mcpServerUrl)),
            },
            body: JSON.stringify({
                method: "get_sydney_transport_alerts",
                arguments: { mode },
            }),
        });
        if (!response.ok) {
            throw new Error(`TfNSW tool failed: ${response.status}`);
        }
        return await response.json();
    },
});
