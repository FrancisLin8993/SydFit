import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it, mock, test } from "node:test";

mock.module("../src/utils/config.js", {
	exports: {
		loadConfig: () => ({
			openaiApiKey: "fake-key",
			openaiModel: "gpt-4o-mini",
		}),
	},
});

let normalizeWeather: any;
let first: any;
let getWeatherTool: any;

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
	getWeatherTool = mod.getWeatherTool;
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

describe("getWeatherTool (get_weather)", () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		global.fetch = undefined;
	});

	after(() => {
		global.fetch = originalFetch;
	});

	it("geocodes the given location then fetches the forecast for it", async () => {
		const calls = [];
		global.fetch = mock.fn(async (url) => {
			calls.push(url.toString());
			if (url.toString().includes("geocoding-api")) {
				return {
					ok: true,
					json: async () => ({
						results: [
							{
								latitude: -33.8688,
								longitude: 151.2093,
								name: "Sydney",
								admin1: "New South Wales",
							},
						],
					}),
				};
			}
			return { ok: true, json: async () => openMeteoPayload };
		});

		const tool = getWeatherTool({ scheduleTimezone: "Australia/Sydney" });
		const result = await tool.invoke(
			{},
			JSON.stringify({ location: "Sydney CBD" }),
		);

		assert.equal(calls.length, 2);
		assert.match(calls[0], /geocoding-api\.open-meteo\.com/);
		assert.match(calls[0], /name=Sydney\+CBD/);
		assert.match(calls[1], /api\.open-meteo\.com/);
		assert.match(calls[1], /latitude=-33\.8688/);
		assert.equal(result.location, "Sydney, New South Wales");
	});

	it("skips geocoding and uses the default coordinates for an empty location", async () => {
		const calls = [];
		global.fetch = mock.fn(async (url) => {
			calls.push(url.toString());
			return { ok: true, json: async () => openMeteoPayload };
		});

		const tool = getWeatherTool({});
		const result = await tool.invoke({}, JSON.stringify({ location: "" }));

		assert.equal(calls.length, 1);
		assert.match(calls[0], /latitude=-33\.928/);
		assert.equal(result.location, "Mascot, NSW");
	});

	it("falls back to default coordinates when geocoding finds no results", async () => {
		global.fetch = mock.fn(async (url) => {
			if (url.toString().includes("geocoding-api")) {
				return { ok: true, json: async () => ({ results: [] }) };
			}
			return { ok: true, json: async () => openMeteoPayload };
		});

		const tool = getWeatherTool({});
		const result = await tool.invoke(
			{},
			JSON.stringify({ location: "Nowhereville" }),
		);

		assert.equal(result.location, "Mascot, NSW");
	});

	it("falls back to default coordinates when geocoding request fails", async () => {
		global.fetch = mock.fn(async (url) => {
			if (url.toString().includes("geocoding-api")) {
				return { ok: false, status: 500 };
			}
			return { ok: true, json: async () => openMeteoPayload };
		});

		const tool = getWeatherTool({});
		const result = await tool.invoke(
			{},
			JSON.stringify({ location: "Broken Hill" }),
		);

		assert.equal(result.location, "Mascot, NSW");
	});

	it("surfaces an error message when the forecast request fails", async () => {
		global.fetch = mock.fn(async () => ({
			ok: false,
			status: 502,
			statusText: "Bad Gateway",
		}));

		const tool = getWeatherTool({});
		const result = await tool.invoke({}, JSON.stringify({ location: "" }));

		assert.match(result, /Open-Meteo request failed: 502/);
	});
});
