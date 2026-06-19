import OpenAI from "openai";

const MCP_SERVER_STREAM_URL = process.env.MCP_SERVER_URL;

export async function fetchTfNSWStreamData(mode, fetcher = fetch) {
  try {
    if (!MCP_SERVER_STREAM_URL) {
      throw new Error("MCP_SERVER_URL environment variable is not set");
    }

    const workerToken = process.env.WORKER_ACCESS_TOKEN;
    if (!workerToken) {
      throw new Error("WORKER_ACCESS_TOKEN environment variable is not set");
    }

    const response = await fetcher(MCP_SERVER_STREAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Token": workerToken,
      },
      body: JSON.stringify({
        method: "get_sydney_transport_alerts",
        arguments: { mode: mode }
      })
    });

    if (response.status === 401) {
      throw new Error("MCP server rejected request: invalid or missing token");
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
    console.error("❌ Fail to call TfNSW MCP Stream (Cloud Run):", error);
    return `Transit data error: Cannot retrieve traffic alert. (${error.message})`;
  }
}

export async function handleTrafficQuery(userPrompt, mode = "train", options = {}) {
  const client = options.client || new OpenAI();
  const fetcher = options.fetcher || fetch;
  console.log(`🚗 [Traffic Agent] Retrieving [${mode}] real time alert...`);

  const rawAlerts = await fetchTfNSWStreamData(mode, fetcher);
  console.log(`[Traffic Agent] Alert content parsed:`, JSON.stringify(rawAlerts));

  const transitError = buildTransitErrorMessage(rawAlerts);
  if (transitError) {
    return transitError;
  }

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a senior local public transport expert in Sydney.
Your task is to distil the provided raw Transport for NSW real-time alert data into an easy-to-understand commute briefing for the user.

Code of Conduct:
1. If the data indicates everything is normal (e.g., no alerts found or explicitly states running smoothly), tell the user in a single sentence that today's commute is smooth and clear.
2. If there are active alerts (e.g., delays, trackwork), clearly list the affected routes or the level of severity, and provide reasonable travel advice (e.g., suggesting switching to buses or leaving early).
3. The response must be highly concise with no fluff, ensuring it is perfectly suited for reading in mobile Bark push notifications or Apple Shortcuts.`
      },
      {
        role: "user",
        content: `User prompt: "${userPrompt}"\n\nReal time alert from TfNSW MCP server:\n${rawAlerts}`
      }
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