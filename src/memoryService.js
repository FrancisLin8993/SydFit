export async function addFeedbackToMemory(config, text) {
  try {
    if (!config.mem0ApiUrl) throw new Error("MEM0_API_URL is not configured in config");
    
    const mem0AccessToken = process.env.MEM0_ACCESS_TOKEN;
    if (!mem0AccessToken) throw new Error("MEM0_ACCESS_TOKEN is missing for memory service");

    // 🔑 对齐 Swagger: 路径改为 /memory/add
    const response = await fetch(`${config.mem0ApiUrl}/memory/add`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-worker-token": mem0AccessToken 
      },
      body: JSON.stringify({
        text: text,
        user_id: config.userId
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Memory service error: ${response.status} - ${errorText}`);
    }
    return true;
  } catch (error) {
    console.error("❌ Failed to add memory:", error);
    return false;
  }
}

/**
 * 2. 根据主题检索相关记忆
 */
export async function getRelevantMemories(config, query) {
  try {
if (!config.mem0ApiUrl) return "";
    
    const workerToken = process.env.MEM0_ACCESS_TOKEN;
    const searchEndpoint = `${config.mem0ApiUrl}/memory/search`; 

    const response = await fetch(searchEndpoint, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Worker-Token": workerToken ? workerToken.trim() : ""
      },
      body: JSON.stringify({
        query: query,
        user_id: config.userId,
        limit: 3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Memory search error: ${response.status} - ${errorText}`);
      return "";
    }
    
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