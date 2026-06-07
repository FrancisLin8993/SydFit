import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTransitErrorMessage,
  containsMcpError,
  fetchTfNSWStreamData,
  handleTrafficQuery,
  summarizeMcpError
} from "../src/trafficAgent.js";

function streamResponse(text) {
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      }
    })
  };
}

test("containsMcpError detects MCP error messages", () => {
  assert.equal(containsMcpError("Error: TfNSW API key missing"), true);
  assert.equal(containsMcpError("server returned errors from upstream"), true);
  assert.equal(containsMcpError("No current alerts"), false);
});

test("summarizeMcpError strips stream markers and compacts whitespace", () => {
  assert.equal(
    summarizeMcpError("[STATUS] running\n[RESULT_START]\nError: upstream unavailable\n[RESULT_END]\n"),
    "Error: upstream unavailable"
  );
});

test("buildTransitErrorMessage formats transit section error", () => {
  assert.equal(
    buildTransitErrorMessage("Error: upstream unavailable"),
    "Transit data error: Error: upstream unavailable"
  );
});

test("fetchTfNSWStreamData returns a transit error message on request failure", async (t) => {
  t.mock.method(console, "error", () => {});

  const fetcher = async () => {
    throw new Error("network offline");
  };

  const result = await fetchTfNSWStreamData("train", fetcher);
  assert.equal(result, "Transit data error: Cannot retrieve traffic alert. (network offline)");
});

test("fetchTfNSWStreamData strips MCP stream wrapper", async () => {
  const fetcher = async () => streamResponse("[STATUS] running\n[RESULT_START]\nNo current alerts\n[RESULT_END]\n");

  const result = await fetchTfNSWStreamData("train", fetcher);
  assert.equal(result, "No current alerts");
});

test("handleTrafficQuery bypasses OpenAI when MCP returns an error", async (t) => {
  t.mock.method(console, "log", () => {});

  const client = {
    chat: {
      completions: {
        create: async () => {
          throw new Error("OpenAI should not be called");
        }
      }
    }
  };
  const fetcher = async () => streamResponse("[RESULT_START]\nError: invalid TfNSW response\n[RESULT_END]\n");

  const result = await handleTrafficQuery("morning commute", "train", { client, fetcher });
  assert.equal(result, "Transit data error: Error: invalid TfNSW response");
});

test("handleTrafficQuery uses OpenAI when MCP response has no error", async (t) => {
  t.mock.method(console, "log", () => {});

  let userContent = "";
  const client = {
    chat: {
      completions: {
        create: async ({ messages }) => {
          userContent = messages.at(-1).content;
          return { choices: [{ message: { content: "Commute is smooth." } }] };
        }
      }
    }
  };
  const fetcher = async () => streamResponse("[RESULT_START]\nNo current alerts\n[RESULT_END]\n");

  const result = await handleTrafficQuery("morning commute", "train", { client, fetcher });
  assert.equal(result, "Commute is smooth.");
  assert.match(userContent, /No current alerts/);
});
