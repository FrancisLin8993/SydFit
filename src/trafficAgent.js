import { withHeadroom } from 'headroom-ai/openai';
import OpenAI from "openai";
import { getGcpAuthHeaders } from "./gcpAuth.js";
import { getRelevantMemories } from "./memoryService.js";
import { writeLog } from "./logger.js";

/**
 * Fetches raw alerts stream from the TfNSW MCP server
 */
export async function fetchTfNSWStreamData(config, mode, fetcher = fetch) {
  try {
    const mcpServerUrl = config.mcpServerUrl;
    if (!mcpServerUrl) {
      throw new Error("MCP Server URL is missing in configuration.");
    }

    const mcpAccessToken = config.mcpAccessToken;
    if (!mcpAccessToken) {
      throw new Error("MCP Access Token is missing in configuration.");
    }

    const gcpAuthHeaders = await getGcpAuthHeaders(mcpServerUrl);
    const fetchUrl = `${mcpServerUrl}/stream`;
    
    writeLog("INFO", "Fetching TfNSW stream alerts via MCP server", { url: fetchUrl, mode });

    const response = await fetcher(fetchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Token": mcpAccessToken,
        ...gcpAuthHeaders
      },
      body: JSON.stringify({
        method: "get_sydney_transport_alerts",
        arguments: { mode: mode }
      })
    });

    if (response.status === 401) {
      throw new Error("MCP server rejected request: invalid or missing token.");
    }
    if (!response.ok) throw new Error(`HTTP Error. Status code: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulatedText += decoder.decode(value, { stream: true });
    }

    writeLog("INFO", "TfNSW stream alerts fetched successfully", { responseLength: accumulatedText.length });
    return accumulatedText;
  } catch (error) {
    writeLog("ERROR", "Failed to fetch TfNSW alerts", { error: error.message });
    throw error;
  }
}

/**
 * Handles the traffic query, pulls real-time alerts, and filters them strictly based on user memory
 */
export async function handleTrafficQuery(config, query, userTransitMemories) {
  const mcpServerUrl = config.mcpServerUrl;
  if (!mcpServerUrl) {
    writeLog("WARNING", "TfNSW MCP Server is not configured. Returning fallback response.");
    return "TfNSW MCP Server is not configured. Real-time alerts are unavailable.";
  }

  writeLog("INFO", "Analyzing traffic alerts with user travel preferences", { query, hasMemories: !!userTransitMemories });

  // 1. Fetch raw alerts for 'all' to ensure no relevant alert is missed during filtering
  const rawAlerts = await fetchTfNSWStreamData(config, "all");

  if (containsMcpError(rawAlerts)) {
    writeLog("ERROR", "MCP Stream response contains system or connection errors", { rawAlerts });
    return rawAlerts; 
  }

  // 2. Process with OpenAI and inject transit memories to filter and generate recommendations
  const client = new OpenAI({ apiKey: config.openaiApiKey });

  const systemContent = `You are an expert Sydney transit assistant. Your task is to analyze real-time TfNSW alerts and provide a highly personalized, brief, and actionable commute report.
Today's date and context are Sydney, Australia.

${userTransitMemories ? `The user has some personal travel habits/preferences, historical preferences, or constraints. You MUST strictly align your advice with these memories:\n"${userTransitMemories}"` : ""}

CRITICAL FILTER RULE:
1. You must cross-reference the incoming real-time TfNSW alerts with the user's transit memories.
2. ONLY report on or discuss alerts that directly affect the transit lines, routes, stations, or transit modes (e.g., T8 Airport Line, Mascot Station, City Circle, specific train lines) that the user commutes on according to their transit memories.
3. If an alert is completely unrelated to their routes, lines, stations, or modes (for example, a bus alert when the user only takes the T8 train, or a light rail alert on a completely different line), you MUST silently ignore it.
4. If there are active alerts in Sydney but NONE of them are relevant to the user's commute preferences, do NOT mention them. Instead, state that their commute is smooth.

Code of Conduct:
1. If the data indicates everything is normal, or if there are no active alerts relevant to the user's transit memories, tell the user today's commute is smooth (e.g., "Today's commute is smooth. No active alerts affect your route.").
2. If there are relevant active alerts, clearly list the affected routes or severity, and provide reasonable travel advice.
3. Response must be highly concise with no fluff, perfect for mobile Bark or Apple Shortcuts.`;

  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: `User prompt: "${query}"\n\nReal time alert from TfNSW MCP server:\n${rawAlerts}` }
    ]
  });

  writeLog("INFO", `[Traffic Agent] Token usage: ${response.usage.total_tokens}`);


  const adviceResult = response.choices[0].message.content;
  writeLog("INFO", "Successfully generated filtered transit advice", { adviceLength: adviceResult.length });

  return adviceResult;
}

export function buildTransitErrorMessage(rawAlerts) {
  if (!containsMcpError(rawAlerts)) return "";
  return `Transit data error: ${summarizeMcpError(rawAlerts)}`;
}

export function containsMcpError(rawAlerts) {
  const s = String(rawAlerts || "");
  return (
    /\[ERROR\]|\[CRITICAL_ERROR\]/i.test(s) ||
    /^TfNSW API error:/im.test(s) ||
    /^Transit data error:/im.test(s)
  );
}

export function summarizeMcpError(rawAlerts) {
  return String(rawAlerts || "")
    .replace(/\[STATUS\].*?(\r?\n|$)/g, "")
    .trim();
}