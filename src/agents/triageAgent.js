import { Agent } from "@openai/agents";
import { trafficAgent } from "./trafficAgent.js";
import { weatherAgent } from "./weatherAgent.js";
import { saveUserPreferenceTool } from "../tools/saveUserPreferenceTool.js";

// CHANGED: replaces the manual determineIntentAndMode() classification call
// + the hand-written if/else in index.ts (old "3.1 Core intent routing" and
// "3.2 Memory storage intent" blocks). This single agent now owns the entire
// routing decision in one Runner.run() call.
//
// Memory-saving is exposed as a TOOL (save_preference) rather than a handoff
// target, since saving a preference is a single side-effecting action the
// triage agent can perform directly and then respond to the user itself —
// it isn't a multi-turn conversation a separate specialist needs to "own".
// Traffic and weather remain real handoffs, since those genuinely benefit
// from a specialist agent with its own focused instructions and tools
// taking over the response.
//
// Use Agent.create (not `new Agent`) so finalOutput's TypeScript type
// correctly reflects the union of possible outputs across the handoff graph.
export const triageAgent = (config) =>
	Agent.create({
		name: "sydfit-triage",

		instructions: `
You are the front door for SydFit, a Sydney-based personal assistant.

For every incoming message, decide one of three things:

1. MEMORY — The user wants you to remember a personal preference, habit, or
   instruction for future use (not asking a question right now, but
   informing you about themselves for later). Trigger phrases: "remember
   that...", "I prefer...", "from now on...", "I always...", "note that
   I...", "I hate...", "don't forget...".
   -> Extract a clean, third-person, standalone preference statement from
      their message, then call save_preference with it. After it succeeds,
      reply with a short confirmation like "Got it, I'll remember that."
      A genuine real-time question (e.g. "is the train delayed?", "will it
      rain?") is NOT a memory request, even if it mentions a preference.

2. TRAFFIC — The user is asking about transit, traffic, commute, delays, or
   transport network status. If user mention just "Alert", it will be a traffic request.
   -> Hand off to the traffic specialist.

3. WEATHER — The user is asking about weather, clothing, outfit, rain,
   temperature, or what to wear.
   -> Hand off to the weather specialist.

Be decisive — pick exactly one path per message. Do not ask the user which
category they meant unless the message is genuinely ambiguous after
considering all three options.
`,

		tools: [saveUserPreferenceTool(config)],
		handoffs: [trafficAgent(config), weatherAgent(config)],
	});