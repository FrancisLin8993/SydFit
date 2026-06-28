import { getGcpAuthHeaders } from "./gcpAuth.js";
import { writeLog } from "./logger.js";

export async function addPreferenceToMemory(config, text) {
	try {
		const mem0ApiUrl = config.mem0ApiUrl;
		if (!mem0ApiUrl)
			throw new Error("MEM0_API_URL is not configured in config");
		const mem0AccessToken = config.mem0AccessToken;
		if (!mem0AccessToken)
			throw new Error("MEM0_ACCESS_TOKEN is missing for memory service");

		const gcpAuthHeaders = await getGcpAuthHeaders(mem0ApiUrl);
		const response = await fetch(`${mem0ApiUrl}/memory/add`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-worker-token": mem0AccessToken,
				...gcpAuthHeaders,
			},
			body: JSON.stringify({
				text: text,
				user_id: "francis",
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`[Memory service] Memory service error: ${response.status} - ${errorText}`,
			);
		}
		return true;
	} catch (error) {
		writeLog("ERROR", "[Memory service] Failed to add memory", { error: error.message });
		return false;
	}
}

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
				...gcpAuthHeaders,
			},
			body: JSON.stringify({
				context: query,
				user_id: "francis",
				limit: 3,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			writeLog("ERROR", "Memory search error", {
				status: response.status,
				error: errorText,
			});
			return "";
		}

		const responseData = await response.json();
		const memoriesArray = responseData.memories.results || [];
    
    const formattedMemories = memoriesArray
      .map(m => m.memory) 
      .filter(Boolean)
      .join("; ");
      
    writeLog("INFO", "Successfully formatted user memories", { formattedMemories: formattedMemories });
    
    return formattedMemories;
	} catch (error) {
		writeLog("ERROR", "[Memory service] Failed to retrieve memories", { error: error.message });
		return "";
	}
}
