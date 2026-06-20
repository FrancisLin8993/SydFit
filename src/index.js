// src/index.js
import { sendBarkNotification } from "./bark.js";
import { loadConfig } from "./config.js";
import { generateClothingRecommendation } from "./openai.js";
import { formatLocalTime, isScheduledLocalTime } from "./scheduler.js";
import { getWeather } from "./weather.js";
import { handleTrafficQuery, buildTransitErrorMessage } from "./trafficAgent.js";
import { addPreferenceToMemory } from "./memoryService.js"; 
import { determineIntentAndMode } from "./intentRouter.js";

async function handleMobileRequest(config) {
  const prompt = config.userPrompt;
  console.log(`[Router] Detected mobile real-time request: "${prompt}"`);
  
  if (prompt.toLowerCase().startsWith("personal")) {
    const actualPreference = prompt.replace(/^personal[:]?\s*/i, "").trim();
    console.log(`📥 [Memory Processor] Extracting advice message: "${actualPreference}"`);

    let pushBody = "";
    if (!actualPreference) {
      pushBody = "❌ Failed to remember: Preference text content cannot be empty.";
    } else {
      const isSaved = await addPreferenceToMemory(config, actualPreference);
      pushBody = isSaved 
        ? `🧠 SydFit remembered preference for user [${config.userId}]: "${actualPreference}"`
        : "❌ Memory cluster sync failed. Please check Mem0/GCP status.";
    }

    // 发送 Bark 弹窗并直接熔断返回
    await sendBarkNotification(config, {
      title: "🧠 SydFit Memory Sync",
      subtitle: "Personal Preference Logged",
      body: pushBody,
    });
    return;
  }

  let aiReply = "";
  let pushTitle = "💬 SydFit Assistant";
  let pushSubtitle = "Real-time Query";

  const transportMemory = await getRelevantMemories(config, "preferred public transport mode commuting sydney");
  console.log(`🧠 [Memory Context] Loaded for routing: "${transportMemory}"`);


  const routingResult = await determineIntentAndMode(config, prompt, transportMemory);
  console.log(`🔀 [LLM Router] Decision:`, routingResult);


  if (routingResult.intent === "traffic") {
    const targetMode = routingResult.mode || "train";
    
    // 动态映射 UI 文案，无需再写 if-else
    const pushUI = {
      "lightrail": { title: "🚊 Sydney Traffic Alert", sub: "Light Rail Status" },
      "metro": { title: "🚇 Sydney Traffic Alert", sub: "Metro Network Status" },
      "bus": { title: "🚌 Sydney Traffic Alert", sub: "Bus Network Status" },
      "ferry": { title: "⛴️ Sydney Traffic Alert", sub: "Ferry Network Status" },
      "train": { title: "🚗 Sydney Traffic Alert", sub: "Train Network Status" }
    };

    pushTitle = pushUI[targetMode]?.title || pushUI["train"].title;
    pushSubtitle = pushUI[targetMode]?.sub || pushUI["train"].sub;

    console.log(`🚂 [Traffic Agent] Firing mode: [${targetMode}]`);
    aiReply = await handleTrafficQuery(config, targetMode);
    
  } else {
    // 3. 保持原有的天气代理执行路径不变
    console.log(`☀️ [Router] Routing to Weather Agent...`);
    const weather = await getWeather(config);
    aiReply = await generateClothingRecommendation(config, weather);
    pushTitle = "☀️ Mascot Outfit Suggestion";
    pushSubtitle = `${weather.condition}, ${weather.temperatureC}°C`;
  }

  await sendBarkNotification(config, {
    title: pushTitle,
    subtitle: pushSubtitle,
    body: aiReply,
  });
}

async function runScheduledJob(config) {
  console.log(`⏰ [${new Date().toISOString()}] Executing Scheduled Daily Briefing Job...`);

  try {
    console.log(`🚀 [Router] Launching Weather and Traffic Agents concurrently...`);

    const [weather, trafficReport] = await Promise.all([
      getWeather(config.scheduleTimezone),
      handleTrafficQuery(config, "train"), // 🔑 将 config 传入
    ]);

    const trafficError = buildTransitErrorMessage(trafficReport);
    if (trafficError) {
      console.error(`❌ Traffic agent returned an error: ${trafficReport}`);
      await sendBarkNotification(config, {
        title: "❌ Transit Data Error",
        subtitle: "MCP Server / TfNSW API",
        body: trafficError,
      });
    }

    const clothingRecommendation = await generateClothingRecommendation(config, weather);
    const weatherSubtitle = `${weather.condition}, ${weather.temperatureC}°C (Feels like ${weather.apparentTemperatureC}°C)`;

    console.log(`[${new Date().toISOString()}] Sending morning Bark notifications...`);

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

  } catch (error) {
    console.error("❌ Job Failed:", error);
    await sendBarkNotification(config, {
      title: "❌ SydFit Error",
      subtitle: "Job Exception",
      body: error.message,
    });
  }
}

// main() 函数保持完全不变
async function main() {
  const config = loadConfig();

  if (config.userPrompt !== "") {
    await handleMobileRequest(config);
  } else {
    const force = process.argv.includes("--force") || config.runOnStart;

    if (!force && !isScheduledLocalTime({ timezone: config.scheduleTimezone, hour: 7, toleranceMinutes: 90 })) {
      console.log(
        `Skipping notification. Local time is ${formatLocalTime(new Date(), config.scheduleTimezone)}, not within window for 7 AM.`
      );
      return;
    }

    await runScheduledJob(config);
  }

  console.log(`[${new Date().toISOString()}] Execution finished successfully.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});