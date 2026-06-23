import assert from "node:assert/strict";
import test from "node:test";

import { buildRecommendationInput, extractOutputText, generateClothingRecommendation } from "../src/openai.js";

const config = {
  openaiApiKey: "openai-key",
  openaiModel: "gpt-5.4-mini"
};

test("extractOutputText reads response.output_text", () => {
  assert.equal(extractOutputText({ output_text: " Wear a jacket. " }), " Wear a jacket. ");
});

test("extractOutputText joins nested output text content", () => {
  assert.equal(
    extractOutputText({
      output: [
        {
          content: [
            { type: "output_text", text: "Wear a jumper." },
            { type: "refusal", text: "ignored" }
          ]
        },
        {
          content: [{ type: "output_text", text: "Take sunglasses." }]
        }
      ]
    }),
    "Wear a jumper.\nTake sunglasses."
  );
});

test("generateClothingRecommendation sends Responses API request and trims text", async () => {
  let request;
  const fetcher = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({ output_text: "  Light jacket and sneakers.  " })
    };
  };

  const recommendation = await generateClothingRecommendation(config, 'weather', { condition: "Clear sky" }, fetcher);

  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "Bearer openai-key");
  assert.equal(request.body.model, "gpt-5.4-mini");
  assert.match(request.body.input, /Clear sky/);
  assert.equal(recommendation, "Light jacket and sneakers.");
});

test("generateClothingRecommendation includes optional user prompt", async () => {
  let requestBody;
  const fetcher = async (url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ output_text: "Wear office layers." })
    };
  };

  await generateClothingRecommendation(config, 'office day, dinner after work', {}, fetcher);

  assert.match(requestBody.input, /User context or request from iPhone Shortcut/);
  assert.match(requestBody.input, /office day, dinner after work/);
});

test("buildRecommendationInput omits empty user prompt", () => {
  const input = buildRecommendationInput({ condition: "Clear sky" }, '');
  assert.match(input, /Clear sky/);
  assert.doesNotMatch(input, /User context or request/);
});

test("generateClothingRecommendation throws on failed OpenAI response", async () => {
  const fetcher = async () => ({
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    text: async () => "bad key"
  });

  await assert.rejects(
    () => generateClothingRecommendation(config, '', {}, fetcher),
    /OpenAI Responses API request failed: 401 Unauthorized bad key/
  );
});

test("generateClothingRecommendation throws when no output text is present", async () => {
  const fetcher = async () => ({
    ok: true,
    json: async () => ({ output: [] })
  });

  await assert.rejects(
    () => generateClothingRecommendation(config, '', {}, fetcher),
    /OpenAI response did not include output text/
  );
});
