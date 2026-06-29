import { withHeadroom } from "headroom-ai/openai";
import OpenAI from "openai";
import { loadConfig } from "./config.js";

const config = loadConfig();

export const openaiClient = withHeadroom(
	new OpenAI({
		apiKey: config.openaiApiKey,
	}),
);
