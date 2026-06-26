import { withHeadroom } from 'headroom-ai/openai';
import OpenAI from "openai";

export const openaiClient = withHeadroom(new OpenAI({
      apiKey: config.openaiApiKey
}));