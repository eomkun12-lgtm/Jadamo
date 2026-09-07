import assert from "node:assert/strict";
import { test } from "node:test";
import { validateGear } from "../lib/participant-gear.ts";

test("equipment validates categories, content and image URLs without mixing profiles", () => {
  assert.deepEqual(validateGear({ 마스크: { model: "  GULL  ", image: "https://example.com/mask.jpg" }, 핀: { model: "", image: "" } }), { 마스크: { model: "GULL", image: "https://example.com/mask.jpg" } });
  for (const value of [null, [], { unknown: {} }, { BCD: { model: "x", image: "javascript:alert(1)" } }, { BCD: { model: "x", image: "http://example.com/a" } }, { BCD: { model: "x".repeat(101), image: "" } }]) assert.throws(() => validateGear(value));
  assert.deepEqual(validateGear({}), {});
});

 test("shop zoom pages resolve to product images while other URLs are not fetched", async () => {
  const { resolveGearImages } = await import("../lib/participant-gear.ts");
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return new Response('<img src="/data/goods/mask.png" />'); };
    const gear = { 마스크: { model: "TUSA", image: "https://www.pongdang.com/goods/zoom?no=51845&popup=1" }, 핀: { model: "fin", image: "" }, BCD: { model: "BCD", image: "https://example.com/photo.jpg" } };
    const resolved = await resolveGearImages(gear);
    assert.equal(resolved.마스크.image, "https://www.pongdang.com/data/goods/mask.png");
    assert.equal(calls, 1);
    assert.deepEqual(resolved.핀, gear.핀);
    assert.deepEqual(resolved.BCD, gear.BCD);
    globalThis.fetch = async () => { throw new Error("offline"); };
    assert.deepEqual(await resolveGearImages(gear), gear);
  } finally { globalThis.fetch = originalFetch; }
});
