import { z } from "zod";

// Canonical Sydney Trains / Light Rail / Airport line codes. Mirrors the set
// previously hardcoded in filterAlertsTool's extractLines() — T7 is
// intentionally omitted (retired line) and Metro/M1 is intentionally omitted
// (no verified TfNSW alert-copy evidence for its code yet).
export const CANONICAL_LINES = [
	"T1",
	"T2",
	"T3",
	"T4",
	"T5",
	"T6",
	"T8",
	"T9",
	"AIRPORT",
	"LIGHTRAIL",
] as const;

export type CanonicalLine = (typeof CANONICAL_LINES)[number];

// zod enum for tool parameters — constrains the LLM to real canonical codes.
export const canonicalLineEnum = z.enum(CANONICAL_LINES);

// Maps realistic phrasing variance (as it might appear in saved preferences
// or in raw TfNSW alert copy) to a canonical line. Deliberately narrow —
// only covers variance actually plausible in this domain.
const LINE_ALIASES: Record<string, CanonicalLine> = {
	T1: "T1",
	"T1 LINE": "T1",
	"T1 NORTH SHORE": "T1",
	"T1 NORTHERN": "T1",
	"T1 WESTERN": "T1",
	T2: "T2",
	"T2 LINE": "T2",
	"T2 INNER WEST": "T2",
	"T2 LEPPINGTON": "T2",
	T3: "T3",
	"T3 LINE": "T3",
	"T3 BANKSTOWN": "T3",
	T4: "T4",
	"T4 LINE": "T4",
	"T4 EASTERN SUBURBS": "T4",
	"T4 ILLAWARRA": "T4",
	T5: "T5",
	"T5 LINE": "T5",
	"T5 CUMBERLAND": "T5",
	T6: "T6",
	"T6 LINE": "T6",
	"T6 CARLINGFORD": "T6",
	T8: "T8",
	"T8 LINE": "T8",
	"T8 AIRPORT": "T8",
	"T8 SOUTH LINE": "T8",
	T9: "T9",
	"T9 LINE": "T9",
	"T9 NORTHERN": "T9",
	AIRPORT: "AIRPORT",
	"AIRPORT LINE": "AIRPORT",
	"AIRPORT & SOUTH LINE": "AIRPORT",
	LIGHTRAIL: "LIGHTRAIL",
	"LIGHT RAIL": "LIGHTRAIL",
	L1: "LIGHTRAIL",
	L2: "LIGHTRAIL",
	L3: "LIGHTRAIL",
};

/**
 * Normalizes a freeform code/phrase to a canonical line, or null if
 * unrecognized. Never throws — callers treat unknown input as "ignore",
 * not an error.
 */
export function normalizeLine(input: string): CanonicalLine | null {
	const key = input.trim().toUpperCase();
	return LINE_ALIASES[key] ?? null;
}

/**
 * Word-boundary-safe check for whether free text (e.g. an alert title +
 * description) mentions the given canonical line. Fixes the false-positive
 * bug in the old naive `content.includes("t1")` matcher, which would match
 * "t1" inside an unrelated token like "T19".
 */
export function alertMentionsLine(
	content: string,
	line: CanonicalLine,
): boolean {
	const upper = content.toUpperCase();
	const aliases = Object.keys(LINE_ALIASES).filter(
		(alias) => LINE_ALIASES[alias] === line,
	);

	return aliases.some((alias) => {
		const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return new RegExp(`\\b${escaped}\\b`).test(upper);
	});
}
