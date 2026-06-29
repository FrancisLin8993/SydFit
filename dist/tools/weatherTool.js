import { z } from "zod";
import { tool } from "@openai/agents";
import { describeWeatherCode } from "../utils/weatherCodes.js";
import { writeLog } from "../utils/logger.js";
const DEFAULT_COORDINATES = {
	latitude: -33.928,
	longitude: 151.193,
	name: "Mascot, NSW",
};
async function getCoordinatesFromLocation(locationQuery, fetcher = fetch) {
	if (!locationQuery) return DEFAULT_COORDINATES;
	const params = new URLSearchParams({
		name: locationQuery,
		count: 1,
		countryCode: "AU",
		language: "en",
		format: "json",
	});
	try {
		const response = await fetcher(
			`https://geocoding-api.open-meteo.com/v1/search?${params}`,
		);
		if (!response.ok) throw new Error(`Geocoding failed: ${response.status}`);
		const data = await response.json();
		if (data.results && data.results.length > 0) {
			const { latitude, longitude, name, admin1 } = data.results[0];
			return {
				latitude,
				longitude,
				name: `${name}${admin1 ? ", " + admin1 : ""}`.trim(),
			};
		}
	} catch (error) {
		writeLog(
			"ERROR",
			`❌ [Geocoding Error] Failed to resolve "${locationQuery}":`,
			error,
		);
	}
	return DEFAULT_COORDINATES;
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
		uvIndexMax: first(daily.uv_index_max),
	};
}
export function first(value) {
	return Array.isArray(value) ? value[0] : value;
}
// CHANGED: getWeather is now a proper Agents SDK tool, built via tool() with
// config captured in closure — same factory pattern as createGetTfnswAlertsTool
// and createGetUserTransitMemoryTool. Location is now a TOOL PARAMETER the
// agent decides, rather than being resolved internally by calling memory
// directly — the agent is responsible for first calling the location-memory
// tool, then passing the result here as `location`.
export const getWeatherTool = (config) =>
	tool({
		name: "get_weather",
		description:
			"Fetches the current weather and today's forecast for a Sydney-area location. Call get_user_location_memory first to determine which location to use, or default to 'Mascot' if no preference is found.",
		parameters: z.object({
			location: z
				.string()
				.describe(
					"The suburb or city to fetch weather for, e.g. 'Mascot' or 'Sydney CBD'.",
				),
		}),
		execute: async ({ location }, _runContext, fetcher = fetch) => {
			const timezone = config.scheduleTimezone || "Australia/Sydney";
			const coords = await getCoordinatesFromLocation(location, fetcher);
			writeLog(
				"INFO",
				`📍 [Location] Resolved to: ${coords.name} (${coords.latitude}, ${coords.longitude})`,
			);
			const params = new URLSearchParams({
				latitude: String(coords.latitude),
				longitude: String(coords.longitude),
				current:
					"temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m",
				daily:
					"temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max",
				forecast_days: "1",
				timezone: timezone,
			});
			const response = await fetcher(
				`https://api.open-meteo.com/v1/forecast?${params}`,
			);
			if (!response.ok) {
				throw new Error(
					`Open-Meteo request failed: ${response.status} ${response.statusText}`,
				);
			}
			const data = await response.json();
			return normalizeWeather(data, coords.name);
		},
	});
