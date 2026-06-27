import assert from "node:assert/strict";
import { before, mock, test } from "node:test";

mock.module("../src/config.js", {
	namedExports: {
		loadConfig: () => ({
			openaiApiKey: "fake-key",
			openaiModel: "gpt-4o-mini",
		}),
	},
});

const mockCreate = mock.fn();
mock.module("openai", {
	defaultExport: class OpenAI {
		chat = { completions: { create: mockCreate } };
	},
});

let extractOutputText;
let buildRecommendationInput;
let generateClothingRecommendation;

before(async () => {
	const mod = await import("../src/weatherAgent.js");
	extractOutputText = mod.extractOutputText;
	buildRecommendationInput = mod.buildRecommendationInput;
	generateClothingRecommendation = mod.generateClothingRecommendation;
});

const config = {
	openaiApiKey: "openai-key",
	openaiModel: "gpt-5.4-mini",
};

test("extractOutputText reads response.output_text", () => {
	assert.equal(
		extractOutputText({ output_text: " Wear a jacket. " }),
		" Wear a jacket. ",
	);
});

test("extractOutputText joins nested output text content", () => {
	assert.equal(
		extractOutputText({
			output: [
				{
					content: [
						{ type: "output_text", text: "Wear a jumper." },
						{ type: "refusal", text: "ignored" },
					],
				},
				{
					content: [{ type: "output_text", text: "Take sunglasses." }],
				},
			],
		}),
		"Wear a jumper.\nTake sunglasses.",
	);
});

test("generateClothingRecommendation sends request and returns trimmed text", async () => {
	mockCreate.mock.mockImplementation(async () => ({
		choices: [{ message: { content: "Light jacket and sneakers." } }],
	}));

	const recommendation = await generateClothingRecommendation(
		config,
		"weather",
		{ condition: "Clear sky" },
	);

	assert.equal(recommendation, "Light jacket and sneakers.");
	assert.equal(mockCreate.mock.calls.length, 1);
	const callArgs = mockCreate.mock.calls[0].arguments[0];
	assert.equal(callArgs.model, "gpt-5.4-mini");
});

test("generateClothingRecommendation includes optional user prompt", async () => {
	mockCreate.mock.mockImplementation(async ({ messages }) => {
		const userMessage = messages.find((m) => m.role === "user");
		assert.match(
			userMessage.content,
			/User context or request from iPhone Shortcut/,
		);
		assert.match(userMessage.content, /office day, dinner after work/);
		return {
			choices: [{ message: { content: "Wear office layers." } }],
		};
	});

	await generateClothingRecommendation(
		config,
		"office day, dinner after work",
		{},
	);
});

test("buildRecommendationInput omits empty user prompt", () => {
	const input = buildRecommendationInput({ condition: "Clear sky" }, "");
	assert.match(input, /Clear sky/);
	assert.doesNotMatch(input, /User context or request/);
});

test("generateClothingRecommendation throws on failed OpenAI response", async () => {
	mockCreate.mock.mockImplementation(async () => {
		throw new Error("401 Unauthorized: bad key");
	});

	await assert.rejects(
		() => generateClothingRecommendation(config, "", {}),
		/401 Unauthorized: bad key/,
	);
});

test("generateClothingRecommendation throws when no output text is present", async () => {
	mockCreate.mock.mockImplementation(async () => ({
		choices: [{ message: {} }],
	}));

	await assert.rejects(
		() => generateClothingRecommendation(config, "", {}),
		/Cannot read properties of undefined/,
	);
});
