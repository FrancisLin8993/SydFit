import assert from "node:assert/strict";
import test from "node:test";

import { loadConfigFromEnv } from "../src/config.js";

test("loadConfigFromEnv applies defaults and trims Bark server URL", () => {
  const config = loadConfigFromEnv({
    OPENAI_API_KEY: "openai-key",
    BARK_DEVICE_KEY: "bark-key",
    BARK_SERVER_URL: "https://example.com///",
    SYDFIT_API_KEY: "test-sydfit-key",
    MCP_ACCESS_TOKEN: "test-mcp-access-key",
    MEM0_ACCESS_TOKEN: "test-mem0-access-key",
    GCP_PROJECT_ID: "test-project-id",
    GCP_LOCATION: "australia-east",
    GCP_QUEUE_NAME: "sydfit-queue",
    SYDFIT_SERVICE_URL: "https://test.com"
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
    mem0ApiUrl: "",
    mem0AccessToken: "test-mem0-access-key",
    mcpServerUrl: undefined,
    mcpAccessToken: "test-mcp-access-key",
    gcpProjectId: "test-project-id",
    gcpLocation: "australia-east",
    gcpQueueName: "sydfit-queue",
    sydFitServiceUrl: "https://test.com"
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
    MEM0_API_URL: "https://mem0-gcp-run.net////"
  });

  assert.equal(config.openaiModel, "model-x");
  assert.equal(config.barkGroup, "Morning");
  assert.equal(config.barkLevel, "timeSensitive");
  assert.equal(config.scheduleTimezone, "Pacific/Auckland");
  assert.equal(config.mem0ApiUrl, "https://mem0-gcp-run.net");
});

test("loadConfigFromEnv reports missing required values", () => {
  assert.throws(
    () => loadConfigFromEnv({ OPENAI_API_KEY: "openai-key" }),
    /Missing required environment variables: BARK_DEVICE_KEY, SYDFIT_API_KEY/
  );
});