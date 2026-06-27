import assert from "node:assert/strict";
import test from "node:test";

import { sendBarkNotification } from "../src/bark.js";

const config = {
	barkServerUrl: "https://api.day.app",
	barkDeviceKey: "device-key",
	barkGroup: "Weather",
	barkLevel: "active",
};

test("sendBarkNotification posts JSON payload with markdown to Bark", async (t) => {
	let request;
	const fetcher = async (url, options) => {
		request = { url, options, body: JSON.parse(options.body) };
		return {
			ok: true,
			text: async () => "success",
		};
	};

	t.mock.method(console, "log", () => {});

	await sendBarkNotification(
		config,
		{
			title: "Mascot weather outfit",
			subtitle: "Clear sky",
			body: "Wear a light jacket.", // This is passed as 'body' but mapped to 'markdown' internally
		},
		fetcher,
	);

	assert.equal(request.url, "https://api.day.app/device-key");
	assert.equal(request.options.method, "POST");
	assert.equal(
		request.options.headers["Content-Type"],
		"application/json; charset=utf-8",
	);

	assert.deepEqual(request.body, {
		title: "Mascot weather outfit",
		subtitle: "Clear sky",
		markdown: "Wear a light jacket.",
		group: "Weather",
		level: "active",
		isArchive: 1,
	});
});

test("sendBarkNotification throws on failed Bark response", async (t) => {
	// Mute console.error for clean test output
	t.mock.method(console, "error", () => {});

	const fetcher = async () => ({
		ok: false,
		status: 500,
		text: async () => "nope",
	});

	await assert.rejects(
		() => sendBarkNotification(config, { title: "t", body: "b" }, fetcher),
		/Bark HTTP 500: nope/,
	);
});
