import assert from "node:assert/strict";
import test from "node:test";

import { getUserLocationMemoryTool } from "../src/tools/locationMemoryTool.js";
import { saveTransitLinesTool } from "../src/tools/saveTransitLinesTool.js";
import { saveUserPreferenceTool } from "../src/tools/saveUserPreferenceTool.js";
import { getTransitDisruptionsTool } from "../src/tools/tfnswTool.js";
import { getWeatherTool } from "../src/tools/weatherTool.js";
import { loadPromptInstructions } from "../src/utils/prompts.js";

// These tests load the real prompt files and the real tool definitions —
// deliberately unmocked. They exist to catch prompt/code drift: renaming a
// tool without updating the prompt that tells the model to call it
// repeatedly broke the hosted-prompt setup this replaced.

test("all prompt files load and are non-empty", () => {
	for (const name of [
		"triage-agent",
		"traffic-advice",
		"weather-advice",
	] as const) {
		const content = loadPromptInstructions(name);
		assert.ok(content.length > 0, `${name} prompt should not be empty`);
	}
});

test("loadPromptInstructions rejects unknown prompt names", () => {
	assert.throws(
		() => loadPromptInstructions("not-a-prompt" as never),
		/Unknown prompt/,
	);
});

test("triage-agent prompt references every triage tool by its real name", () => {
	const prompt = loadPromptInstructions("triage-agent");
	const toolNames = [
		saveUserPreferenceTool({}).name,
		saveTransitLinesTool({}).name,
		getTransitDisruptionsTool({}).name,
	];

	for (const name of toolNames) {
		assert.ok(
			prompt.includes(name),
			`triage-agent prompt should mention tool "${name}"`,
		);
	}
});

test("traffic-advice prompt references the disruptions tool by its real name", () => {
	const prompt = loadPromptInstructions("traffic-advice");
	assert.ok(prompt.includes(getTransitDisruptionsTool({}).name));
});

test("weather-advice prompt references both weather tools by their real names", () => {
	const prompt = loadPromptInstructions("weather-advice");
	assert.ok(prompt.includes(getUserLocationMemoryTool({}).name));
	assert.ok(prompt.includes(getWeatherTool({}).name));
});
