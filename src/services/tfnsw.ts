import { writeLog } from "../utils/logger.js";

// Direct client for TfNSW's Open Data realtime-alerts API. Ported from the
// decommissioned mcp-tfnsw Cloud Run service — TfNSW's v2 endpoint serves
// JSON directly (?format=json), so no GTFS-realtime protobuf parsing is
// needed, and calling it here removes a whole intermediary service (and its
// cold start) from the alert path.

export type TfnswMode =
	| "train"
	| "metro"
	| "lightrail"
	| "bus"
	| "ferry"
	| "all";

export interface TransportAlert {
	title: string;
	description: string;
	activePeriods: Array<{ start: string; end: string }>;
	cause: string | null;
	effect: string | null;
	url: string | null;
}

const MODE_SUFFIX: Record<TfnswMode, string> = {
	train: "/sydneytrains",
	metro: "/metro",
	lightrail: "/lightrail",
	bus: "/buses",
	ferry: "/ferries",
	all: "/all",
};

/**
 * Picks the plain-English text out of a GTFS-realtime TranslatedString
 * (preferring the "en" translation, falling back to the first non-html one).
 */
function getPlainText(field: any): string {
	if (!field?.translation) return "";
	const translations: Array<{ text: string; language: string }> =
		field.translation;
	return (
		translations.find((t) => t.language === "en")?.text ||
		translations.find((t) => !t.language.includes("html"))?.text ||
		""
	);
}

function formatTimestamp(unixSeconds: string, timezone: string): string {
	return new Date(Number.parseInt(unixSeconds, 10) * 1000).toLocaleString(
		"en-AU",
		{
			timeZone: timezone,
			dateStyle: "short",
			timeStyle: "short",
		},
	);
}

/**
 * Fetches TfNSW service alerts for a mode and maps them to a flat
 * TransportAlert shape. Keeps the camelCase/snake_case field fallbacks from
 * the original mcp-tfnsw implementation (headerText || header_text etc.),
 * since TfNSW's JSON rendering has been observed in both variants.
 */
export async function fetchTfnswAlerts(
	config,
	mode: TfnswMode = "all",
): Promise<TransportAlert[]> {
	if (!config.tfnswApiKey) {
		throw new Error("TFNSW_API_KEY is not configured in config");
	}

	const timezone = config.scheduleTimezone || "Australia/Sydney";
	const url = `https://api.transport.nsw.gov.au/v2/gtfs/alerts${MODE_SUFFIX[mode]}?format=json`;

	writeLog("INFO", "[TfNSW] Fetching alerts", { mode });

	const response = await fetch(url, {
		headers: { Authorization: `apikey ${config.tfnswApiKey}` },
	});

	if (!response.ok) {
		throw new Error(`TfNSW tool failed: ${response.status}`);
	}

	const data = (await response.json()) as any;
	const entities: any[] = data?.entity || [];

	const alerts: TransportAlert[] = entities
		.map((entity) => entity.alert)
		.filter(Boolean)
		.map((alert) => ({
			title: getPlainText(alert.headerText || alert.header_text) || "Alert",
			description: getPlainText(
				alert.descriptionText || alert.description_text,
			),
			activePeriods: (alert.activePeriod || alert.active_period || [])
				.filter((p: any) => p?.start && p?.end)
				.map((p: any) => ({
					start: formatTimestamp(p.start, timezone),
					end: formatTimestamp(p.end, timezone),
				})),
			cause: alert.cause ? alert.cause.replace(/_/g, " ") : null,
			effect: alert.effect ? alert.effect.replace(/_/g, " ") : null,
			url: getPlainText(alert.url) || null,
		}));

	writeLog("INFO", "[TfNSW] Alerts processed", {
		mode,
		alertCount: alerts.length,
	});

	return alerts;
}
