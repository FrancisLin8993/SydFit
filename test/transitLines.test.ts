import assert from "node:assert/strict";
import test from "node:test";

import {
	alertMentionsLine,
	CANONICAL_LINES,
	canonicalLineEnum,
	normalizeLine,
} from "../src/utils/transitLines.js";

test("normalizeLine resolves known aliases to their canonical code", () => {
	assert.equal(normalizeLine("t8"), "T8");
	assert.equal(normalizeLine("Light Rail"), "LIGHTRAIL");
	assert.equal(normalizeLine("L2"), "LIGHTRAIL");
	assert.equal(normalizeLine("Airport & South Line"), "AIRPORT");
});

test("normalizeLine returns null for unrecognized input", () => {
	assert.equal(normalizeLine("T19"), null);
	assert.equal(normalizeLine("not a line"), null);
	assert.equal(normalizeLine(""), null);
});

test("alertMentionsLine matches known phrasing for a line", () => {
	assert.equal(alertMentionsLine("T8 Line Delay", "T8"), true);
	assert.equal(
		alertMentionsLine("Delays on the Airport & South Line", "AIRPORT"),
		true,
	);
});

test("alertMentionsLine does not false-positive match T1 inside T19", () => {
	assert.equal(
		alertMentionsLine("Replacement bus T19 diverted via Anzac Parade", "T1"),
		false,
	);
});

test("canonicalLineEnum accepts every canonical code and rejects arbitrary strings", () => {
	for (const line of CANONICAL_LINES) {
		assert.equal(canonicalLineEnum.safeParse(line).success, true);
	}
	assert.equal(canonicalLineEnum.safeParse("NOT_A_REAL_LINE").success, false);
});
