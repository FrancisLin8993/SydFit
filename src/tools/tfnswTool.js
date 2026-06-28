import { getGcpAuthHeaders } from "../gcpAuth.js";
import { writeLog } from "../logger.js";

export async function getTfnswAlerts(config, mode) {
	const mcpServerUrl = config.mcpServerUrl;

	const fetchUrl = `${mcpServerUrl}/alerts`;

	writeLog("INFO", "[Tool] Fetch TfNSW alerts", { mode });

	const response = await fetch(fetchUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Worker-Token": config.mcpAccessToken,
			...(await getGcpAuthHeaders(mcpServerUrl)),
		},
		body: JSON.stringify({
			method: "get_sydney_transport_alerts",
			arguments: { mode },
		}),
	});

	if (!response.ok) {
		throw new Error(`TfNSW tool failed: ${response.status}`);
	}

	return await response.json();
}
