import assert from "node:assert/strict";
import test, { describe, mock, afterEach } from "node:test";

mock.module("../src/config.js", {
  namedExports: {
    loadConfig: () => ({ 
      userId: "test-user", 
      scheduleTimezone: "Australia/Sydney",
      sydFitApiKey: "test-secret-key" 
    })
  }
});

mock.module("../src/bark.js", { namedExports: { sendBarkNotification: mock.fn() } });
mock.module("../src/weatherAgent.js", { namedExports: { getWeather: mock.fn() } });
mock.module("../src/openai.js", { namedExports: { generateClothingRecommendation: mock.fn() } });
mock.module("../src/trafficAgent.js", { 
  namedExports: { 
    handleTrafficQuery: mock.fn(), 
    buildTransitErrorMessage: mock.fn() 
  } 
});
mock.module("../src/memoryService.js", { 
  namedExports: { 
    addPreferenceToMemory: mock.fn(), 
    getRelevantMemories: mock.fn() 
  } 
});
mock.module("../src/intentRouter.js", { namedExports: { determineIntentAndMode: mock.fn() } });

const { app } = await import("../src/index.js");

const barkMock = await import("../src/bark.js");
const intentRouterMock = await import("../src/intentRouter.js");
const memoryServiceMock = await import("../src/memoryService.js");
const trafficAgentMock = await import("../src/trafficAgent.js");
const weatherMock = await import("../src/weatherAgent.js");
const openaiMock = await import("../src/openai.js");

describe("SydFit Hono API Tests", () => {
  
  process.env.SYDFIT_API_KEY = "test-secret-key";

  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
    barkMock.sendBarkNotification.mock.resetCalls();
    weatherMock.getWeather.mock.resetCalls();
    openaiMock.generateClothingRecommendation.mock.resetCalls();
    trafficAgentMock.handleTrafficQuery.mock.resetCalls();
    memoryServiceMock.getRelevantMemories.mock.resetCalls();
    memoryServiceMock.addPreferenceToMemory.mock.resetCalls();
    intentRouterMock.determineIntentAndMode.mock.resetCalls();
  });

  test("🛡️ Global Auth: Should return 401 Unauthorized if API key is missing", async () => {
    const res = await app.request('/api/ask', { method: 'POST' });
    
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, 'Unauthorized');
  });

  test("🛡️ Global Auth: Should return 401 Unauthorized if API key is incorrect", async () => {
    const res = await app.request('/api/cron', {
      method: 'POST',
      headers: { 'x-sydfit-token': 'wrong-key' }
    });
    assert.equal(res.status, 401);
  });

  describe("📱 POST /api/ask (Mobile Real-time Endpoint)", () => {
    
    test("🧠 Memory Intent Branch: Should save extracted preference and trigger Bark push", async () => {
      memoryServiceMock.getRelevantMemories.mock.mockImplementation(() => Promise.resolve(""));
      intentRouterMock.determineIntentAndMode.mock.mockImplementation(() =>
        Promise.resolve({ intent: 'memory', mode: null, preference: 'I like cold coffee' })
      );
      memoryServiceMock.addPreferenceToMemory.mock.mockImplementation(() => Promise.resolve(true));
      barkMock.sendBarkNotification.mock.mockImplementation(() => Promise.resolve());

      const res = await app.request('/api/ask', {
        method: 'POST',
        headers: { 'x-sydfit-token': 'test-secret-key', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'remember that I like cold coffee' })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(memoryServiceMock.addPreferenceToMemory.mock.callCount(), 1);
      assert.equal(
        memoryServiceMock.addPreferenceToMemory.mock.calls[0].arguments[1],
        'I like cold coffee'
      );
      assert.equal(barkMock.sendBarkNotification.mock.callCount(), 1);
      const barkArgs = barkMock.sendBarkNotification.mock.calls[0].arguments[1];
      assert.match(barkArgs.body, /SydFit has remembered this preference/);
    });

    test("🧠 Memory Intent Branch: Should report failure when no preference can be extracted", async () => {
      memoryServiceMock.getRelevantMemories.mock.mockImplementation(() => Promise.resolve(""));
      intentRouterMock.determineIntentAndMode.mock.mockImplementation(() =>
        Promise.resolve({ intent: 'memory', mode: null, preference: '' })
      );
      barkMock.sendBarkNotification.mock.mockImplementation(() => Promise.resolve());

      const res = await app.request('/api/ask', {
        method: 'POST',
        headers: { 'x-sydfit-token': 'test-secret-key', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'remember' })
      });

      assert.equal(res.status, 200);
      assert.equal(memoryServiceMock.addPreferenceToMemory.mock.callCount(), 0);
      const barkArgs = barkMock.sendBarkNotification.mock.calls[0].arguments[1];
      assert.match(barkArgs.body, /No preference could be detected/);
    });

    test("🚂 Traffic Intent Branch: Should route to traffic agent and trigger Bark push", async () => {
      memoryServiceMock.getRelevantMemories.mock.mockImplementation(() => Promise.resolve(""));
      intentRouterMock.determineIntentAndMode.mock.mockImplementation(() => Promise.resolve({ intent: 'traffic', mode: 'train' }));
      trafficAgentMock.handleTrafficQuery.mock.mockImplementation(() => Promise.resolve("T8 Line is operating normally."));
      barkMock.sendBarkNotification.mock.mockImplementation(() => Promise.resolve());

      const res = await app.request('/api/ask', {
        method: 'POST',
        headers: { 'x-sydfit-token': 'test-secret-key', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'How is Sydney train today' })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.message, "Bark push triggered successfully.");
      assert.equal(trafficAgentMock.handleTrafficQuery.mock.callCount(), 1);

      // Assert Bark was triggered with the traffic reply
      assert.equal(barkMock.sendBarkNotification.mock.callCount(), 1);
      const barkArgs = barkMock.sendBarkNotification.mock.calls[0].arguments[1];
      assert.equal(barkArgs.body, "T8 Line is operating normally.");
    });

    test("☀️ Weather Intent Branch: Should route to weather agent and trigger Bark push", async () => {
      memoryServiceMock.getRelevantMemories.mock.mockImplementation(() => Promise.resolve(""));
      intentRouterMock.determineIntentAndMode.mock.mockImplementation(() => Promise.resolve({ intent: 'weather', mode: null }));
      weatherMock.getWeather.mock.mockImplementation(() => Promise.resolve({ condition: 'Sunny', temperatureC: 22 }));
      openaiMock.generateClothingRecommendation.mock.mockImplementation(() => Promise.resolve("Wear a t-shirt."));
      barkMock.sendBarkNotification.mock.mockImplementation(() => Promise.resolve());

      const res = await app.request('/api/ask', {
        method: 'POST',
        headers: { 'x-sydfit-token': 'test-secret-key', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'Is it cold today' })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.message, "Bark push triggered successfully.");
      assert.equal(weatherMock.getWeather.mock.callCount(), 1);
      assert.equal(openaiMock.generateClothingRecommendation.mock.callCount(), 1);

      // Assert Bark was triggered with the clothing recommendation
      assert.equal(barkMock.sendBarkNotification.mock.callCount(), 1);
      const barkArgs = barkMock.sendBarkNotification.mock.calls[0].arguments[1];
      assert.equal(barkArgs.body, "Wear a t-shirt.");
    });
  });

  describe("⏰ POST /api/cron (Scheduled Job Endpoint)", () => {
    
    test("✅ Success Flow: Should fetch data concurrently and send Bark notifications", async () => {
      weatherMock.getWeather.mock.mockImplementation(() => Promise.resolve({ condition: 'Rainy', temperatureC: 15, apparentTemperatureC: 13 }));
      trafficAgentMock.handleTrafficQuery.mock.mockImplementation(() => Promise.resolve("No delays."));
      trafficAgentMock.buildTransitErrorMessage.mock.mockImplementation(() => null); 
      openaiMock.generateClothingRecommendation.mock.mockImplementation(() => Promise.resolve("Bring an umbrella."));
      barkMock.sendBarkNotification.mock.mockImplementation(() => Promise.resolve());

      const res = await app.request('/api/cron', {
        method: 'POST',
        headers: { 'x-sydfit-token': 'test-secret-key' }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      
      assert.equal(barkMock.sendBarkNotification.mock.callCount(), 2);
    });

    test("⚠️ Error Flow: Should catch exceptions and send error Bark notification", async () => {
      weatherMock.getWeather.mock.mockImplementation(() => Promise.reject(new Error("API Down")));

      const res = await app.request('/api/cron', {
        method: 'POST',
        headers: { 'x-sydfit-token': 'test-secret-key' }
      });

      assert.equal(res.status, 500);
      const data = await res.json();
      assert.equal(data.success, false);
      
      const barkCalls = barkMock.sendBarkNotification.mock.calls;
      assert.ok(barkCalls.length > 0);
      assert.equal(barkCalls[0].arguments[1].title, "❌ SydFit Error");
    });
  });
});