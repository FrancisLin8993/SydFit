// src/index.js
import { sendBarkNotification } from "./bark.js";
import { loadConfig } from "./config.js";
import { generateClothingRecommendation } from "./openai.js";
import { formatLocalTime, isScheduledLocalTime } from "./scheduler.js";
import { getWeather } from "./weather.js";
import { handleTrafficQuery, buildTransitErrorMessage } from "./trafficAgent.js";
import { addFeedbackToMemory } from "./memoryService.js"; // 引入记忆存储

async function handleMobileRequest(config) {
  const prompt = config.userPrompt;
  console.log(`[Router] Detected mobile real-time request: "${prompt}"`);
  
  // 🚨 1. 核心分流：判断是否为 Feedback 存储请求
  if (prompt.toLowerCase().startsWith("fb")) {
    const actualFeedback = prompt.replace(/^fb[:]?\s*/i, "").trim();
    console.log(`📥 [Memory Processor] Extracting feedback message: "${actualFeedback}"`);

    let pushBody = "";
    if (!actualFeedback) {
      pushBody = "❌ Failed to remember: Feedback text content cannot be empty.";
    } else {
      const isSaved = await addFeedbackToMemory(config, actualFeedback);
      pushBody = isSaved 
        ? `🧠 SydFit remembered preference for user [${config.userId}]: "${actualFeedback}"`
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

  // 2. 原有的正常查询流转
  const promptLower = prompt.toLowerCase();
  let aiReply = "";
  let pushTitle = "💬 SydFit Assistant";
  let pushSubtitle = "Real-time Query";

  if (promptLower.includes("train")) {
    aiReply = await handleTrafficQuery(config, "train"); // 🔑 将 config 作为第一个参数传入
    pushTitle = "🚗 Sydney Traffic Alert";
    pushSubtitle = "Train Network Status";
  } else if (promptLower.includes("lightrail")) {
    aiReply = await handleTrafficQuery(config, "lightrail"); // 🔑 将 config 作为第一个参数传入
    pushTitle = "🚊 Sydney Traffic Alert";
    pushSubtitle = "Light Rail Status";
  } else {
    console.log(`☀️ [Router] Routing to Weather Agent...`);
    const weather = await getWeather(config.scheduleTimezone);
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