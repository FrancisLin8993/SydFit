import { getGcpAuthHeaders } from "./gcpAuth.js";

export async function addPreferenceToMemory(config, text) {
  try {
    const mem0ApiUrl = config.mem0ApiUrl;
    if (!mem0ApiUrl) throw new Error("MEM0_API_URL is not configured in config");
    const mem0AccessToken = config.mem0AccessToken;
    if (!mem0AccessToken) throw new Error("MEM0_ACCESS_TOKEN is missing for memory service");
    
    const gcpAuthHeaders = await getGcpAuthHeaders(mem0ApiUrl);
    const response = await fetch(`${mem0ApiUrl}/memory/add`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-worker-token": mem0AccessToken,
        ...gcpAuthHeaders 
      },
      body: JSON.stringify({
        text: text,
        user_id: 'francis'
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
    const gcpAuthHeaders = await getGcpAuthHeaders(config.mem0ApiUrl);
    const workerToken = process.env.MEM0_ACCESS_TOKEN;
    const searchEndpoint = `${config.mem0ApiUrl}/memory/search`; 

    const response = await fetch(searchEndpoint, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Worker-Token": workerToken ? workerToken.trim() : "",
        ...gcpAuthHeaders
      },
      body: JSON.stringify({
        context: query,
        user_id: 'francis',
        limit: 3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Memory search error: ${response.status} - ${errorText}`);
      return "";
    }
    
    const responseData = await response.json();
    
    const memories = responseData.memories;
    
    if (Array.isArray(memories)) {
      return memories.map(m => m.memory || m.text).filter(Boolean).join("; ");
    }
    return "";
  } catch (error) {
    console.error("❌ Failed to search memory:", error);
    return "";
  }
}