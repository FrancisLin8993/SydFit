import { sendBarkNotification } from "./bark.js";
import { loadConfig } from "./config.js";
import { generateClothingRecommendation } from "./openai.js";
import { formatLocalTime, isScheduledLocalTime } from "./scheduler.js";
import { getWeather } from "./weather.js";
import { handleTrafficQuery } from "./trafficAgent.js";

async function handleMobileRequest(config, mobilePrompt) {
  console.log(`[Router] Detected mobile real-time request: "${mobilePrompt}"`);
  const promptLower = mobilePrompt.toLowerCase();
  
  let aiReply = "";
  let pushTitle = "💬 SydFit Assistant";
  let pushSubtitle = "Real-time Query";


  if (promptLower.includes("train")) {
    aiReply = await handleTrafficQuery(mobilePrompt, "train");
    pushTitle = "🚗 Sydney Traffic Alert";
    pushSubtitle = "Train Network Status";
  } else if (promptLower.includes("lightrail")) {
    aiReply = await handleTrafficQuery(mobilePrompt, "lightrail");
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
    body: aiReply
  });
}


async function runScheduledJob(config) {
  console.log(`⏰ [${new Date().toISOString()}] Executing Scheduled Daily Briefing Job...`);

  try {
    console.log(`🚀 [Router] Launching Weather and Traffic Agents concurrently...`);
    
    const [weather, trafficReport] = await Promise.all([
      getWeather(config.scheduleTimezone),
      handleTrafficQuery("Check if there are any major delays or trackwork for morning commute", "all") // 晨报全网扫描
    ]);

    const clothingRecommendation = await generateClothingRecommendation(config, weather);


    const dailyBriefing = `☀️【Today's Outfit】\n${clothingRecommendation}\n\n⚠️【Transit Alerts】\n${trafficReport}`;
    const subtitle = `${weather.condition}, ${weather.temperatureC}°C (Feels like ${weather.apparentTemperatureC}°C)`;

    console.log(`[${new Date().toISOString()}] Sending aggregated morning Bark notification...`);
    await sendBarkNotification(config, {
      title: "🇦🇺 Good Morning Sydney",
      subtitle,
      body: dailyBriefing
    });

  } catch (error) {
    console.error("❌ Scheduled Job Failed:", error);
    await sendBarkNotification(config, {
      title: "❌ SydFit Error",
      subtitle: "Scheduled Job Exception",
      body: error.message
    });
  }
}

async function main() {
  const config = loadConfig();
  
  let isMobileRequest = false;
  let mobilePrompt = "";

  if (process.env.GITHUB_CONTEXT) {
    try {
      const githubContext = JSON.parse(process.env.GITHUB_CONTEXT);
      if (githubContext.event_name === "repository_dispatch") {
        isMobileRequest = true;
        mobilePrompt = githubContext.event?.client_payload?.prompt || "";
      }
    } catch (e) {
      console.error("Failed to parse GITHUB_CONTEXT:", e);
    }
  }

  if (isMobileRequest && mobilePrompt) {
    await handleMobileRequest(config, mobilePrompt);
  } else {
    const force = process.argv.includes("--force") || config.runOnStart;
    
    if (!force && !isScheduledLocalTime({ timezone: config.scheduleTimezone, hour: 7, minute: 0 })) {
      console.log(
        `Skipping notification. Local time is ${formatLocalTime(new Date(), config.scheduleTimezone)}, not 7:00 AM.`
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