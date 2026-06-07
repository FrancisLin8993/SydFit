import { sendBarkNotification } from "./bark.js";
import { loadConfig } from "./config.js";
import { generateClothingRecommendation } from "./openai.js";
import { formatLocalTime, isScheduledLocalTime } from "./scheduler.js";
import { getWeather } from "./weather.js";

async function runJob(config) {
  console.log(`[${new Date().toISOString()}] Fetching Mascot weather...`);
  const weather = await getWeather(config.scheduleTimezone);

  console.log(`[${new Date().toISOString()}] Generating clothing recommendation...`);
  const recommendation = await generateClothingRecommendation(config, weather);

  const subtitle = `${weather.condition}, ${weather.temperatureC}C feels like ${weather.apparentTemperatureC}C`;

  console.log(`[${new Date().toISOString()}] Sending Bark notification...`);
  await sendBarkNotification(config, {
    title: "Mascot weather outfit",
    subtitle,
    body: recommendation
  });

  console.log(`[${new Date().toISOString()}] Notification sent.`);
}

async function main() {
  const config = loadConfig();
  const force = process.argv.includes("--force") || config.runOnStart;

  if (!force && !isScheduledLocalTime({ timezone: config.scheduleTimezone, hour: 7, minute: 0 })) {
    console.log(
      `Skipping notification. Local time is ${formatLocalTime(new Date(), config.scheduleTimezone)}, not 7:00 AM.`
    );
    return;
  }

  await runJob(config);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
