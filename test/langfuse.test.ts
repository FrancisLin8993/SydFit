import assert from "node:assert/strict";
import { before, beforeEach, describe, it, mock } from "node:test";

const mockPromptGet = mock.fn();
class MockLangfuseClient {
	prompt = { get: mockPromptGet };
}
mock.module("@langfuse/client", {
	exports: { LangfuseClient: MockLangfuseClient },
});

const mockWriteLog = mock.fn();
mock.module("../src/utils/logger.js", {
	exports: { writeLog: mockWriteLog },
});

describe("getPromptInstructions", () => {
	let getPromptInstructions: any;
	const originalPublicKey = process.env.LANGFUSE_PUBLIC_KEY;
	const originalSecretKey = process.env.LANGFUSE_SECRET_KEY;

	before(async () => {
		// Force the "tracing disabled" branch regardless of the ambient
		// environment, so this test never tries to start a real OpenTelemetry
		// SDK / Langfuse span processor.
		delete process.env.LANGFUSE_PUBLIC_KEY;
		delete process.env.LANGFUSE_SECRET_KEY;

		({ getPromptInstructions } = await import("../src/services/langfuse.js"));

		if (originalPublicKey !== undefined) {
			process.env.LANGFUSE_PUBLIC_KEY = originalPublicKey;
		}
		if (originalSecretKey !== undefined) {
			process.env.LANGFUSE_SECRET_KEY = originalSecretKey;
		}
	});

	beforeEach(() => {
		mockPromptGet.mock.resetCalls();
		mockWriteLog.mock.resetCalls();
	});

	it("returns the compiled prompt when the fetch succeeds", async () => {
		mockPromptGet.mock.mockImplementationOnce(async () => ({
			compile: () => "Compiled instructions",
		}));

		const result = await getPromptInstructions(
			"weather-advice",
			"fallback text",
		);

		assert.equal(result, "Compiled instructions");
		assert.equal(mockPromptGet.mock.calls[0].arguments[0], "weather-advice");
	});

	it("falls back and logs an ERROR when the prompt fetch fails", async () => {
		// Mirrors the real failure this guards against: Langfuse's SDK
		// defaults to fetching the version labeled "production" — if none
		// exists yet, it rejects with exactly this error.
		mockPromptGet.mock.mockImplementationOnce(async () => {
			throw new Error(
				"Prompt not found: 'weather-advice' with label 'production'",
			);
		});

		const result = await getPromptInstructions(
			"weather-advice",
			"fallback text",
		);

		assert.equal(result, "fallback text");
		const errorCall = mockWriteLog.mock.calls.find(
			(c) => c.arguments[0] === "ERROR",
		);
		assert.ok(errorCall, "expected an ERROR log call");
		assert.match(errorCall.arguments[1], /weather-advice/);
	});

	it("falls back when the fetch rejects with a non-Error value", async () => {
		mockPromptGet.mock.mockImplementationOnce(async () => {
			throw "plain string rejection";
		});

		const result = await getPromptInstructions("triage-agent", "fallback text");

		assert.equal(result, "fallback text");
	});
});
