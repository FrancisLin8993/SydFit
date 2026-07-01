const required = ["OPENAI_API_KEY", "BARK_DEVICE_KEY", "SYDFIT_API_KEY"];

export function loadConfig() {
	return loadConfigFromEnv(process.env);
}

export function loadConfigFromEnv(env) {
	const missing = required.filter((key) => !env[key]);

	if (missing.length > 0) {
		throw new Error(
			`Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
		);
	}

	return {
		openaiApiKey: env.OPENAI_API_KEY,
		openaiModel: env.OPENAI_MODEL || "gpt-5.4-mini",
		barkDeviceKey: env.BARK_DEVICE_KEY,
		sydFitApiKey: env.SYDFIT_API_KEY,
		barkServerUrl: trimTrailingSlash(
			env.BARK_SERVER_URL || "https://api.day.app",
		),
		barkGroup: env.BARK_GROUP || "Weather",
		barkLevel: env.BARK_LEVEL || "active",
		scheduleTimezone: env.SCHEDULE_TIMEZONE || "Australia/Sydney",
		mem0ApiUrl: trimTrailingSlash(env.MEM0_API_URL || ""),
		mcpServerUrl: env.MCP_SERVER_URL,
		mcpAccessToken: env.MCP_ACCESS_TOKEN,
		mem0AccessToken: env.MEM0_ACCESS_TOKEN,
		gcpProjectId: env.GCP_PROJECT_ID,
		gcpLocation: env.GCP_LOCATION,
		gcpQueueName: env.GCP_QUEUE_NAME,
		sydFitServiceUrl: env.SYDFIT_SERVICE_URL,
		langfusePublicKey: env.LANGFUSE_PUBLIC_KEY,
		langfuseSecretKey: env.LANGFUSE_SECRET_KEY,
		langfuseBaseUrl: env.LANGFUSE_BASE_URL,
	};
}

function trimTrailingSlash(value) {
	return value.replace(/\/+$/, "");
}
