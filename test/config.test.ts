import assert from "node:assert/strict";
import test from "node:test";

import { loadConfigFromEnv } from "../src/utils/config.js";

test("loadConfigFromEnv applies defaults and trims Bark server URL", () => {
	const config = loadConfigFromEnv({
		OPENAI_API_KEY: "openai-key",
		BARK_DEVICE_KEY: "bark-key",
		BARK_SERVER_URL: "https://example.com///",
		SYDFIT_API_KEY: "test-sydfit-key",
		TFNSW_API_KEY: "test-tfnsw-api-key",
		MEM0_API_KEY: "test-mem0-api-key",
		GCP_PROJECT_ID: "test-project-id",
		GCP_LOCATION: "australia-east",
		GCP_QUEUE_NAME: "sydfit-queue",
		SYDFIT_SERVICE_URL: "https://test.com",
		LANGFUSE_PUBLIC_KEY: "test-lf-pk",
		LANGFUSE_SECRET_KEY: "test-lf-sk",
		LANGFUSE_BASE_URL: "https://langfuse.com",
	});

	assert.deepEqual(config, {
		openaiApiKey: "openai-key",
		openaiModel: "gpt-5.4-mini",
		barkDeviceKey: "bark-key",
		sydFitApiKey: "test-sydfit-key",
		barkServerUrl: "https://example.com",
		barkGroup: "Weather",
		barkLevel: "active",
		scheduleTimezone: "Australia/Sydney",
		mem0ApiKey: "test-mem0-api-key",
		tfnswApiKey: "test-tfnsw-api-key",
		gcpProjectId: "test-project-id",
		gcpLocation: "australia-east",
		gcpQueueName: "sydfit-queue",
		sydFitServiceUrl: "https://test.com",
		langfusePublicKey: "test-lf-pk",
		langfuseSecretKey: "test-lf-sk",
		langfuseBaseUrl: "https://langfuse.com",
	});
});

test("loadConfigFromEnv uses optional overrides", () => {
	const config = loadConfigFromEnv({
		OPENAI_API_KEY: "openai-key",
		OPENAI_MODEL: "model-x",
		BARK_DEVICE_KEY: "bark-key",
		SYDFIT_API_KEY: "test-sydfit-key",
		BARK_GROUP: "Morning",
		BARK_LEVEL: "timeSensitive",
		SCHEDULE_TIMEZONE: "Pacific/Auckland",
		MEM0_API_KEY: "override-mem0-key",
	});

	assert.equal(config.openaiModel, "model-x");
	assert.equal(config.barkGroup, "Morning");
	assert.equal(config.barkLevel, "timeSensitive");
	assert.equal(config.scheduleTimezone, "Pacific/Auckland");
	assert.equal(config.mem0ApiKey, "override-mem0-key");
});

test("loadConfigFromEnv reports missing required values", () => {
	assert.throws(
		() => loadConfigFromEnv({ OPENAI_API_KEY: "openai-key" }),
		/Missing required environment variables: BARK_DEVICE_KEY, SYDFIT_API_KEY/,
	);
});
