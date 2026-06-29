import { flushLangfuse, startActiveObservation, propagateAttributes, } from "./services/langfuse.js";
import { Runner } from "@openai/agents";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { enqueueSydFitTask } from "./services/googleCloudTask.js";
import { trafficAgent } from "./agents/trafficAgent.js";
import { weatherAgent } from "./agents/weatherAgent.js";
import { sendBarkNotification } from "./services/bark.js";
import { loadConfig } from "./utils/config.js";
import { buildTransitErrorMessage } from "./services/traffic.js";
import { addPreferenceToMemory, getRelevantMemories } from "./services/memoryService.js";
import { determineIntentAndMode } from "./intentRouter.js";
import { writeLog } from "./utils/logger.js";
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
            description: "The serverless brain running on Cloud Run, monitoring Sydney transport and weather.",
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
                    description: "Process intents like traffic routing, weather fetching, or memory storage.",
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
                    description: "Triggers the daily Bark notifications for weather and transit.",
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
            return c.json({ success: true, message: "Task enqueued for background processing" }, 202);
        }
        catch (error) {
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
        return propagateAttributes({ userId: "francis", tags: ["ask"] }, async () => {
            try {
                const { query } = await c.req.json();
                writeLog("INFO", `[Process Task API] 📥 Received client request: "${query}"`);
                span.update({ input: { query } });
                // 3.1 Core intent routing (memory / traffic / weather)
                writeLog("INFO", "[Process Task API] 🧠 Retrieving transport preferences from memory bank...");
                const userMemories = await getRelevantMemories(config, "preferred public transport mode commuting sydney");
                const routingResult = await determineIntentAndMode(config, query, userMemories);
                writeLog("INFO", `[Process Task API] 🔀 [LLM Router] Decision: Intent=[${routingResult.intent}], Mode=${routingResult.modes}`);
                // 3.2 Memory storage intent — user wants SydFit to remember a preference
                if (routingResult.intent === "memory") {
                    const actualPreference = (routingResult.preference || "").trim();
                    writeLog("INFO", `[Process Task API] 📥 [Memory Processor] Extracted preference: "${actualPreference}"`);
                    let replyText = "";
                    if (!actualPreference) {
                        replyText =
                            "❌ Storage failed: No preference could be detected to remember.";
                    }
                    else {
                        const isSaved = await addPreferenceToMemory(config, actualPreference);
                        replyText = isSaved
                            ? `🧠 SydFit has remembered this preference for you.`
                            : "❌ Memory cluster sync failed. Please check Mem0 status.";
                    }
                    writeLog("INFO", `[Process Task API] Memory processing result: ${replyText}`);
                    await sendBarkNotification(config, {
                        title: "🧠 SydFit Memory Sync",
                        subtitle: "Personal Preference Logged",
                        body: replyText,
                    });
                    span.update({ output: { intent: "memory", reply: replyText } });
                    return c.json({ success: true, message: "Bark sent" });
                }
                let aiReply = "";
                let pushTitle = "💬 SydFit Assistant";
                let pushSubtitle = "Real-time Query";
                if (routingResult.intent === "traffic") {
                    const agent = trafficAgent(config);
                    writeLog("INFO", `[Traffic Agent] Running OpenAI Agent SDK...`, {
                        query,
                    });
                    const runner = new Runner();
                    const result = await runner.run(agent, JSON.stringify({
                        input: query,
                    }));
                    aiReply = result.finalOutput;
                    pushTitle = "🚆 Sydney Traffic Update";
                }
                else {
                    const agent = weatherAgent(config);
                    writeLog("INFO", `[Weather Agent] Running OpenAI Agent SDK...`, {
                        query,
                    });
                    const runner = new Runner();
                    const result = await runner.run(agent, JSON.stringify({
                        input: query,
                    }));
                    aiReply = result.finalOutput;
                    pushTitle = "☀️ Outfit Suggestion";
                    pushSubtitle = "Today's weather-based recommendation";
                }
                writeLog("INFO", `[Process Task API] ✅ Processing complete, triggering Bark push notification...`);
                await sendBarkNotification(config, {
                    title: pushTitle,
                    subtitle: pushSubtitle,
                    body: aiReply,
                });
                span.update({
                    output: { intent: routingResult.intent, reply: aiReply },
                });
                // 3.4 Return an extremely lightweight response to close the HTTP connection after successful push
                return c.json({
                    success: true,
                    message: "Bark push triggered successfully.",
                });
            }
            catch (error) {
                writeLog("ERROR", `❌ /api/process-task Error:`, error);
                span.update({ level: "ERROR", statusMessage: error.message });
                // Send Bark notification even on exceptions
                await sendBarkNotification(config, {
                    title: "❌ SydFit API Error",
                    subtitle: "proccess-ask Endpoint Exception",
                    body: error.message,
                });
                return c.json({ success: false, error: error.message }, 500);
            }
        });
    });
    await flushLangfuse();
    return result;
});
app.post("/api/cron", async (c) => {
    const result = await startActiveObservation("cron-morning-briefing", async (span) => {
        return propagateAttributes({ userId: "francis", tags: ["cron"] }, async () => {
            writeLog("INFO", `⏰ [Cron] Triggering daily morning briefing task...`);
            try {
                const weatherAgentInstance = weatherAgent(config);
                const weatherRunner = new Runner();
                const trafficAgentInstance = trafficAgent(config);
                const trafficRunner = new Runner();
                const [weatherResult, trafficResult] = await Promise.all([
                    weatherRunner.run(weatherAgentInstance, JSON.stringify({ input: "Morning outfit" })),
                    trafficRunner.run(trafficAgentInstance, JSON.stringify({ input: "Morning outfit" })),
                ]);
                const clothingRecommendation = weatherResult.finalOutput;
                const trafficRecommendation = trafficResult.finalOutput;
                const trafficError = buildTransitErrorMessage(trafficRecommendation);
                if (trafficError) {
                    writeLog("ERROR", `❌ Traffic agent returned an error: ${trafficRecommendation}`);
                    await sendBarkNotification(config, {
                        title: "❌ Transit Data Error",
                        subtitle: "MCP Server / TfNSW API",
                        body: trafficError,
                    });
                }
                const notifications = [
                    sendBarkNotification(config, {
                        title: "☀️ Today's Outfit",
                        subtitle: "Morning weather-based recommendation",
                        body: clothingRecommendation,
                    }),
                ];
                if (!trafficError) {
                    notifications.push(sendBarkNotification(config, {
                        title: "🚆 Transport Alerts",
                        subtitle: "Morning Commute",
                        body: trafficRecommendation,
                    }));
                }
                await Promise.all(notifications);
                writeLog(`✅ [Cron] Morning briefing pushed successfully.`);
                span.update({
                    output: {
                        clothing: clothingRecommendation,
                        traffic: trafficRecommendation,
                    },
                });
                return c.json({
                    success: true,
                    message: "Morning briefing sent via Bark.",
                });
            }
            catch (error) {
                writeLog("ERROR", "❌ Cron Job Failed:", error);
                span.update({ level: "ERROR", statusMessage: error.message });
                await sendBarkNotification(config, {
                    title: "❌ SydFit Error",
                    subtitle: "Cron Job Exception",
                    body: error.message,
                });
                return c.json({ success: false, error: error.message }, 500);
            }
        });
    });
    await flushLangfuse();
    return result;
});
export { app };
if (import.meta.url === `file://${process.argv[1]}`) {
    const port = Number(process.env.PORT ?? 8080);
    writeLog("INFO", `🚀 SydFit API starting on port ${port}...`);
    serve({ fetch: app.fetch, port });
}
