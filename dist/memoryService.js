import { getGcpAuthHeaders } from "./gcpAuth.js";
import { writeLog } from "./logger.js";
/**
 * Add a memory (unchanged logic, but cleaner error handling)
 */
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
				text,
				user_id: "francis",
			}),
		});
		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`[Memory service] Add memory failed: ${response.status} - ${errorText}`,
			);
		}
		writeLog("INFO", "[Memory] Successfully added memory", { text });
		return { success: true };
	} catch (error) {
		writeLog("ERROR", "[Memory service] Failed to add memory", {
			error: error.message,
		});
		return { success: false, error: error.message };
	}
}
/**
 * Returns structured memories for LLM / Agent tool usage
 */
export async function getRelevantMemories(config, query) {
	try {
		if (!config.mem0ApiUrl) {
			return {
				memories: [],
				error: "mem0ApiUrl not configured",
			};
		}
		const gcpAuthHeaders = await getGcpAuthHeaders(config.mem0ApiUrl);
		const workerToken = process.env.MEM0_ACCESS_TOKEN;
		const searchEndpoint = `${config.mem0ApiUrl}/memory/search`;
		const response = await fetch(searchEndpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Worker-Token": workerToken?.trim() || "",
				...gcpAuthHeaders,
			},
			body: JSON.stringify({
				context: query,
				user_id: "francis",
				limit: 5,
			}),
		});
		if (!response.ok) {
			const errorText = await response.text();
			writeLog("ERROR", "[Memory] Search failed", {
				status: response.status,
				error: errorText,
			});
			return {
				memories: [],
				error: errorText,
			};
		}
		const responseData = await response.json();
		const memoriesArray = responseData?.memories?.results || [];
		// 🔥 IMPORTANT: preserve structure
		const memories = memoriesArray
			.map((m) => ({
				text: m.memory,
				score: m.score ?? null,
				timestamp: m.created_at ?? null,
			}))
			.filter((m) => m.text);
		writeLog("INFO", "[Memory] Retrieved memories", {
			count: memories.length,
		});
		return {
			memories,
			query,
		};
	} catch (error) {
		writeLog("ERROR", "[Memory service] Failed to retrieve memories", {
			error: error.message,
		});
		return {
			memories: [],
			error: error.message,
		};
	}
}
