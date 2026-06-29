export function writeLog(severity, message, metadata = {}) {
	const logEntry = {
		severity: severity.toUpperCase(),
		message: message,
		...metadata,
		timestamp: new Date().toISOString(),
	};
	// Output as a single-line JSON string for proper GCP parsing
	console.log(JSON.stringify(logEntry));
}
