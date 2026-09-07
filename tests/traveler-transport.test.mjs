import assert from "node:assert/strict";
import { test } from "node:test";
import { transportLabels, transportGroupKey } from "../lib/traveler-transport.ts";

test("transport groups match method and details without grouping undecided or separate travelers", () => {
  const key = (flightStatus, flightNote) => transportGroupKey({ flightStatus, flightNote });
  assert.equal(key("car", " 서울역  08:00 "), key("car", "서울역 08:00"));
  assert.notEqual(key("car", "서울역 08:00"), key("train", "서울역 08:00"));
  assert.equal(key("pending", "서울역"), null);
  assert.equal(key("separate", "서울역"), null);
  assert.equal(key("car", "  "), null);
  assert.equal(key("confirmed", " LJ123 "), key("confirmed", "lj123"));
  for (const mode of ["confirmed", "pending", "separate", "car", "train", "bus", "ferry"]) assert.ok(transportLabels[mode]);
});
