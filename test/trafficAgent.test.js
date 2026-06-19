import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";

import {
  buildTransitErrorMessage,
  containsMcpError,
  fetchTfNSWStreamData,
  handleTrafficQuery,
  summarizeMcpError
} from "../src/trafficAgent.js";

// 构造一个基础的符合全局使用的伪造配置对象
const mockConfig = {
  openaiApiKey: "fake-key",
  openaiModel: "gpt-4o-mini",
  barkDeviceKey: "fake-bark",
  barkServerUrl: "https://api.day.app",
  barkGroup: "Weather",
  barkLevel: "active",
  scheduleTimezone: "Australia/Sydney",
  userPrompt: "morning commute",
  runOnStart: false,
  userId: "fengci",
  mem0ApiUrl: "https://fake-mem0.run"
};

function streamResponse(text) {
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      }
    })
  };
}

// 🔑 在每个测试用例运行前，统一注入云端所需的配置环境变量，确保 fetchTfNSWStreamData 校验通过
beforeEach(() => {
  process.env.MCP_SERVER_URL = "https://fake-mcp-server.run/stream";
  process.env.WORKER_ACCESS_TOKEN = "fake-token";
});

// 🔑 在每个测试用例运行后，统一清理现场，防止污染其他测试文件的环境变量
afterEach(() => {
  delete process.env.MCP_SERVER_URL;
  delete process.env.WORKER_ACCESS_TOKEN;
});

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
  const fetcher = async () => streamResponse("[STATUS] running\ndata: [RESULT_START]\nNo current alerts\n[RESULT_END]\n");

  const result = await fetchTfNSWStreamData("train", fetcher);
  assert.equal(result, "No current alerts");
});

test("fetchTfNSWStreamData falls back to safe text when stream is empty", async () => {
  const fetcher = async () => streamResponse("[STATUS] running\ndata: [RESULT_START]\n\n[RESULT_END]\n");

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
  const fetcher = async () => streamResponse("data: [RESULT_START]\n[ERROR] invalid TfNSW response\n[RESULT_END]\n");

  const result = await handleTrafficQuery(mockConfig, "train", { client, fetcher });
  assert.equal(result, "Transit data error: [ERROR] invalid TfNSW response");
});

test("handleTrafficQuery uses OpenAI when MCP response has no system error tags", async (t) => {
  t.mock.method(console, "log", () => {});
  
  // 拦截全局 fetch，让内部的 memoryService 请求直接返回空数组，不影响核心逻辑
  t.mock.method(global, "fetch", async () => {
    return { ok: true, json: async () => [] };
  });

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

  const fetcher = async () => streamResponse("data: [RESULT_START]\nError: Trackwork on T1 Western Line\n[RESULT_END]\n");

  const result = await handleTrafficQuery(mockConfig, "train", { client, fetcher });
  assert.equal(result, "Commute is smooth.");
  assert.match(userContent, /Error: Trackwork on T1 Western Line/);
});