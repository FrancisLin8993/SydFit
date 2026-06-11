import { sendBarkNotification } from "./bark.js";
import { loadConfig } from "./config.js";
import { generateClothingRecommendation } from "./openai.js";
import { formatLocalTime, isScheduledLocalTime } from "./scheduler.js";
import { getWeather } from "./weather.js";
import { handleTrafficQuery, buildTransitErrorMessage } from "./trafficAgent.js";

async function handleMobileRequest(config) {
  const prompt = config.userPrompt;
  console.log(`[Router] Detected mobile real-time request: "${prompt}"`);
  const promptLower = prompt.toLowerCase();

  let aiReply = "";
  let pushTitle = "💬 SydFit Assistant";
  let pushSubtitle = "Real-time Query";

  if (promptLower.includes("train")) {
    aiReply = await handleTrafficQuery(prompt, "train");
    pushTitle = "🚗 Sydney Traffic Alert";
    pushSubtitle = "Train Network Status";
  } else if (promptLower.includes("lightrail")) {
    aiReply = await handleTrafficQuery(prompt, "lightrail");
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
      handleTrafficQuery("Check if there are any major delays or trackwork for morning commute", "all"),
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

async function main() {
  const config = loadConfig();

  if (config.userPrompt !== "") {
    await handleMobileRequest(config);
  } else {
    const force = process.argv.includes("--force") || config.runOnStart;

    if (!force && !isScheduledLocalTime({ timezone: config.scheduleTimezone, hour: 7 })) {
      console.log(
        `Skipping notification. Local time is ${formatLocalTime(new Date(), config.scheduleTimezone)}, not within 7 AM hour.`
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