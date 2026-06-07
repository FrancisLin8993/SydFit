import OpenAI from "openai";

const CF_WORKER_STREAM_URL = "https://transport-nsw-mcp-server.lfc1101.workers.dev/stream";

export async function fetchTfNSWStreamData(mode, fetcher = fetch) {
  try {
    const response = await fetcher(CF_WORKER_STREAM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "get_sydney_transport_alerts",
        arguments: { mode: mode } 
      })
    });

    if (!response.ok) throw new Error(`HTTP Error. Status code: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      accumulatedText += chunk;
    }

    const cleanData = accumulatedText
      .replace(/\[STATUS\].*?\n/g, "")
      .replace(/\[RESULT_START\]\n/, "")
      .replace(/\n\[RESULT_END\]\n/, "");

    return cleanData;
  } catch (error) {
    console.error("❌ Fail to call Cloudflare TfNSW MCP Stream:", error);
    return `Transit data error: Cannot retrieve traffic alert. (${error.message})`;
  }
}

export async function handleTrafficQuery(userPrompt, mode = "train", options = {}) {
  const client = options.client || new OpenAI();
  const fetcher = options.fetcher || fetch;
  console.log(`🚗 [Traffic Agent] Retrieving [${mode}] real time alert...`);
  
  const rawAlerts = await fetchTfNSWStreamData(mode, fetcher);

  console.log(`alert response from TfNSW: `);
  console.log(JSON.stringify(rawAlerts));

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
1. If the data indicates everything is normal, tell the user in a single sentence that today's commute is smooth and clear.
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
  if (!containsMcpError(rawAlerts)) {
    return "";
  }

  return `Transit data error: ${summarizeMcpError(rawAlerts)}`;
}

export function containsMcpError(rawAlerts) {
  return /(^|[^a-z])(?:critical_)?errors?([^a-z]|$)/i.test(String(rawAlerts || ""));
}

export function summarizeMcpError(rawAlerts) {
  return String(rawAlerts || "")
    .replace(/\[STATUS\].*?\n/g, "")
    .replace(/\[RESULT_START\]\n?/g, "")
    .replace(/\n?\[RESULT_END\]\n?/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}
