import assert from "node:assert/strict";
import { before, mock, test } from "node:test";

mock.module("../src/utils/config.js", {
	namedExports: {
		loadConfig: () => ({
			openaiApiKey: "fake-key",
			openaiModel: "gpt-4o-mini",
		}),
	},
});

let normalizeWeather, first;

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
		wind_gusts_10m: 21.6,
	},
	daily: {
		temperature_2m_max: [18.2],
		temperature_2m_min: [8.8],
		precipitation_probability_max: [1],
		uv_index_max: [3.5],
	},
};

before(async () => {
	const mod = await import("../src/tools/weatherTool.js");
	normalizeWeather = mod.normalizeWeather;
	first = mod.first;
});

test("normalizeWeather maps Open-Meteo fields to app weather shape", () => {
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
		uvIndexMax: 3.5,
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
