import assert from "node:assert/strict";
import { test } from "node:test";
import { validateGear } from "../lib/participant-gear.ts";

test("equipment validates categories, content and image URLs without mixing profiles", () => {
  assert.deepEqual(validateGear({ 마스크: { model: "  GULL  ", image: "https://example.com/mask.jpg" }, 핀: { model: "", image: "" } }), { 마스크: { model: "GULL", image: "https://example.com/mask.jpg" } });
  for (const value of [null, [], { unknown: {} }, { BCD: { model: "x", image: "javascript:alert(1)" } }, { BCD: { model: "x", image: "http://example.com/a" } }, { BCD: { model: "x".repeat(101), image: "" } }]) assert.throws(() => validateGear(value));
  assert.deepEqual(validateGear({}), {});
});
