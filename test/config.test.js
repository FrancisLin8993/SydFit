import assert from "node:assert/strict";
import test from "node:test";

import { loadConfigFromEnv } from "../src/config.js";

test("loadConfigFromEnv applies defaults and trims Bark server URL", () => {
  const config = loadConfigFromEnv({
    OPENAI_API_KEY: "openai-key",
    BARK_DEVICE_KEY: "bark-key",
    BARK_SERVER_URL: "https://example.com///"
  });

  assert.deepEqual(config, {
    openaiApiKey: "openai-key",
    openaiModel: "gpt-5.4-mini",
    barkDeviceKey: "bark-key",
    barkServerUrl: "https://example.com",
    barkGroup: "Weather",
    barkLevel: "active",
    scheduleTimezone: "Australia/Sydney",
    userPrompt: "",
    runOnStart: false
  });
});

test("loadConfigFromEnv uses optional overrides", () => {
  const config = loadConfigFromEnv({
    OPENAI_API_KEY: "openai-key",
    OPENAI_MODEL: "model-x",
    BARK_DEVICE_KEY: "bark-key",
    BARK_GROUP: "Morning",
    BARK_LEVEL: "timeSensitive",
    SCHEDULE_TIMEZONE: "Pacific/Auckland",
    USER_PROMPT: "  office day  ",
    RUN_ON_START: "true"
  });

  assert.equal(config.openaiModel, "model-x");
  assert.equal(config.barkGroup, "Morning");
  assert.equal(config.barkLevel, "timeSensitive");
  assert.equal(config.scheduleTimezone, "Pacific/Auckland");
  assert.equal(config.userPrompt, "office day");
  assert.equal(config.runOnStart, true);
});

test("loadConfigFromEnv reports missing required values", () => {
  assert.throws(
    () => loadConfigFromEnv({ OPENAI_API_KEY: "openai-key" }),
    /Missing required environment variable: BARK_DEVICE_KEY/
  );
});
