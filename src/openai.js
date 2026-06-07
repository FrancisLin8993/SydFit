export async function generateClothingRecommendation(config, weather, fetcher = fetch) {
  const userInput = buildRecommendationInput(weather, config.userPrompt);
  const response = await fetcher("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.openaiModel,
      instructions:
        "You write concise, practical morning clothing recommendations for someone in Sydney. Mention layers, rain gear, sun protection, and footwear only when relevant. Keep the message under 450 characters and make it suitable for a phone push notification.",
      input: userInput,
      max_output_tokens: 160
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI Responses API request failed: ${response.status} ${response.statusText} ${details}`);
  }

  const data = await response.json();
  const text = extractOutputText(data);

  if (!text) {
    throw new Error("OpenAI response did not include output text.");
  }

  return text.trim();
}

export function buildRecommendationInput(weather, userPrompt = "") {
  const parts = [`Create today's clothing recommendation from this weather JSON:\n${JSON.stringify(weather, null, 2)}`];
  const trimmedPrompt = userPrompt.trim();

  if (trimmedPrompt) {
    parts.push(
      `User context or request from iPhone Shortcut:\n${trimmedPrompt}\nUse this context when deciding what to recommend.`
    );
  }

  return parts.join("\n\n");
}

export function extractOutputText(response) {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  return response.output
    ?.flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text)
    .join("\n");
}
