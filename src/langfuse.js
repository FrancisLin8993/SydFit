import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import {
  startActiveObservation,
  startObservation,
  propagateAttributes,
} from "@langfuse/tracing";
import { writeLog } from "./logger.js";

const isLangfuseEnabled =
  !!process.env.LANGFUSE_PUBLIC_KEY && !!process.env.LANGFUSE_SECRET_KEY;

let langfuseSpanProcessor = null;

if (isLangfuseEnabled) {
  langfuseSpanProcessor = new LangfuseSpanProcessor({
    exportMode: "immediate",
  });

  const sdk = new NodeSDK({
    spanProcessors: [langfuseSpanProcessor],
  });

  sdk.start();
  writeLog("INFO", "🔍 [Langfuse] Tracing enabled and OpenTelemetry SDK started.");
} else {
  writeLog("INFO", "🔍 [Langfuse] Tracing disabled (LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY not set).");
}

export async function flushLangfuse() {
  if (langfuseSpanProcessor) {
    await langfuseSpanProcessor.forceFlush();
  }
}

export {
  startActiveObservation,
  startObservation,
  propagateAttributes,
  isLangfuseEnabled,
};
