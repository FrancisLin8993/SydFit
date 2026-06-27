import { withHeadroom } from "headroom-ai/openai";
import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";
import { writeLog } from "./logger.js";

export async function determineIntentAndMode(
	config,
	userPrompt,
	transportMemory,
	options = {},
) {
	const client =
		options.client ||
		observeOpenAI(withHeadroom(new OpenAI({ apiKey: config.openaiApiKey })), {
			generationName: "intent-router",
			userId: "francis",
		});

	const systemPrompt = `You are the core routing brain for SydFit, a Sydney-based personal assistant.
Your task is to analyze the user's current prompt and their historical transit preferences to route the request.

User's historical transit memory from Qdrant: "${transportMemory || "None"}"

You must determine the user's intent and route accordingly. Choose exactly ONE intent:

1. "memory" — The user wants to save, remember, store, note, or set a personal preference, fact, habit, or instruction for future use. Trigger phrases include "remember", "note that", "from now on", "I prefer", "I always", "I hate", "save", "don't forget", etc. Examples: "remember that I prefer cold coffee", "I always take the bus to work", "note that I'm vegetarian", "from now on recommend a jacket under 15 degrees".
   IMPORTANT: A genuine real-time question (e.g. "is the train delayed?", "will it rain?") is NOT a memory intent, even if it mentions a preference. Only choose "memory" when the primary goal is to store information for later.
2. "traffic" — The user is asking about transit, traffic, commute, delays, or transport network status.
3. "weather" — The user is asking about weather, clothing, outfit, rain, temperature, or what to wear.

You must also determine:
- "mode": Only meaningful when intent is "traffic". Choose exactly ONE from: "train", "metro", "lightrail", "bus", "ferry".
   - Rule 1: If the user explicitly mentions a mode in their prompt, use it.
   - Rule 2: If the user just says "check commute", "traffic" or similar general terms, strictly use their historical transit memory to decide the mode.
   - Rule 3: If neither provides a clue, default to "train".
   - Rule 4: If intent is "weather" or "memory", mode must be null.
- "preference": Only meaningful when intent is "memory". Extract the actual preference the user wants remembered as a clean, concise, self-contained statement in the user's own language (e.g. turn "remember that I like cold coffee" into "I like cold coffee"; turn "from now on I take the ferry" into "I take the ferry"). If intent is not "memory", this must be null. If intent is "memory" but no concrete preference can be extracted, return an empty string "".

Constraint: You MUST respond in pure JSON format matching this schema:
{ "intent": "traffic" | "weather" | "memory", "mode": "train" | "metro" | "lightrail" | "bus" | "ferry" | null, "preference": "string | null" }`;

	try {
		const response = await client.chat.completions.create({
			model: config.openaiModel || "gpt-4o-mini",
			response_format: { type: "json_object" },
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: `User Prompt: "${userPrompt}"` },
			],
			temperature: 0.1,
		});

		writeLog(
			"INFO",
			`[Intent Router] Token usage: ${response.usage?.total_tokens ?? "N/A"}`,
		);

		const result = JSON.parse(response.choices[0].message.content);
		return result;
	} catch (error) {
		writeLog(
			"ERROR",
			"❌ LLM Router failed, falling back to safe default:",
			error,
		);
		return { intent: "traffic", mode: "train", preference: null };
	}
}
