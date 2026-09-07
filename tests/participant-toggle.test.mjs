import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("clicking the selected participant closes details; another participant opens normally", () => {
  const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const body = source.split("function focusParticipant(participant: Participant) {")[1].split("\n  function resetParticipantView")[0].replace(/\}\s*$/, "").replace("(trip): trip is Trip =>", "(trip) =>");
  for (const selected of [null, "엄경훈", "다른 참가자"]) {
    let reset = false, next = selected;
    const run = new Function("participant", "selectedParticipantName", "resetParticipantView", "setParticipantView", "trips", "setSelectedParticipantName", "setActiveTrip", "iframeRef", "window", body);
    run({ name: "엄경훈", trips: [] }, selected, () => { reset = true; next = null; }, () => {}, [], name => { next = name; }, () => {}, { current: null }, { location: { origin: "https://example.com" } });
    assert.equal(reset, selected === "엄경훈");
    assert.equal(next, selected === "엄경훈" ? null : "엄경훈");
  }
});
