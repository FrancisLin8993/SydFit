import { describe, it, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

const mockWriteLog = mock.fn();
mock.module("../src/logger.js", { namedExports: { writeLog: mockWriteLog } });

const mockGetGcpAuthHeaders = mock.fn(async () => ({ "Authorization": "Bearer test" }));
mock.module("../src/gcpAuth.js", { namedExports: { getGcpAuthHeaders: mockGetGcpAuthHeaders } });

const mockGetRelevantMemories = mock.fn(async () => "User takes T8");
mock.module("../src/memoryService.js", { namedExports: { getRelevantMemories: mockGetRelevantMemories } });

// Construct an OpenAI mock structure compatible with the code
const mockCreateChatCompletion = mock.fn(async () => ({
  choices: [{ message: { content: "Smooth commute." } }]
}));
mock.module("openai", {
  defaultExport: class OpenAI {
    chat = { completions: { create: mockCreateChatCompletion } };
  }
});

describe("Traffic Agent", () => {
  let trafficAgent;

  before(async () => {
    trafficAgent = await import("../src/trafficAgent.js");
  });

  beforeEach(() => {
    mockWriteLog.mock.resetCalls();
    mockGetGcpAuthHeaders.mock.resetCalls();
    mockCreateChatCompletion.mock.resetCalls();
  });

  it("should detect MCP errors correctly", () => {
    assert.strictEqual(trafficAgent.containsMcpError("[ERROR] System failure"), true);
    assert.strictEqual(trafficAgent.containsMcpError("All good"), false);
  });

  it("should filter alerts through handleTrafficQuery using memory", async () => {
    // Inject a mock fetcher to simulate MCP Server response
    global.fetch = mock.fn(async () => ({
      ok: true,
      body: {
        getReader: () => {
          let readCount = 0;
          return {
            read: async () => {
              if (readCount++ > 0) return { done: true };
              return { done: false, value: new TextEncoder().encode("T8 Alert") };
            }
          };
        }
      }
    }));

    const config = {
      mcpServerUrl: "https://test.run.app",
      mcpAccessToken: "test-token",
      openaiApiKey: "test-key",
      openaiModel: "test-model"
    };

    const advice = await trafficAgent.handleTrafficQuery(config, "how is traffic", "User takes T8");
    
    assert.strictEqual(advice, "Smooth commute.");
    assert.strictEqual(mockCreateChatCompletion.mock.calls.length, 1);
  });
});