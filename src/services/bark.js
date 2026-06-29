import { writeLog } from "./logger.js";

// 1. Add fetcher parameter for dependency injection in tests
export async function sendBarkNotification(
	config,
	notification,
	fetcher = fetch,
) {
	try {
		const { barkServerUrl, barkDeviceKey, barkGroup, barkLevel } = config;

		if (!barkDeviceKey) {
			writeLog(
				"WARNING",
				"Bark Device key missing. Skipping push notification.",
			);
			return;
		}

		const payload = {
			title: notification.title || "SydFit Notification",
			subtitle: notification.subtitle,
			markdown: notification.body,
			group: barkGroup || "SydFit",
			level: barkLevel || "active",
			isArchive: 1,
		};

		// Use the injected fetcher
		const response = await fetcher(`${barkServerUrl}/${barkDeviceKey}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json; charset=utf-8",
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errorDetails = await response.text();
			throw new Error(`Bark HTTP ${response.status}: ${errorDetails}`);
		}

		writeLog("INFO", "Bark notification sent successfully", {
			title: notification.title,
		});
	} catch (error) {
		writeLog("ERROR", "Failed to send push notification", {
			error: error.message,
		});
		throw error;
	}
}
