import { openaiClient } from "./openaiClient.js";
import { observeOpenAI } from "@langfuse/openai";
import { getGcpAuthHeaders } from "./gcpAuth.js";
import { getRelevantMemories } from "./memoryService.js";
import { promptClient } from "./langfuse.js";
import { writeLog } from "./logger.js";

/**
 * Fetches structured alerts JSON from the TfNSW MCP server
 */
export async function fetchTfNswData(config, mode, fetcher = fetch) {
	try {
		const mcpServerUrl = config.mcpServerUrl;
		if (!mcpServerUrl) {
			throw new Error("[Traffic Agent] MCP Server URL is missing in configuration.");
		}

		const mcpAccessToken = config.mcpAccessToken;
		if (!mcpAccessToken) {
			throw new Error("[Traffic Agent] MCP Access Token is missing in configuration.");
		}

		const gcpAuthHeaders = await getGcpAuthHeaders(mcpServerUrl);
		const fetchUrl = `${mcpServerUrl}/alerts`;

		writeLog("INFO", "[Traffic Agent] Fetching TfNSW alerts via MCP server", {
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
			throw new Error("[Traffic Agent] MCP server rejected request: invalid or missing token.");
		}
		if (!response.ok)
			throw new Error(`[Traffic Agent] HTTP Error. Status code: ${response.status}`);

		const data = await response.json();

		writeLog("INFO", "[Traffic Agent] TfNSW alerts fetched successfully", {
			alertCount: data.alertCount,
		});
		return data;
	} catch (error) {
		writeLog("ERROR", "[Traffic Agent] Failed to fetch TfNSW alerts", { error: error.message });
		throw error;
	}
}

/**
 * Formats structured alert JSON into a human-readable prompt string
 */
export function formatAlertsForPrompt(data) {
	if (!data || data.error) {
		return JSON.stringify(data || { error: "[Traffic Agent] No data returned from MCP server" });
	}

	const { mode, alertCount, alerts } = data;

	if (!alerts || alertCount === 0) {
		return `No current alerts for ${mode} transport.`;
	}

	let result = `Current alerts for ${mode} transport:\n\n`;
	for (const alert of alerts) {
		result += `Title: ${alert.title}\n`;
		result += `Description: ${alert.description}\n`;
		if (alert.activePeriods && alert.activePeriods.length > 0) {
			result += "Active Periods:\n";
			for (const period of alert.activePeriods) {
				result += `  - ${period.start} to ${period.end}\n`;
			}
		}
		if (alert.cause) result += `Cause: ${alert.cause}\n`;
		if (alert.effect) result += `Effect: ${alert.effect}\n`;
		if (alert.url) result += `More info: ${alert.url}\n`;
		result += "\n";
	}

	return result;
}

/**
 * Handles the traffic query, pulls real-time alerts, and filters them strictly based on user memory
 */
export async function handleTrafficQuery(config, query, userTransitMemories) {
	writeLog("DEBUG", "Inside handleTrafficQuery", { receivedThirdArg: userTransitMemories });
	const mcpServerUrl = config.mcpServerUrl;
	if (!mcpServerUrl) {
		writeLog(
			"WARNING",
			"TfNSW MCP Server is not configured. Returning fallback response.",
		);
		return "TfNSW MCP Server is not configured. Real-time alerts are unavailable.";
	}

	writeLog("INFO", "[Traffic Agent] Analyzing traffic alerts with user travel preferences", {
		query,
		hasMemories: !!userTransitMemories,
	});

	const rawAlerts = await fetchTfNswData(config, "all");

	if (containsMcpError(rawAlerts)) {
		writeLog(
			"ERROR",
			"MCP response contains system or connection errors",
			{ rawAlerts },
		);
		return JSON.stringify(rawAlerts);
	}

	const client = observeOpenAI(openaiClient, {
		generationName: "traffic-advice",
		userId: "francis",
	});

	const systemContent = await promptClient.prompt.get("traffic-advice");

	const formattedAlerts = formatAlertsForPrompt(rawAlerts);
	const response = await client.chat.completions.create({
		model: config.openaiModel,
		messages: [
			{ role: "system", content: systemContent },
			{
				role: "user",
				content: `User prompt: "${query}"\n\nReal time alert from TfNSW MCP server:\n${formattedAlerts}`,
			},
		],
	});

	const adviceResult = response.choices[0].message.content;
	writeLog(
		"INFO",
		`[Traffic Agent] Response from model: ${adviceResult}`,
	);

	writeLog(
		"INFO",
		`[Traffic Agent] Token usage: ${response.usage?.total_tokens ?? "N/A"}`,
	);

	writeLog("INFO", "[Traffic Agent] Successfully generated filtered transit advice", {
		adviceLength: adviceResult.length,
	});

	return adviceResult;
}

export function buildTransitErrorMessage(rawAlerts) {
	if (!containsMcpError(rawAlerts)) return "";
	return `[Traffic Agent] Transit data error: ${summarizeMcpError(rawAlerts)}`;
}

export function containsMcpError(rawAlerts) {
	if (rawAlerts && typeof rawAlerts === "object") {
		return !!rawAlerts.error;
	}
	const s = String(rawAlerts || "");
	return (
		/\[ERROR\]|\[CRITICAL_ERROR\]/i.test(s) ||
		/^TfNSW API error:/im.test(s) ||
		/^Transit data error:/im.test(s)
	);
}

export function summarizeMcpError(rawAlerts) {
	if (rawAlerts && typeof rawAlerts === "object") {
		return rawAlerts.error || JSON.stringify(rawAlerts);
	}
	return String(rawAlerts || "")
		.replace(/\[STATUS\].*?(\r?\n|$)/g, "")
		.trim();
}
