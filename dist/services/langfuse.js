import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { startActiveObservation, startObservation, propagateAttributes, } from "@langfuse/tracing";
import { LangfuseClient } from "@langfuse/client";
import { writeLog } from "../utils/logger.js";
export const promptClient = new LangfuseClient();
const isLangfuseEnabled = !!process.env.LANGFUSE_PUBLIC_KEY && !!process.env.LANGFUSE_SECRET_KEY;
let langfuseSpanProcessor = null;
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
    writeLog("INFO", "🔍 [Langfuse] Tracing enabled and OpenTelemetry SDK started.");
}
else {
    writeLog("INFO", "🔍 [Langfuse] Tracing disabled (LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY not set).");
}
export async function flushLangfuse() {
    if (langfuseSpanProcessor) {
        await langfuseSpanProcessor.forceFlush();
    }
}
export { startActiveObservation, startObservation, propagateAttributes, isLangfuseEnabled, };
