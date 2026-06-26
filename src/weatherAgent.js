import { openaiClient } from './openaiClient.js';
import { observeOpenAI } from "@langfuse/openai";
import { describeWeatherCode } from "./weatherCodes.js";
import { getRelevantMemories } from "./memoryService.js";
import { writeLog } from "./logger.js";

const DEFAULT_COORDINATES = {
  latitude: -33.928,
  longitude: 151.193,
  name: "Mascot, NSW"
};

export async function generateClothingRecommendation(config, query, weather, fetcher = fetch) {
  const userInput = buildRecommendationInput(weather, query);
  const client = observeOpenAI(openaiClient,
    { generationName: "clothing-advice", userId: "francis" }
  );
  try {

    const response = await client.chat.completions.create({
      model: config.openaiModel,
      messages: [
        {
          role: "system",
          content: "You write concise, practical morning clothing recommendations for someone in Sydney. Mention layers, rain gear, sun protection, and footwear only when relevant. Keep the message under 450 characters and make it suitable for a phone push notification."
        },
        {
          role: "user",
          content: userInput
        }
      ],
      max_tokens: 160
    });

    const text = response.choices[0]?.message?.content;
    const trimmedText = text.trim();
    return trimmedText;
  } catch (error) {
    writeLog("ERROR", "❌ Failed to generate output for clothing recommedation ", error);
    throw error;
  }
}

function buildRecommendationInput(weather, userPrompt = "") {
  const parts = [`Create today's clothing recommendation from this weather JSON:\n${JSON.stringify(weather, null, 2)}`];
  const trimmedPrompt = userPrompt.trim();

  if (trimmedPrompt) {
    parts.push(
      `User context or request from iPhone Shortcut:\n${trimmedPrompt}\nUse this context when deciding what to recommend.`
    );
  }

  return parts.join("\n\n");
}


async function getCoordinatesFromLocation(locationQuery, fetcher = fetch) {
  if (!locationQuery) return DEFAULT_COORDINATES;

  const params = new URLSearchParams({
    name: locationQuery,
    count: 1, 
    countryCode: "AU",
    language: "en",
    format: "json"
  });

  try {
    const response = await fetcher(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
    if (!response.ok) throw new Error(`Geocoding failed: ${response.status}`);
    
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const { latitude, longitude, name, admin1 } = data.results[0];
      return { 
        latitude, 
        longitude, 
        name: `${name}${admin1 ? ', ' + admin1 : ''}`.trim() 
      };
    }
  } catch (error) {
    writeLog("ERROR",`❌ [Geocoding Error] Failed to resolve "${locationQuery}":`, error);
  }
  
  return DEFAULT_COORDINATES;
}


export async function getWeather(config, fetcher = fetch) {

  const timezone = config.scheduleTimezone || "Australia/Sydney";

  const locationMemory = await getRelevantMemories(config, "preferred location, suburb, or city for weather forecast");
  writeLog("INFO", `🧠 [Memory] Retrieved weather location query: "${locationMemory || 'None'}"`);

  const targetLocation = locationMemory || "Mascot"; 
  const coords = await getCoordinatesFromLocation(targetLocation, fetcher);
  writeLog("INFO", `📍 [Location] Resolved to: ${coords.name} (${coords.latitude}, ${coords.longitude})`);

  const params = new URLSearchParams({
    latitude: String(coords.latitude),
    longitude: String(coords.longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max",
    forecast_days: "1",
    timezone: timezone
  });

  const response = await fetcher(`https://api.open-meteo.com/v1/forecast?${params}`);

  if (!response.ok) {
    throw new Error(`Open-Meteo request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  return normalizeWeather(data, coords.name);
}

export function normalizeWeather(data, resolvedLocationName) {
  const current = data.current || {};
  const daily = data.daily || {};

  return {
    location: resolvedLocationName, 
    observedAt: current.time,
    condition: describeWeatherCode(current.weather_code),
    temperatureC: current.temperature_2m,
    apparentTemperatureC: current.apparent_temperature,
    humidityPercent: current.relative_humidity_2m,
    precipitationMm: current.precipitation,
    rainMm: current.rain,
    showersMm: current.showers,
    cloudCoverPercent: current.cloud_cover,
    windSpeedKmh: current.wind_speed_10m,
    windGustsKmh: current.wind_gusts_10m,
    forecastHighC: first(daily.temperature_2m_max),
    forecastLowC: first(daily.temperature_2m_min),
    precipitationChancePercent: first(daily.precipitation_probability_max),
    uvIndexMax: first(daily.uv_index_max)
  };
}

export function first(value) {
  return Array.isArray(value) ? value[0] : value;
}