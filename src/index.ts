import {
	flushLangfuse,
	startActiveObservation,
	propagateAttributes,
} from "./services/langfuse.js";
import { Runner } from "@openai/agents";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { enqueueSydFitTask } from "./services/googleCloudTask.js";
import { triageAgent } from "./agents/triageAgent.js";
import { weatherAgent } from "./agents/weatherAgent.js";
import { sendBarkNotification } from "./services/bark.js";
import { loadConfig } from "./utils/config.js";
import { writeLog } from "./utils/logger.js";
import { trafficAgent } from "./agents/trafficAgent.js";

const app = new Hono();
const config = loadConfig();

app.use("*", async (c, next) => {
	// 🔓 Whitelist: Bypass Swagger UI interface and OpenAPI JSON data source
	if (c.req.path.startsWith("/swagger") || c.req.path === "/doc") {
		return next();
	}

	// 🔒 Core API authentication logic
	const token = c.req.header("x-sydfit-token");
	if (!config.sydFitApiKey || token !== config.sydFitApiKey) {
		console.warn("⚠️ Unauthorized access attempt intercepted.");
		return c.json({ error: "Unauthorized" }, 401);
	}

	await next();
});

app.get("/doc", (c) => {
	return c.json({
		openapi: "3.0.0",
		info: {
			title: "SydFit Personal Assistant API",
			version: "1.0.0",
			description:
				"The serverless brain running on Cloud Run, monitoring Sydney transport and weather.",
		},
		components: {
			securitySchemes: {
				ApiKeyAuth: {
					type: "apiKey",
					in: "header",
					name: "x-sydfit-token",
				},
			},
		},
		security: [{ ApiKeyAuth: [] }],
		paths: {
			"/api/ask": {
				post: {
					summary: "Mobile Real-time Query",
					description:
						"Process intents like traffic routing, weather fetching, or memory storage.",
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										query: {
											type: "string",
											example: "Is the T8 line delayed today?",
										},
									},
								},
							},
						},
					},
					responses: {
						200: { description: "Successful operation" },
					},
				},
			},
			"/api/cron": {
				post: {
					summary: "Daily Morning Briefing (Cloud Scheduler)",
					description:
						"Triggers the daily Bark notifications for weather and transit.",
					responses: {
						200: { description: "Bark notifications sent" },
					},
				},
			},
		},
	});
});

app.get("/swagger", swaggerUI({ url: "/doc" }));

app.post("/api/ask", async (c) => {
	const result = await startActiveObservation("ask-enqueue", async (span) => {
		try {
			const { query } = await c.req.json();
			writeLog("INFO", `Ask API] 📥 Received client request: "${query}"`);
			span.update({ input: { query } });

			writeLog("INFO", "Received /ask request, enqueuing background task", {
				query,
			});

			await enqueueSydFitTask(config, "/api/process-task", { query });

			span.update({ output: { enqueued: true } });
			return c.json(
				{ success: true, message: "Task enqueued for background processing" },
				202,
			);
		} catch (error) {
			writeLog("ERROR", "/api/ask Endpoint Failed to enqueue", {
				error: error.message,
				stack: error.stack,
			});
			span.update({ level: "ERROR", statusMessage: error.message });
			return c.json({ success: false, error: error.message }, 500);
		}
	});
	await flushLangfuse();
	return result;
});

app.post("/api/process-task", async (c) => {
	const result = await startActiveObservation("process-task", async (span) => {
		return propagateAttributes(
			{ userId: "francis", tags: ["ask"] },
			async () => {
				try {
					const { query } = await c.req.json();
					writeLog(
						"INFO",
						`[Process Task API] 📥 Received client request: "${query}"`,
					);
					span.update({ input: { query } });

					// CHANGED: the old "3.1 Core intent routing" (manual
					// determineIntentAndMode call) and "3.2 Memory storage intent"
					// (manual if/else + direct addPreferenceToMemory call) blocks
					// are both replaced by a single triage agent run. The agent
					// decides whether to call save_preference directly (memory
					// case) or hand off to the traffic/weather specialist —
					// all in one Runner.run() call.
					const agent = triageAgent(config);
					const runner = new Runner();

					writeLog("INFO", `[Triage Agent] Running OpenAI Agent SDK...`, {
						query,
					});
					const result = await runner.run(
						agent,
						JSON.stringify({ input: query }),
					);

					const aiReply = result.finalOutput;
					const handledBy = result.lastAgent?.name || "sydfit-triage";

					// Push notification framing based on which agent/tool path
					// actually produced the final response.
					let pushTitle = "💬 SydFit Assistant";
					let pushSubtitle = "Real-time Query";

					if (handledBy === "sydney-traffic-agent") {
						pushTitle = "🚆 Sydney Traffic Update";
					} else if (handledBy === "sydney-weather-agent") {
						pushTitle = "☀️ Mascot Outfit Suggestion";
						pushSubtitle = "Today's weather-based recommendation";
					} else {
						// Triage agent handled it directly — this is the memory
						// path (save_preference tool call), since traffic/weather
						// always hand off to a specialist.
						pushTitle = "🧠 SydFit Memory Sync";
						pushSubtitle = "Personal Preference Logged";
					}

					writeLog(
						"INFO",
						`[Process Task API] ✅ Processing complete (handled by: ${handledBy}), triggering Bark push notification...`,
					);
					await sendBarkNotification(config, {
						title: pushTitle,
						subtitle: pushSubtitle,
						body: aiReply,
					});

					span.update({
						output: { handledBy, reply: aiReply },
					});
					return c.json({
						success: true,
						message: "Bark push triggered successfully.",
					});
				} catch (error) {
					writeLog("ERROR", `❌ /api/process-task Error:`, error);
					span.update({ level: "ERROR", statusMessage: error.message });

					await sendBarkNotification(config, {
						title: "❌ SydFit API Error",
						subtitle: "proccess-ask Endpoint Exception",
						body: error.message,
					});

					return c.json({ success: false, error: error.message }, 500);
				}
			},
		);
	});
	await flushLangfuse();
	return result;
});

app.post("/api/cron", async (c) => {
	const result = await startActiveObservation(
		"cron-morning-briefing",
		async (span) => {
			return propagateAttributes(
				{ userId: "francis", tags: ["cron"] },
				async () => {
					writeLog(
						"INFO",
						`⏰ [Cron] Triggering daily morning briefing task...`,
					);

					try {
						const weatherAgentInstance = weatherAgent(config);
						const trafficAgentInstance = trafficAgent(config);

						// Run both agents concurrently but settle independently —
						// Promise.allSettled lets a traffic failure still send the
						// outfit notification, and vice versa, rather than one
						// failure cancelling both via Promise.all rejection.
						const [weatherSettled, trafficSettled] = await Promise.allSettled([
							new Runner().run(
								weatherAgentInstance,
								JSON.stringify({ input: "Morning outfit" }),
							),
							new Runner().run(
								trafficAgentInstance,
								JSON.stringify({ input: "Get public transport alerts" }),
							),
						]);

						const notifications: Promise<any>[] = [];

						if (weatherSettled.status === "fulfilled") {
							// FIX 1: extract .finalOutput from the RunResult object
							const clothingRecommendation = weatherSettled.value.finalOutput;
							notifications.push(
								sendBarkNotification(config, {
									title: "☀️ Today's Outfit",
									subtitle: "Morning weather-based recommendation",
									body: clothingRecommendation,
								}),
							);
							span.update({ output: { clothing: clothingRecommendation } });
						} else {
							writeLog("ERROR", "❌ Weather agent failed", {
								error: weatherSettled.reason?.message,
							});
							notifications.push(
								sendBarkNotification(config, {
									title: "❌ Weather Agent Error",
									subtitle: "Morning Briefing",
									body: weatherSettled.reason?.message || "Unknown error",
								}),
							);
						}

						if (trafficSettled.status === "fulfilled") {
							// FIX 1: same — extract .finalOutput, not the RunResult object itself
							const trafficReport = trafficSettled.value.finalOutput;
							notifications.push(
								sendBarkNotification(config, {
									title: "🚆 Transport Alerts",
									subtitle: "Morning Commute",
									body: trafficReport,
								}),
							);
							span.update({ output: { traffic: trafficReport } });
						} else {
							writeLog("ERROR", "❌ Traffic agent failed", {
								error: trafficSettled.reason?.message,
							});
							notifications.push(
								sendBarkNotification(config, {
									title: "❌ Transit Data Error",
									subtitle: "MCP Server / TfNSW API",
									body: trafficSettled.reason?.message || "Unknown error",
								}),
							);
						}

						await Promise.all(notifications);
						writeLog("INFO", `✅ [Cron] Morning briefing pushed successfully.`);

						return c.json({
							success: true,
							message: "Morning briefing sent via Bark.",
						});
					} catch (error) {
						writeLog("ERROR", "❌ Cron Job Failed:", error);
						span.update({ level: "ERROR", statusMessage: error.message });
						await sendBarkNotification(config, {
							title: "❌ SydFit Error",
							subtitle: "Cron Job Exception",
							body: error.message,
						});
						return c.json({ success: false, error: error.message }, 500);
					}
				},
			);
		},
	);
	await flushLangfuse();
	return result;
});
export { app };

if (import.meta.url === `file://${process.argv[1]}`) {
	const port = Number(process.env.PORT ?? 8080);
	writeLog("INFO", `🚀 SydFit API starting on port ${port}...`);
	serve({ fetch: app.fetch, port });
}
