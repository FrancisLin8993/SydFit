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

test("containsMcpError detects MCP system error tags explicitly", () => {
  assert.equal(containsMcpError("Error: TfNSW API key missing"), false);
  assert.equal(containsMcpError("server returned errors from upstream"), false);
  assert.equal(containsMcpError("[CRITICAL_ERROR] strict mode access failed"), true);
  assert.equal(containsMcpError("[ERROR] Something went wrong in FastMCP"), true);
  assert.equal(containsMcpError("No current alerts"), false);
});

test("buildTransitErrorMessage handles bracketed critical MCP errors", () => {
  const rawError =
    "[CRITICAL_ERROR] 'caller', 'callee', and 'arguments' properties may not be accessed on strict mode functions or the arguments objects for calls to them\n";

  assert.equal(
    buildTransitErrorMessage(rawError),
    "Transit data error: [CRITICAL_ERROR] 'caller', 'callee', and 'arguments' properties may not be accessed on strict mode functions or the arguments objects for calls to them"
  );
});

test("summarizeMcpError strips stream markers and compacts whitespace", () => {
  assert.equal(
    summarizeMcpError("[STATUS] running\n[RESULT_START]\nError: upstream unavailable\n[RESULT_END]\n"),
    "Error: upstream unavailable"
  );
});

test("buildTransitErrorMessage formats transit section error", () => {
  const rawError = "[ERROR] upstream unavailable";
  assert.equal(
    buildTransitErrorMessage(rawError),
    "Transit data error: [ERROR] upstream unavailable"
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

test("fetchTfNSWStreamData falls back to safe text when stream is empty", async () => {
  const fetcher = async () => streamResponse("[STATUS] running\n[RESULT_START]\n\n[RESULT_END]\n");

  const result = await fetchTfNSWStreamData("train", fetcher);
  assert.equal(result, "No active transport alerts for [train] right now. Everything is running smoothly.");
});

test("handleTrafficQuery bypasses OpenAI when MCP returns a systemic error tag", async (t) => {
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
  const fetcher = async () => streamResponse("[RESULT_START]\n[ERROR] invalid TfNSW response\n[RESULT_END]\n");

  const result = await handleTrafficQuery("morning commute", "train", { client, fetcher });
  assert.equal(result, "Transit data error: [ERROR] invalid TfNSW response");
});

test("handleTrafficQuery uses OpenAI when MCP response has no system error tags", async (t) => {
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
  

  const fetcher = async () => streamResponse("[RESULT_START]\nError: Trackwork on T1 Western Line\n[RESULT_END]\n");

  const result = await handleTrafficQuery("morning commute", "train", { client, fetcher });
  assert.equal(result, "Commute is smooth.");
  assert.match(userContent, /Error: Trackwork on T1 Western Line/);
});