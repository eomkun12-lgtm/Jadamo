import assert from "node:assert/strict";
import { test } from "node:test";
import { tripToday, isBookingStatus } from "../lib/trip-today.ts";

test("today card uses destination date and chronological time, including unknown times and empty trips", () => {
  const items = [{ date: "2026-10-04", time: "18:00" }, { date: "2026-10-04", time: "08:00" }, { date: "2026-10-05", time: "" }];
  const before = tripToday(items, new Date("2026-10-02T15:01:00Z"), "Asia/Tokyo");
  assert.equal(before.days, 1);
  assert.equal(before.state, "before");
  assert.equal(before.next.time, "08:00");
  assert.equal(tripToday(items, new Date("2026-10-04T00:00:00Z"), "Asia/Tokyo").next.time, "18:00");
  assert.equal(tripToday(items, new Date("2026-10-04T15:00:00Z"), "Asia/Tokyo").next.time, "");
  assert.equal(tripToday(items, new Date("2026-10-05T15:00:00Z"), "Asia/Tokyo").state, "after");
  assert.equal(tripToday([], new Date(), "Asia/Seoul").state, "undated");
  assert.equal(tripToday([{ date: "", time: "" }], new Date(), "Asia/Seoul").next, undefined);
  assert.ok(isBookingStatus("confirmed"));
  for (const value of ["toString", "invented", null, {}, 1]) assert.equal(isBookingStatus(value), false);
});
