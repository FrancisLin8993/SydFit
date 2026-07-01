import { GoogleAuth } from "google-auth-library";
import { writeLog } from "../utils/logger.js";

const auth = new GoogleAuth();

export async function getGcpAuthHeaders(targetAudience) {
	try {
		const client = await auth.getIdTokenClient(targetAudience);

		const headers = await client.getRequestHeaders();

		const plainHeaders: Record<string, string> = {};
		if (typeof headers.forEach === "function") {
			headers.forEach((value, key) => {
				plainHeaders[key] = value;
			});
		} else {
			Object.assign(plainHeaders, headers);
		}

		if (!plainHeaders.Authorization && !plainHeaders.authorization) {
			writeLog(
				"WARNING",
				"⚠️ [Auth] Headers fetched but no Authorization key found:",
				plainHeaders,
			);
		} else {
			writeLog("INFO", "✅ [Auth] Token fetched successfully via SDK.");
		}

		return plainHeaders;
	} catch (error) {
		writeLog("ERROR", "Failed to fetch ID Token via SDK", {
			error: error.message,
		});
		return {};
	}
}
