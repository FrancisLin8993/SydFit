const required = ["OPENAI_API_KEY", "BARK_DEVICE_KEY"];

export function loadConfig() {
  return loadConfigFromEnv(process.env);
}

export function loadConfigFromEnv(env) {
  const missing = required.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`
    );
  }

  return {
    openaiApiKey: env.OPENAI_API_KEY,
    openaiModel: env.OPENAI_MODEL || "gpt-5.4-mini",
    barkDeviceKey: env.BARK_DEVICE_KEY,
    barkServerUrl: trimTrailingSlash(env.BARK_SERVER_URL || "https://api.day.app"),
    barkGroup: env.BARK_GROUP || "Weather",
    barkLevel: env.BARK_LEVEL || "active",
    scheduleTimezone: env.SCHEDULE_TIMEZONE || "Australia/Sydney",
    userPrompt: (env.USER_PROMPT || "").trim(),
    runOnStart: env.RUN_ON_START === "true"
  };
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}
