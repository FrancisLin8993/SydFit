import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it, mock } from "node:test";

const mockWriteLog = mock.fn();
mock.module("../src/utils/logger.js", {
	exports: { writeLog: mockWriteLog },
});

describe("tfnsw service (fetchTfnswAlerts)", () => {
	let fetchTfnswAlerts: any;
	const originalFetch = global.fetch;

	const config = {
		tfnswApiKey: "tfnsw-key",
		scheduleTimezone: "Australia/Sydney",
	};

	before(async () => {
		({ fetchTfnswAlerts } = await import("../src/services/tfnsw.js"));
	});

	beforeEach(() => {
		mockWriteLog.mock.resetCalls();
	});

	after(() => {
		global.fetch = originalFetch;
	});

	function withResponse(body: unknown) {
		let captured: any;
		global.fetch = mock.fn(async (url, options) => {
			captured = { url: url.toString(), options };
			return { ok: true, json: async () => body };
		});
		return () => captured;
	}

	it("throws when the API key is not configured", async () => {
		await assert.rejects(
			() => fetchTfnswAlerts({}, "all"),
			/TFNSW_API_KEY is not configured/,
		);
	});

	it("calls the v2 JSON endpoint with the apikey header", async () => {
		const getCaptured = withResponse({ entity: [] });

		await fetchTfnswAlerts(config, "all");

		const captured = getCaptured();
		assert.equal(
			captured.url,
			"https://api.transport.nsw.gov.au/v2/gtfs/alerts/all?format=json",
		);
		assert.equal(captured.options.headers.Authorization, "apikey tfnsw-key");
	});

	it("maps each mode to its endpoint suffix", async () => {
		const cases: Array<[string, string]> = [
			["train", "/sydneytrains"],
			["metro", "/metro"],
			["lightrail", "/lightrail"],
			["bus", "/buses"],
			["ferry", "/ferries"],
			["all", "/all"],
		];

		for (const [mode, suffix] of cases) {
			const getCaptured = withResponse({ entity: [] });
			await fetchTfnswAlerts(config, mode);
			assert.equal(
				getCaptured().url,
				`https://api.transport.nsw.gov.au/v2/gtfs/alerts${suffix}?format=json`,
			);
		}
	});

	it("throws on a non-ok response", async () => {
		global.fetch = mock.fn(async () => ({ ok: false, status: 503 }));

		await assert.rejects(
			() => fetchTfnswAlerts(config, "all"),
			/TfNSW tool failed: 503/,
		);
	});

	it("maps camelCase GTFS-RT entities to TransportAlerts", async () => {
		withResponse({
			entity: [
				{
					alert: {
						headerText: {
							translation: [
								{ text: "T8 Line Delay", language: "en" },
								{ text: "<p>T8 Line Delay</p>", language: "en/html" },
							],
						},
						descriptionText: {
							translation: [{ text: "Trackwork on T8", language: "en" }],
						},
						activePeriod: [
							{ start: "1751702400", end: "1751731200" },
							{ start: "1751702400" }, // no end — dropped
						],
						cause: "MAINTENANCE",
						effect: "REDUCED_SERVICE",
						url: {
							translation: [
								{ text: "https://transportnsw.info/alert", language: "en" },
							],
						},
					},
				},
				// Entity without an alert (e.g. a tripUpdate) — skipped.
				{ id: "no-alert-here" },
			],
		});

		const alerts = await fetchTfnswAlerts(config, "all");

		assert.equal(alerts.length, 1);
		const alert = alerts[0];
		assert.equal(alert.title, "T8 Line Delay");
		assert.equal(alert.description, "Trackwork on T8");
		assert.equal(alert.activePeriods.length, 1);
		assert.match(alert.activePeriods[0].start, /\d/);
		assert.equal(alert.cause, "MAINTENANCE");
		assert.equal(alert.effect, "REDUCED SERVICE");
		assert.equal(alert.url, "https://transportnsw.info/alert");
	});

	it("falls back to snake_case field names", async () => {
		withResponse({
			entity: [
				{
					alert: {
						header_text: {
							translation: [{ text: "Ferry update", language: "en" }],
						},
						description_text: {
							translation: [{ text: "Wharf closed", language: "en" }],
						},
						active_period: [{ start: "1751702400", end: "1751731200" }],
					},
				},
			],
		});

		const alerts = await fetchTfnswAlerts(config, "ferry");

		assert.equal(alerts[0].title, "Ferry update");
		assert.equal(alerts[0].description, "Wharf closed");
		assert.equal(alerts[0].activePeriods.length, 1);
	});

	it("falls back to a non-html translation when no 'en' entry exists, and defaults the title", async () => {
		withResponse({
			entity: [
				{
					alert: {
						headerText: {
							translation: [
								{ text: "<p>html only</p>", language: "en/html" },
								{ text: "plain fallback", language: "und" },
							],
						},
					},
				},
				{
					alert: {
						// No headerText at all — title defaults to "Alert".
						descriptionText: {
							translation: [{ text: "desc", language: "en" }],
						},
					},
				},
			],
		});

		const alerts = await fetchTfnswAlerts(config, "all");

		assert.equal(alerts[0].title, "plain fallback");
		assert.equal(alerts[1].title, "Alert");
		assert.equal(alerts[1].cause, null);
		assert.equal(alerts[1].effect, null);
		assert.equal(alerts[1].url, null);
		assert.deepEqual(alerts[1].activePeriods, []);
	});

	it("returns an empty array when the feed has no entities", async () => {
		withResponse({});

		const alerts = await fetchTfnswAlerts(config, "all");

		assert.deepEqual(alerts, []);
	});
});
