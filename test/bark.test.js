import assert from "node:assert/strict";
import test from "node:test";

import { sendBarkNotification } from "../src/bark.js";

const config = {
  barkServerUrl: "https://api.day.app",
  barkDeviceKey: "device-key",
  barkGroup: "Weather",
  barkLevel: "active"
};

test("sendBarkNotification posts JSON payload to Bark", async () => {
  let request;
  const fetcher = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({ code: 200, message: "success" })
    };
  };

  const result = await sendBarkNotification(
    config,
    {
      title: "Mascot weather outfit",
      subtitle: "Clear sky",
      body: "Wear a light jacket."
    },
    fetcher
  );

  assert.equal(request.url, "https://api.day.app/push");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["Content-Type"], "application/json");
  assert.deepEqual(request.body, {
    device_key: "device-key",
    title: "Mascot weather outfit",
    subtitle: "Clear sky",
    body: "Wear a light jacket.",
    group: "Weather",
    level: "active"
  });
  assert.deepEqual(result, { code: 200, message: "success" });
});

test("sendBarkNotification throws on failed Bark response", async () => {
  const fetcher = async () => ({
    ok: false,
    status: 500,
    statusText: "Server Error",
    text: async () => "nope"
  });

  await assert.rejects(
    () => sendBarkNotification(config, { title: "t", body: "b" }, fetcher),
    /Bark push failed: 500 Server Error nope/
  );
});
