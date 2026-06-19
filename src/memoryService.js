// src/memoryService.js

/**
 * 1. 存储用户的反馈习惯
 */
export async function addFeedbackToMemory(config, text) {
  try {
    if (!config.mem0ApiUrl) throw new Error("MEM0_API_URL is not configured in config");

    const response = await fetch(`${config.mem0ApiUrl}/v1/memories/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text,
        user_id: config.userId
      })
    });

    if (!response.ok) throw new Error(`Mem0 error: ${response.status}`);
    return true;
  } catch (error) {
    console.error("❌ Failed to add memory to Mem0:", error);
    return false;
  }
}

/**
 * 2. 根据主题检索相关记忆
 */
export async function getRelevantMemories(config, query) {
  try {
    if (!config.mem0ApiUrl) return "";

    const response = await fetch(`${config.mem0ApiUrl}/v1/memories/search/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: query,
        user_id: config.userId
      })
    });

    if (!response.ok) return "";
    const memories = await response.json();
    
    if (Array.isArray(memories)) {
      return memories.map(m => m.memory || m.text).filter(Boolean).join("; ");
    }
    return "";
  } catch (error) {
    console.error("❌ Failed to search memory:", error);
    return "";
  }
}