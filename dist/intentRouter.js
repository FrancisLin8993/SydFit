import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { withHeadroom } from "headroom-ai/openai";
import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";
import { promptClient } from "./langfuse.js";
import { writeLog } from "./utils/logger.js";
const IntentRouterSchema = z.object({
    intent: z.enum(["traffic", "weather"]),
    modes: z.array(z.enum(["train", "metro", "lightrail", "bus", "ferry"])),
    preference: z.string().nullable(),
});
export async function determineIntentAndMode(config, userPrompt, userMemory, options = {}) {
    const client = options.client ||
        observeOpenAI(withHeadroom(new OpenAI({ apiKey: config.openaiApiKey })), {
            generationName: "intent-router",
            userId: "francis",
        });
    const systemPrompt = await promptClient.prompt.get("intent-router");
    const memoryContext = userMemory
        ? `\n\nUser Transit Preference: ${userMemory}`
        : "";
    try {
        const response = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: systemPrompt + memoryContext,
                },
                {
                    role: "user",
                    content: `User Prompt: "${userPrompt}"`,
                },
            ],
            response_format: zodResponseFormat(IntentRouterSchema, "intent_router"),
            temperature: 0.1,
        });
        writeLog("INFO", `[Intent Router] Token usage: ${response.usage?.total_tokens ?? "N/A"}`);
        const result = IntentRouterSchema.parse(JSON.parse(response.choices[0].message.content));
        if (!result.modes.length) {
            result.modes = ["train", "lightrail"];
        }
        return result;
    }
    catch (error) {
        writeLog("ERROR", "❌ LLM Router failed, falling back to safe default:", error);
        return {
            intent: "traffic",
            modes: ["train", "lightrail"],
            preference: null,
        };
    }
}
