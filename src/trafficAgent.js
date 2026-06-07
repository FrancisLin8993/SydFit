import OpenAI from "openai";

const openai = new OpenAI();

const CF_WORKER_STREAM_URL = "transport-nsw-mcp-server.lfc1101.workers.dev/stream";

async function fetchTfNSWStreamData(mode) {
  try {
    const response = await fetch(CF_WORKER_STREAM_URL, {
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
    return `Cannot retrieve traffic alert. (${error.message})`;
  }
}

export async function handleTrafficQuery(userPrompt, mode = "train") {
  console.log(`🚗 [Traffic Agent] Retrieving [${mode}] real time alert...`);
  
  const rawAlerts = await fetchTfNSWStreamData(mode);

  const response = await openai.chat.completions.create({
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