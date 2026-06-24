import OpenAI from "openai";
import { writeLog } from './logger.js';

export async function determineIntentAndMode(config, userPrompt, transportMemory, options = {}) {
  const client = options.client || new OpenAI({ apiKey: config.openaiApiKey });

  const systemPrompt = `You are the core routing brain for SydFit, a Sydney-based personal assistant.
Your task is to analyze the user's current prompt and their historical transit preferences to route the request.

User's historical transit memory from Qdrant: "${transportMemory || 'None'}"

You must determine two things:
1. "intent": Is the user asking about transit/traffic/commute ("traffic"), or weather/clothing/outfit ("weather")?
2. "mode": If the intent is "traffic", determine the specific public transport mode. Choose exactly ONE from: "train", "metro", "lightrail", "bus", "ferry". 
   - Rule 1: If the user explicitly mentions a mode in their prompt, use it.
   - Rule 2: If the user just says "check commute", "traffic" or similar general terms, strictly use their historical transit memory to decide the mode.
   - Rule 3: If neither provides a clue, default to "train".
   - Rule 4: If intent is "weather", mode should be null.

Constraint: You MUST respond in pure JSON format matching this schema:
{ "intent": "traffic" | "weather", "mode": "train" | "metro" | "lightrail" | "bus" | "ferry" | null }`;

  try {
    const response = await client.chat.completions.create({
      model: config.openaiModel || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `User Prompt: "${userPrompt}"` }
      ],
      temperature: 0.1
    });

    const result = JSON.parse(response.choices[0].message.content);
    return result;
  } catch (error) {
    writeLog("ERROR", "❌ LLM Router failed, falling back to safe default:", error);
    return { intent: "traffic", mode: "train" }; 
  }
}