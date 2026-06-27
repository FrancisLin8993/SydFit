import assert from "node:assert/strict";
import { before, mock, test } from "node:test";

mock.module("../src/langfuse.js", {
	namedExports: {
		promptClient: {
			prompt: {
				get: async () =>
					`You are an intent router. Determine the intent of the user's message. 
Valid intents: "weather", "traffic", "memory".
For traffic, set "mode" to one of: "train", "bus", "ferry", "lightrail", "metro".
For memory, extract a "preference" string to store.
Return JSON: {"intent": "...", "mode": null|"...", "preference": null|"..."}`,
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
		'{"intent": "traffic", "mode": "lightrail", "preference": null}',
	);

	const result = await determineIntentAndMode(
		mockConfig,
		"is the L2 lightrail delayed?",
		"",
		{ client },
	);

	assert.deepEqual(result, {
		intent: "traffic",
		mode: "lightrail",
		preference: null,
	});
});

test("determineIntentAndMode detects weather intent and returns null mode", async () => {
	const client = createMockClient(
		'{"intent": "weather", "mode": null, "preference": null}',
	);

	const result = await determineIntentAndMode(
		mockConfig,
		"do I need an umbrella today?",
		"",
		{ client },
	);

	assert.deepEqual(result, { intent: "weather", mode: null, preference: null });
});

test("determineIntentAndMode relies on memory for generic traffic queries", async (t) => {
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
										'{"intent": "traffic", "mode": "ferry", "preference": null}',
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
		"I always take the ferry from Manly", // 传入记忆
		{ client },
	);

	assert.deepEqual(result, {
		intent: "traffic",
		mode: "ferry",
		preference: null,
	});

	// 断言：大模型的 System Prompt 中确实包含了我们给它的记忆
	const systemMessage = passedMessages.find((m) => m.role === "system").content;
	assert.match(systemMessage, /I always take the ferry from Manly/);
});

test("determineIntentAndMode safely falls back to train on OpenAI API error", async (t) => {
	t.mock.method(console, "error", () => {}); // 屏蔽控制台报错输出

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
		mode: "train",
		preference: null,
	});
});

test("determineIntentAndMode safely falls back to train on JSON parsing failure", async (t) => {
	t.mock.method(console, "error", () => {});

	const client = createMockClient(
		"I am an AI and I don't want to output JSON.",
	);

	const result = await determineIntentAndMode(mockConfig, "traffic", "", {
		client,
	});

	assert.deepEqual(result, {
		intent: "traffic",
		mode: "train",
		preference: null,
	});
});

test("determineIntentAndMode detects memory intent and extracts a clean preference", async () => {
	const client = createMockClient(
		'{"intent": "memory", "mode": null, "preference": "I like cold coffee"}',
	);

	const result = await determineIntentAndMode(
		mockConfig,
		"remember that I like cold coffee",
		"",
		{ client },
	);

	assert.deepEqual(result, {
		intent: "memory",
		mode: null,
		preference: "I like cold coffee",
	});
});

test("determineIntentAndMode returns empty preference when memory intent has nothing to store", async () => {
	const client = createMockClient(
		'{"intent": "memory", "mode": null, "preference": ""}',
	);

	const result = await determineIntentAndMode(mockConfig, "remember", "", {
		client,
	});

	assert.deepEqual(result, { intent: "memory", mode: null, preference: "" });
});

test("determineIntentAndMode system prompt instructs the LLM about the memory intent and preference extraction", async () => {
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
										'{"intent": "memory", "mode": null, "preference": "I take the ferry"}',
								},
							},
						],
					};
				},
			},
		},
	};

	await determineIntentAndMode(mockConfig, "from now on I take the ferry", "", {
		client,
	});

	const systemMessage = passedMessages.find((m) => m.role === "system").content;
	// 确保路由提示词中明确包含 memory 意图与 preference 抽取规则
	assert.match(systemMessage, /"memory"/);
	assert.match(systemMessage, /preference/);
});
