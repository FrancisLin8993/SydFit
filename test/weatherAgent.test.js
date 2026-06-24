import assert from "node:assert/strict";
import test from "node:test";

import { first, getWeather, normalizeWeather } from "../src/weatherAgent.js";

const openMeteoPayload = {
  current: {
    time: "2026-06-07T10:45",
    temperature_2m: 14.5,
    apparent_temperature: 12.7,
    relative_humidity_2m: 62,
    precipitation: 0,
    rain: 0,
    showers: 0,
    weather_code: 0,
    cloud_cover: 1,
    wind_speed_10m: 7.3,
    wind_gusts_10m: 21.6
  },
  daily: {
    temperature_2m_max: [18.2],
    temperature_2m_min: [8.8],
    precipitation_probability_max: [1],
    uv_index_max: [3.5]
  }
};


const mockConfig = {
  scheduleTimezone: "Australia/Sydney"
};

test("normalizeWeather maps Open-Meteo fields to app weather shape", () => {
  // 注入第二个参数 "Mascot, NSW"
  assert.deepEqual(normalizeWeather(openMeteoPayload, "Mascot, NSW"), {
    location: "Mascot, NSW",
    observedAt: "2026-06-07T10:45",
    condition: "Clear sky",
    temperatureC: 14.5,
    apparentTemperatureC: 12.7,
    humidityPercent: 62,
    precipitationMm: 0,
    rainMm: 0,
    showersMm: 0,
    cloudCoverPercent: 1,
    windSpeedKmh: 7.3,
    windGustsKmh: 21.6,
    forecastHighC: 18.2,
    forecastLowC: 8.8,
    precipitationChancePercent: 1,
    uvIndexMax: 3.5
  });
});

test("normalizeWeather tolerates missing current and daily objects", () => {
  const weather = normalizeWeather({}, "Mascot, NSW");
  assert.equal(weather.location, "Mascot, NSW");
  assert.equal(weather.condition, "Weather code undefined");
  assert.equal(weather.temperatureC, undefined);
  assert.equal(weather.forecastHighC, undefined);
});

test("first returns first array item or the original value", () => {
  assert.equal(first([42, 99]), 42);
  assert.equal(first("value"), "value");
  assert.equal(first(undefined), undefined);
});

test("getWeather requests forecast for resolved location and normalizes response", async () => {
  let requestedForecastUrl;
  
  const mockFetcher = async (url) => {
    if (url.includes("geocoding-api")) {
      return {
        ok: true,
        json: async () => ({
          results: [{ latitude: -33.928, longitude: 151.193, name: "Mascot", admin1: "New South Wales" }]
        })
      };
    }
    
    requestedForecastUrl = new URL(url);
    return {
      ok: true,
      json: async () => openMeteoPayload
    };
  };

  const weather = await getWeather(mockConfig, mockFetcher);

  assert.equal(requestedForecastUrl.origin, "https://api.open-meteo.com");
  assert.equal(requestedForecastUrl.pathname, "/v1/forecast");
  assert.equal(requestedForecastUrl.searchParams.get("latitude"), "-33.928");
  assert.equal(requestedForecastUrl.searchParams.get("longitude"), "151.193");
  assert.equal(requestedForecastUrl.searchParams.get("timezone"), "Australia/Sydney");
  
  assert.equal(weather.condition, "Clear sky");
  assert.equal(weather.location, "Mascot, New South Wales"); 
});

test("getWeather throws on failed weather response", async () => {
  const mockFetcher = async (url) => {
    if (url.includes("geocoding-api")) {
      return {
        ok: true,
        json: async () => ({ results: [] }) 
      };
    }
    
    return {
      ok: false,
      status: 503,
      statusText: "Service Unavailable"
    };
  };

  await assert.rejects(
    () => getWeather(mockConfig, mockFetcher),
    /Open-Meteo request failed: 503 Service Unavailable/
  );
});