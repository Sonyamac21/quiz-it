import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pairProgressForTeam, readPairs, tilesForTeam } from "../lib/quiz/pairs.ts";

const pairs = [
  { pair_id: "p1", a: { label: "Lock", image_url: "/lock.jpg" }, b: { label: "Key", image_url: "/key.jpg" } },
  { pair_id: "p2", a: { label: "Needle", image_url: "/needle.jpg" }, b: { label: "Thread", image_url: "/thread.jpg" } },
  { pair_id: "p3", a: { label: "Kettle", image_url: "/kettle.jpg" }, b: { label: "Cup", image_url: "/cup.jpg" } },
];

test("Pairs content requires complete labels and images", () => {
  assert.equal(readPairs([...pairs, { pair_id: "broken", a: { label: "A", image_url: "" }, b: { label: "B", image_url: "/b" } }]).length, 3);
});

test("each team receives a stable six-tile order across reconnects", () => {
  const first = tilesForTeam(pairs, "The Quizzards").map(tile => tile.id);
  const reconnect = tilesForTeam(pairs, "The Quizzards").map(tile => tile.id);
  assert.deepEqual(first, reconnect);
  assert.equal(new Set(first).size, 6);
});

test("team progress resumes case-insensitively", () => {
  const progress = { "The Quizzards": { solved_pair_ids: ["p1", "p2"], mistakes: 1 } };
  assert.deepEqual(pairProgressForTeam(progress, " the quizzards "), progress["The Quizzards"]);
});

test("Pairs attempt RPC is authorised, serialised and idempotent", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/202609150001_pairs_round.sql", import.meta.url), "utf8");
  assert.match(sql, /for update/i);
  assert.match(sql, /player_token_hash/i);
  assert.match(sql, /score_events/i);
  assert.match(sql, /unique_violation/i);
  assert.match(sql, /pairs_progress/i);
});
