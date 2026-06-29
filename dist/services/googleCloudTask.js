import { CloudTasksClient } from "@google-cloud/tasks";
import { writeLog } from "../utils/logger.js";
let client;
/**
 * Enqueues a background task to Google Cloud Tasks
 */
export async function enqueueSydFitTask(config, endpoint, payload) {
	if (!client) {
		client = new CloudTasksClient();
	}
	const {
		gcpProjectId,
		gcpLocation,
		gcpQueueName,
		sydFitServiceUrl,
		sydFitApiKey,
	} = config;
	if (!gcpProjectId || !gcpLocation || !gcpQueueName || !sydFitServiceUrl) {
		throw new Error(
			"Cloud Tasks configuration is incomplete. Missing GCP_PROJECT_ID, GCP_LOCATION, GCP_QUEUE_NAME, or SYDFIT_SERVICE_URL.",
		);
	}
	const parent = client.queuePath(gcpProjectId, gcpLocation, gcpQueueName);
	// The absolute URL of the Cloud Run endpoint that will process this task
	const url = `${sydFitServiceUrl}${endpoint}`;
	const task = {
		httpRequest: {
			httpMethod: "POST",
			url: url,
			headers: {
				"Content-Type": "application/json",
				// Pass through the API key so the background task passes our existing security middleware
				"x-sydfit-token": sydFitApiKey,
			},
			// Payload must be base64 encoded string
			body: Buffer.from(JSON.stringify(payload)).toString("base64"),
		},
	};
	try {
		const [response] = await client.createTask({ parent, task });
		writeLog("INFO", "Cloud Task enqueued successfully", {
			taskName: response.name,
			targetUrl: url,
		});
		return response;
	} catch (error) {
		writeLog("ERROR", "Failed to enqueue Cloud Task", { error: error.message });
		throw error;
	}
}
