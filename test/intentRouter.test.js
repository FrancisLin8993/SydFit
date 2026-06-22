// test/intentRouter.test.js
import assert from "node:assert/strict";
import test from "node:test";
import { determineIntentAndMode } from "../src/intentRouter.js";

const mockConfig = {
  openaiApiKey: "fake-key",
  openaiModel: "gpt-4o-mini"
};

// 辅助函数：快速生成一个模拟的 OpenAI 客户端
function createMockClient(mockedResponseContent) {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: mockedResponseContent } }]
        })
      }
    }
  };
}

test("determineIntentAndMode detects explicit traffic mode from prompt", async () => {
  const client = createMockClient('{"intent": "traffic", "mode": "lightrail"}');
  
  const result = await determineIntentAndMode(
    mockConfig, 
    "is the L2 lightrail delayed?", 
    "", 
    { client }
  );
  
  assert.deepEqual(result, { intent: "traffic", mode: "lightrail" });
});

test("determineIntentAndMode detects weather intent and returns null mode", async () => {
  const client = createMockClient('{"intent": "weather", "mode": null}');
  
  const result = await determineIntentAndMode(
    mockConfig, 
    "do I need an umbrella today?", 
    "", 
    { client }
  );
  
  assert.deepEqual(result, { intent: "weather", mode: null });
});

test("determineIntentAndMode relies on memory for generic traffic queries", async (t) => {
  let passedMessages = [];
  
  // 自定义 Mock：为了拦截并断言 System Prompt 中是否成功拼装了 Memory
  const client = {
    chat: {
      completions: {
        create: async ({ messages }) => {
          passedMessages = messages;
          return { choices: [{ message: { content: '{"intent": "traffic", "mode": "ferry"}' } }] };
        }
      }
    }
  };

  const result = await determineIntentAndMode(
    mockConfig, 
    "check commute", 
    "I always take the ferry from Manly", // 传入记忆
    { client }
  );
  
  assert.deepEqual(result, { intent: "traffic", mode: "ferry" });

  // 断言：大模型的 System Prompt 中确实包含了我们给它的记忆
  const systemMessage = passedMessages.find(m => m.role === "system").content;
  assert.match(systemMessage, /I always take the ferry from Manly/);
});

test("determineIntentAndMode safely falls back to train on OpenAI API error", async (t) => {
  t.mock.method(console, "error", () => {}); // 屏蔽控制台报错输出

  const client = {
    chat: {
      completions: {
        create: async () => { 
          throw new Error("OpenAI API Network Timeout"); 
        }
      }
    }
  };
  
  const result = await determineIntentAndMode(
    mockConfig, 
    "traffic", 
    "", 
    { client }
  );
  
  assert.deepEqual(result, { intent: "traffic", mode: "train" });
});

test("determineIntentAndMode safely falls back to train on JSON parsing failure", async (t) => {
  t.mock.method(console, "error", () => {}); 

  const client = createMockClient("I am an AI and I don't want to output JSON.");
  
  const result = await determineIntentAndMode(
    mockConfig, 
    "traffic", 
    "", 
    { client }
  );
  
  assert.deepEqual(result, { intent: "traffic", mode: "train" });
});