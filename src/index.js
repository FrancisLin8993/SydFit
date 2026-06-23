// src/index.js
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { swaggerUI } from '@hono/swagger-ui';
import { sendBarkNotification } from "./bark.js";
import { loadConfig } from "./config.js";
import { generateClothingRecommendation } from "./openai.js";
import { getWeather } from "./weather.js";
import { handleTrafficQuery, buildTransitErrorMessage } from "./trafficAgent.js";
import { addPreferenceToMemory, getRelevantMemories } from "./memoryService.js"; 
import { determineIntentAndMode } from "./intentRouter.js";

const app = new Hono();
const config = loadConfig();


app.use('*', async (c, next) => {
  if (c.req.path.startsWith('/swagger') || c.req.path === '/doc') {
    return next();
  }
  const token = c.req.header('x-sydfit-token');
  if (!config.sydFitApiKey || token !== config.sydFitApiKey) {
    console.warn("⚠️ Unauthorized access attempt intercepted.");
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  await next();
});

app.get('/doc', (c) => {
  return c.json({
    openapi: '3.0.0',
    info: {
      title: 'SydFit Personal Assistant API',
      version: '1.0.0',
      description: 'The personal assistant running on Cloud Run.'
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-sydfit-token'
        }
      }
    },
    security: [{ ApiKeyAuth: [] }],
    paths: {
      '/api/ask': {
        post: {
          summary: 'Mobile Real-time Query',
          description: 'Process intents like traffic routing, weather fetching, or memory storage.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', properties: { query: { type: 'string', example: 'train' } } }
              }
            }
          },
          responses: {
            200: { description: 'Successful operation' }
          }
        }
      },
      '/api/cron': {
        post: {
          summary: 'Daily Morning Briefing',
          description: 'Triggers the daily Bark notifications for weather and transit.',
          responses: {
            200: { description: 'Bark notifications sent' }
          }
        }
      }
    }
  });
});

app.get('/swagger', swaggerUI({ url: '/doc' }));


app.post('/api/ask', async (c) => {
  const traces = [];
  
  try {
    const { query } = await c.req.json();
    traces.push(`📥 Received client request: "${query}"`);

    if (query.toLowerCase().startsWith("personal")) {
      const actualPreference = query.replace(/^personal[:]?\s*/i, "").trim();
      traces.push(`📥 [Processing memory] Extract preferences: "${actualPreference}"`);

      let replyText = "";
      if (!actualPreference) {
        replyText = "❌ Save failed: Preference cannot be empty";
      } else {
        const isSaved = await addPreferenceToMemory(config, actualPreference);
        replyText = isSaved 
          ? `🧠 Preference has been added`
          : "❌ Memory cluster failed to load. Please check mem0 status.";
      }
      
      traces.push(replyText);
      return c.json({ success: true, traces, reply: replyText });
    }

    traces.push("🧠 Searching memory for transport preferences...");
    const transportMemory = await getRelevantMemories(config, query, "preferred public transport mode commuting sydney");
    traces.push(`💾 Memory loaded: "${transportMemory || ''}"`);

    const routingResult = await determineIntentAndMode(config, query, transportMemory);
    traces.push(`🔀 [LLM Routing] Decision result: Intent=[${routingResult.intent}], Mode=[${routingResult.mode || 'N/A'}]`);

    let aiReply = "";

    if (routingResult.intent === "traffic") {
      const targetMode = routingResult.mode || "train";
      traces.push(`🚂 [Traffic agent] Searching TfNSW data: ${targetMode}`);
      aiReply = await handleTrafficQuery(config, targetMode);
    } else {
      traces.push(`☀️ [Weather agent] Retrieving weather forecast and generating clothing recommendation...`);
      const weather = await getWeather(config);
      aiReply = await generateClothingRecommendation(config, query, weather);
    }

    traces.push(`✅ Workflow completed.`);
    
    return c.json({
      success: true,
      traces: traces,
      reply: aiReply
    });

  } catch (error) {
    console.error("❌ /api/ask Error:", error);
    return c.json({ success: false, error: error.message, traces }, 500);
  }
});


app.post('/api/cron', async (c) => {
  console.log(`⏰ [Cron] Daily schedule job triggered`);

  try {
    const [weather, trafficReport] = await Promise.all([
      getWeather(config),
      handleTrafficQuery(config, "train"),
    ]);

    const trafficError = buildTransitErrorMessage(trafficReport);
    if (trafficError) {
      console.error(`❌ Traffic agent error: ${trafficReport}`);
      await sendBarkNotification(config, {
        title: "❌ Transit Data Error",
        subtitle: "MCP Server / TfNSW API",
        body: trafficError,
      });
    }

    const clothingRecommendation = await generateClothingRecommendation(config, weather);
    const weatherSubtitle = `${weather.condition}, ${weather.temperatureC}°C (体感 ${weather.apparentTemperatureC}°C)`;

    const notifications = [
      sendBarkNotification(config, {
        title: "☀️ Today's Outfit",
        subtitle: weatherSubtitle,
        body: clothingRecommendation,
      }),
    ];

    if (!trafficError) {
      notifications.push(
        sendBarkNotification(config, {
          title: "🚆 Transport Alerts",
          subtitle: "Morning Commute",
          body: trafficReport,
        })
      );
    }

    await Promise.all(notifications);
    console.log(`✅ [Cron] Daily message pushed successfully.`);
    
    return c.json({ success: true, message: "Morning briefing sent via Bark." });

  } catch (error) {
    console.error("❌ Cron Job Failed:", error);
    await sendBarkNotification(config, {
      title: "❌ SydFit Error",
      subtitle: "Cron Job Exception",
      body: error.message,
    });
    return c.json({ success: false, error: error.message }, 500);
  }
});


const port = process.env.PORT || 8080;
console.log(`🚀 SydFit is starting on port ${port}...`);

export { app };

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 8080;
  console.log(`🚀 Sydfit is starting on port ${port}...`);
  serve({
    fetch: app.fetch,
    port
  });
}