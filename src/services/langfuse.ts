import { LangfuseClient } from "@langfuse/client";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import {
	propagateAttributes,
	startActiveObservation,
	startObservation,
} from "@langfuse/tracing";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { writeLog } from "../utils/logger.js";

export const promptClient = new LangfuseClient();

const isLangfuseEnabled =
	!!process.env.LANGFUSE_PUBLIC_KEY && !!process.env.LANGFUSE_SECRET_KEY;

let langfuseSpanProcessor: LangfuseSpanProcessor | null = null;

if (isLangfuseEnabled) {
	langfuseSpanProcessor = new LangfuseSpanProcessor({
		publicKey: process.env.LANGFUSE_PUBLIC_KEY,
		secretKey: process.env.LANGFUSE_SECRET_KEY,
		baseUrl: process.env.LANGFUSE_BASE_URL || "https://jp.cloud.langfuse.com",
		environment: process.env.NODE_ENV || "production",
		exportMode: "immediate",
		shouldExportSpan: () => true,
	});

	const sdk = new NodeSDK({
		spanProcessors: [langfuseSpanProcessor],
	});

	sdk.start();
	writeLog(
		"INFO",
		"🔍 [Langfuse] Tracing enabled and OpenTelemetry SDK started.",
	);
} else {
	writeLog(
		"INFO",
		"🔍 [Langfuse] Tracing disabled (LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY not set).",
	);
}

export async function flushLangfuse() {
	if (langfuseSpanProcessor) {
		await langfuseSpanProcessor.forceFlush();
	}
}

/**
 * Fetches and compiles a Langfuse-hosted text prompt, falling back to a
 * built-in default on any failure (missing prompt, no "production" label
 * yet, network error, etc).
 *
 * Callers use this at module load time (top-level await) to build agent
 * instructions. Without this fallback, a rejected fetch there fails the
 * whole module import — which crashes the entire SydFit process at startup,
 * not just the one agent, since index.ts imports every agent module
 * directly. A missing/mislabeled prompt should degrade to the last-known
 * default instructions, not take the whole app down.
 */
export async function getPromptInstructions(
	name: string,
	fallback: string,
): Promise<string> {
	try {
		const prompt = await promptClient.prompt.get(name);
		return prompt.compile();
	} catch (error) {
		writeLog(
			"ERROR",
			`[Langfuse] Failed to fetch prompt "${name}" — falling back to built-in default instructions`,
			{
				prompt: name,
				error: error instanceof Error ? error.message : String(error),
			},
		);
		return fallback;
	}
}

export {
	isLangfuseEnabled,
	propagateAttributes,
	startActiveObservation,
	startObservation,
};
