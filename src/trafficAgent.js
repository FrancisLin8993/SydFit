import OpenAI from "openai";
import { getGcpAuthHeaders } from "./gcpAuth.js";
import { getRelevantMemories } from "./memoryService.js";

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

    const rawText = accumulatedText
      .split("\n")
      .map(line => line.startsWith("data: ") ? line.slice(6) : line)
      .join("\n");

    const cleanData = rawText
      .replace(/\[STATUS\].*?(\r?\n|$)/g, "")
      .replace(/\[RESULT_START\]/g, "")
      .replace(/\[RESULT_END\]/g, "")
      .trim();

    if (containsMcpError(cleanData)) {
      return cleanData || "Transit data error: MCP server returned an error.";
    }

    return cleanData || `No active transport alerts for [${mode}] right now. Everything is running smoothly.`;

  } catch (error) {
    console.error("❌ Failed to call TfNSW MCP Stream (Cloud Run):", error);
    return `Transit data error: Cannot retrieve traffic alert. (${error.message})`;
  }
}

export async function handleTrafficQuery(config, query, mode = "train", options = {}) {
  const client = options.client || new OpenAI();
  const fetcher = options.fetcher || fetch;
  
  console.log(`🚗 [Traffic Agent] Retrieving [${mode}] real-time alert...`);

  const rawAlerts = await fetchTfNSWStreamData(config, mode, fetcher);
  
  const userTransitMemories = await getRelevantMemories(config, `${mode} transport commute sydney`);
  console.log(`🧠 [Memory Bank] Retrieved transit memories for [Francis]:`, userTransitMemories);

  const transitError = buildTransitErrorMessage(rawAlerts);
  if (transitError) return transitError;

  const systemContent = `You are a senior local public transport expert in Sydney.
Your task is to distil the provided raw Transport for NSW real-time alert data into an easy-to-understand commute briefing for the user.

${userTransitMemories ? `CRITICAL - USER PREFERENCES TO OBEY:\nThe user has specified the following personal habits/preferences, historical preferences, or constraints. You MUST align your advice with these memories:\n"${userTransitMemories}"` : ""}

Code of Conduct:
1. If the data indicates everything is normal, tell the user today's commute is smooth.
2. If there are active alerts, clearly list the affected routes or severity, and provide reasonable travel advice.
3. Response must be highly concise with no fluff, perfect for mobile Bark or Apple Shortcuts.`;

  const response = await client.chat.completions.create({
    model: config.openaiModel, // Uses the model specified in the centralized config
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: `User prompt: "${query}"\n\nReal time alert from TfNSW MCP server:\n${rawAlerts}` }
    ]
  });

  return response.choices[0].message.content;
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
    .replace(/\[RESULT_START\]/g, "")
    .replace(/\[RESULT_END\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}