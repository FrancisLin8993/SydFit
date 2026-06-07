import assert from "node:assert/strict";
import test from "node:test";

import { formatLocalTime, isScheduledLocalTime } from "../src/scheduler.js";

test("isScheduledLocalTime matches Sydney 7 AM during standard time", () => {
  assert.equal(
    isScheduledLocalTime({
      date: new Date("2026-06-07T21:00:00Z"),
      timezone: "Australia/Sydney",
      hour: 7,
      minute: 0
    }),
    true
  );
});

test("isScheduledLocalTime matches Sydney 7 AM during daylight saving time", () => {
  assert.equal(
    isScheduledLocalTime({
      date: new Date("2026-01-07T20:00:00Z"),
      timezone: "Australia/Sydney",
      hour: 7,
      minute: 0
    }),
    true
  );
});

test("isScheduledLocalTime rejects the inactive UTC trigger", () => {
  assert.equal(
    isScheduledLocalTime({
      date: new Date("2026-06-07T20:00:00Z"),
      timezone: "Australia/Sydney",
      hour: 7,
      minute: 0
    }),
    false
  );
});

test("formatLocalTime includes the target local time", () => {
  const formatted = formatLocalTime(new Date("2026-06-07T21:00:00Z"), "Australia/Sydney");
  assert.match(formatted, /7:00:00 am AEST/);
});
