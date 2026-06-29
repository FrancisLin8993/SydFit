import assert from "node:assert/strict";
import { before, mock, test } from "node:test";

mock.module("../src/services/langfuse.js", {
	namedExports: {
		promptClient: {
			prompt: {
				get: async () =>
					`You are an intent router. Determine the intent of the user's message. 
Valid intents: "weather", "traffic".
For traffic, set "modes" to an array of relevant modes from: "train", "bus", "ferry", "lightrail", "metro".
Extract a "preference" string to store if the user asks to remember something.
Return JSON matching the schema.`,
			},
		},
	},
});

let determineIntentAndMode;

const mockConfig = {
	openaiApiKey: "fake-key",
	openaiModel: "gpt-4o-mini",
};

function createMockClient(mockedResponseContent) {
	return {
		chat: {
			completions: {
				create: async () => ({
					choices: [{ message: { content: mockedResponseContent } }],
				}),
			},
		},
	};
}

before(async () => {
	const mod = await import("../src/intentRouter.js");
	determineIntentAndMode = mod.determineIntentAndMode;
});

test("determineIntentAndMode detects explicit traffic mode from prompt", async () => {
	const client = createMockClient(
		'{"intent": "traffic", "modes": ["lightrail"], "preference": null}',
	);

	const result = await determineIntentAndMode(
		mockConfig,
		"is the L2 lightrail delayed?",
		"",
		{ client },
	);

	assert.deepEqual(result, {
		intent: "traffic",
		modes: ["lightrail"],
		preference: null,
	});
});

test("determineIntentAndMode detects weather intent and returns empty modes", async () => {
	const client = createMockClient(
		'{"intent": "weather", "modes": [], "preference": null}',
	);

	const result = await determineIntentAndMode(
		mockConfig,
		"do I need an umbrella today?",
		"",
		{ client },
	);

	assert.deepEqual(result, {
		intent: "weather",
		modes: ["train", "lightrail"],
		preference: null,
	});
});

test("determineIntentAndMode relies on memory for generic traffic queries", async () => {
	let passedMessages = [];

	const client = {
		chat: {
			completions: {
				create: async ({ messages }) => {
					passedMessages = messages;
					return {
						choices: [
							{
								message: {
									content:
										'{"intent": "traffic", "modes": ["ferry"], "preference": null}',
								},
							},
						],
					};
				},
			},
		},
	};

	const result = await determineIntentAndMode(
		mockConfig,
		"check commute",
		"I always take the ferry from Manly",
		{ client },
	);

	assert.deepEqual(result, {
		intent: "traffic",
		modes: ["ferry"],
		preference: null,
	});

	const systemMessage = passedMessages.find((m) => m.role === "system").content;
	assert.match(systemMessage, /I always take the ferry from Manly/);
});

test("determineIntentAndMode safely falls back on OpenAI API error", async (t) => {
	t.mock.method(console, "error", () => {});

	const client = {
		chat: {
			completions: {
				create: async () => {
					throw new Error("OpenAI API Network Timeout");
				},
			},
		},
	};

	const result = await determineIntentAndMode(mockConfig, "traffic", "", {
		client,
	});

	assert.deepEqual(result, {
		intent: "traffic",
		modes: ["train", "lightrail"],
		preference: null,
	});
});

test("determineIntentAndMode safely falls back on JSON parsing failure", async (t) => {
	t.mock.method(console, "error", () => {});

	const client = createMockClient(
		"I am an AI and I don't want to output JSON.",
	);

	const result = await determineIntentAndMode(mockConfig, "traffic", "", {
		client,
	});

	assert.deepEqual(result, {
		intent: "traffic",
		modes: ["train", "lightrail"],
		preference: null,
	});
});

test("determineIntentAndMode system prompt instructs the LLM about the schema", async () => {
	let passedMessages = [];

	const client = {
		chat: {
			completions: {
				create: async ({ messages }) => {
					passedMessages = messages;
					return {
						choices: [
							{
								message: {
									content:
										'{"intent": "traffic", "modes": ["train"], "preference": null}',
								},
							},
						],
					};
				},
			},
		},
	};

	await determineIntentAndMode(mockConfig, "check trains", "", {
		client,
	});

	const systemMessage = passedMessages.find((m) => m.role === "system").content;
	assert.match(systemMessage, /"traffic"/);
	assert.match(systemMessage, /"weather"/);
});
