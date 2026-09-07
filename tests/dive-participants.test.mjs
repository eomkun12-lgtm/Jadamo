import assert from "node:assert/strict";
import { test } from "node:test";
import { groupDiveParticipants } from "../lib/dive-participants.ts";

test("dive roster sorts dates, combines legacy dates, and counts each participant once per date", () => {
  const people = [{ id: "a", diveDays: ["10/5", "2026-10-05", "10/4"] }, { id: "b", diveDays: ["2026-10-05"] }, { id: "c", diveDays: [] }];
  const groups = groupDiveParticipants(people, "2026");
  assert.deepEqual(groups.map(({ date, travelers }) => [date, travelers.map(p => p.id)]), [["2026-10-04", ["a"]], ["2026-10-05", ["a", "b"]]]);
  assert.deepEqual(groupDiveParticipants([], "2026"), []);
});
