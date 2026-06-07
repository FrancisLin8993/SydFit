import { describeWeatherCode } from "./weatherCodes.js";

const MASCOT_COORDINATES = {
  latitude: -33.928,
  longitude: 151.193
};

export async function getMascotWeather(timezone = "Australia/Sydney", fetcher = fetch) {
  const params = new URLSearchParams({
    latitude: String(MASCOT_COORDINATES.latitude),
    longitude: String(MASCOT_COORDINATES.longitude),
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max",
    forecast_days: "1",
    timezone
  });

  const response = await fetcher(`https://api.open-meteo.com/v1/forecast?${params}`);

  if (!response.ok) {
    throw new Error(`Open-Meteo request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return normalizeWeather(data);
}

export function normalizeWeather(data) {
  const current = data.current || {};
  const daily = data.daily || {};

  return {
    location: "Mascot, NSW",
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
