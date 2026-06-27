import { openaiClient } from "./openaiClient.js";
import { observeOpenAI } from "@langfuse/openai";
import { getGcpAuthHeaders } from "./gcpAuth.js";
import { getRelevantMemories } from "./memoryService.js";
import { promptClient } from "./langfuse.js";
import { writeLog } from "./logger.js";

/**
 * Fetches raw alerts stream from the TfNSW MCP server
 */
export async function fetchTfNSWStreamData(config, mode, fetcher = fetch) {
	try {
		const mcpServerUrl = config.mcpServerUrl;
		if (!mcpServerUrl) {
			throw new Error("MCP Server URL is missing in configuration.");
		}

		const mcpAccessToken = config.mcpAccessToken;
		if (!mcpAccessToken) {
			throw new Error("MCP Access Token is missing in configuration.");
		}

		const gcpAuthHeaders = await getGcpAuthHeaders(mcpServerUrl);
		const fetchUrl = `${mcpServerUrl}/stream`;

		writeLog("INFO", "Fetching TfNSW stream alerts via MCP server", {
			url: fetchUrl,
			mode,
		});

		const response = await fetcher(fetchUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Worker-Token": mcpAccessToken,
				...gcpAuthHeaders,
			},
			body: JSON.stringify({
				method: "get_sydney_transport_alerts",
				arguments: { mode: mode },
			}),
		});

		if (response.status === 401) {
			throw new Error("MCP server rejected request: invalid or missing token.");
		}
		if (!response.ok)
			throw new Error(`HTTP Error. Status code: ${response.status}`);

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let accumulatedText = "";

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			accumulatedText += decoder.decode(value, { stream: true });
		}

		writeLog("INFO", "TfNSW stream alerts fetched successfully", {
			responseLength: accumulatedText.length,
		});
		return accumulatedText;
	} catch (error) {
		writeLog("ERROR", "Failed to fetch TfNSW alerts", { error: error.message });
		throw error;
	}
}

/**
 * Handles the traffic query, pulls real-time alerts, and filters them strictly based on user memory
 */
export async function handleTrafficQuery(config, query, userTransitMemories) {
	const mcpServerUrl = config.mcpServerUrl;
	if (!mcpServerUrl) {
		writeLog(
			"WARNING",
			"TfNSW MCP Server is not configured. Returning fallback response.",
		);
		return "TfNSW MCP Server is not configured. Real-time alerts are unavailable.";
	}

	writeLog("INFO", "Analyzing traffic alerts with user travel preferences", {
		query,
		hasMemories: !!userTransitMemories,
	});

	// 1. Fetch raw alerts for 'all' to ensure no relevant alert is missed during filtering
	const rawAlerts = await fetchTfNSWStreamData(config, "all");

	if (containsMcpError(rawAlerts)) {
		writeLog(
			"ERROR",
			"MCP Stream response contains system or connection errors",
			{ rawAlerts },
		);
		return rawAlerts;
	}

	// 2. Process with OpenAI and inject transit memories to filter and generate recommendations
	const client = observeOpenAI(openaiClient, {
		generationName: "traffic-advice",
		userId: "francis",
	});

	const systemContent = await promptClient.prompt.get("traffic-advice");

	const response = await openaiClient.chat.completions.create({
		model: config.openaiModel,
		messages: [
			{ role: "system", content: systemContent },
			{
				role: "user",
				content: `User prompt: "${query}"\n\nReal time alert from TfNSW MCP server:\n${rawAlerts}`,
			},
		],
	});

	writeLog(
		"INFO",
		`[Traffic Agent] Token usage: ${response.usage?.total_tokens ?? "N/A"}`,
	);

	const adviceResult = response.choices[0].message.content;
	writeLog("INFO", "Successfully generated filtered transit advice", {
		adviceLength: adviceResult.length,
	});

	return adviceResult;
}

export function buildTransitErrorMessage(rawAlerts) {
	if (!containsMcpError(rawAlerts)) return "";
	return `Transit data error: ${summarizeMcpError(rawAlerts)}`;
}

export function containsMcpError(rawAlerts) {
	const s = String(rawAlerts || "");
	return (
		/\[ERROR\]|\[CRITICAL_ERROR\]/i.test(s) ||
		/^TfNSW API error:/im.test(s) ||
		/^Transit data error:/im.test(s)
	);
}

export function summarizeMcpError(rawAlerts) {
	return String(rawAlerts || "")
		.replace(/\[STATUS\].*?(\r?\n|$)/g, "")
		.trim();
}
