import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isPairsQuestion, isPairRecord, pairProgressForTeam, readPairs, tilesForTeam } from "../lib/quiz/pairs.ts";

const pairs = [
  { pair_id: "p1", a: { label: "Lock", image_url: "/lock.jpg" }, b: { label: "Key", image_url: "/key.jpg" } },
  { pair_id: "p2", a: { label: "Needle", image_url: "/needle.jpg" }, b: { label: "Thread", image_url: "/thread.jpg" } },
  { pair_id: "p3", a: { label: "Kettle", image_url: "/kettle.jpg" }, b: { label: "Cup", image_url: "/cup.jpg" } },
];

test("Pairs content requires complete labels and images", () => {
  assert.equal(readPairs([...pairs, { pair_id: "broken", a: { label: "A", image_url: "" }, b: { label: "B", image_url: "/b" } }]).length, 3);
});

test("one bundled question loads all six playable tiles; partial bundles are rejected", () => {
  const question = { question_type: "pairs", round_type: "pairs", pairs };
  assert.equal(isPairsQuestion(question), true);
  assert.equal(isPairRecord(question), false);
  assert.deepEqual(readPairs([question]), pairs);
  assert.equal(tilesForTeam(readPairs([question]), "Mama").length, 6);
  assert.equal(isPairsQuestion({ ...question, pairs: pairs.slice(0, 1) }), false);
  assert.equal(isPairsQuestion({ ...question, pairs: [pairs[0], pairs[0], pairs[0]] }), false);
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

test("50 teams get mixed boards with no matches opposite each other", () => {
  const orders = new Set();
  for (let i = 0; i < 50; i++) {
    const tiles = tilesForTeam(pairs, `Team ${i}`);
    assert.equal(new Set(tiles.map(t => t.id)).size, 6);
    for (let row = 0; row < 6; row += 2) assert.notEqual(tiles[row].pair_id, tiles[row + 1].pair_id);
    assert.deepEqual(tiles, tilesForTeam(pairs, `Team ${i}`));
    orders.add(tiles.map(t => t.id).join(","));
  }
  assert.ok(orders.size > 20);
  const changed = pairs.map(p => ({ ...p, a: { ...p.a, label: p.a.label + " new" } }));
  assert.notDeepEqual(tilesForTeam(pairs, "Mama").map(t => t.id), tilesForTeam(changed, "Mama").map(t => t.id));
});

test("Pairs attempt RPC is authorised, serialised and idempotent", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/202609150001_pairs_round.sql", import.meta.url), "utf8");
  assert.match(sql, /for update/i);
  assert.match(sql, /player_token_hash/i);
  assert.match(sql, /score_events/i);
  assert.match(sql, /unique_violation/i);
  assert.match(sql, /pairs_progress/i);
});
