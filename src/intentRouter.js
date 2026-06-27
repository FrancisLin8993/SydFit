import { withHeadroom } from "headroom-ai/openai";
import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";
import { promptClient } from "./langfuse.js";
import { writeLog } from "./logger.js";

export async function determineIntentAndMode(
	config,
	userPrompt,
	userMemory,
	options = {},
) {
	const client =
		options.client ||
		observeOpenAI(withHeadroom(new OpenAI({ apiKey: config.openaiApiKey })), {
			generationName: "intent-router",
			userId: "francis",
		});

	const systemPrompt = await promptClient.prompt.get("intent-router");

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
