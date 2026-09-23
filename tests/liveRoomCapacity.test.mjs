import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const host = readFileSync(new URL("../app/host/quiz/page.tsx", import.meta.url), "utf8");
const config = readFileSync(new URL("../lib/platform/config.ts", import.meta.url), "utf8");

test("host realtime traffic is scoped to the current live session", () => {
  for (const table of ["answers", "teams", "uno_cards"]) {
    assert.match(
      host,
      new RegExp(`table: "${table}", filter: "session_pin=eq\\." \\+ pin`),
      `${table} subscription must be filtered at Supabase, not after delivery`,
    );
  }
  assert.match(host, /table: "sessions", filter: "pin=eq\." \+ pin/);
});

test("50-team handset fallback polling stays below 40 session reads per second", () => {
  const match = config.match(/playerSessionMilliseconds:\s*(\d+)/);
  assert.ok(match, "player polling interval is configured");
  const interval = Number(match[1]);
  assert.ok(50_000 / interval < 40, `configured interval would produce ${50_000 / interval} reads/s`);
});

test("large host rooms automatically use a non-scrolling compact roster", () => {
  // Column count now scales up starting at a realistic venue size (9+ teams
  // auto-goes to 2 columns), not just at stress-test scale - see the comment
  // on automaticTeamColumns in app/host/quiz/page.tsx for the full reasoning.
  assert.match(host, /teams\.length > 32 \? 4 : teams\.length > 18 \? 3 : teams\.length > 8 \? 2/);
  assert.match(host, /qi-mc-teams--capacity/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.qi-mc-teams--capacity \{ overflow:hidden;/);
  // The per-team roster row was restructured from two stacked lines
  // (a __summary line plus a separate __answer line) into one merged grid
  // row per team (see the JSX above the scores.map in app/host/quiz/
  // page.tsx), specifically so a realistic team count (up to 25) fits with
  // zero scrolling at the SAME font size as before, instead of needing to
  // shrink text to fit. The live-answer preview's font size is now fixed
  // inline in the JSX rather than switched by a capacity-mode CSS class, so
  // this regression check now asserts that directly: it must stay
  // comfortably readable (>=11px), never shrunk back down to the old
  // illegible 9px.
  const liveAnswerFontSize = host.match(/color:ansColor, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const \}\}>\{ans\}<\/span>/);
  assert.ok(liveAnswerFontSize, "live-answer preview span still renders the team's answer text");
  const fontSizeMatch = host.match(/fontSize:(\d+), color:ansColor/);
  assert.ok(fontSizeMatch, "live-answer preview has an explicit font size");
  assert.ok(Number(fontSizeMatch[1]) >= 11, `live-answer font size ${fontSizeMatch[1]}px must stay readable (>=11px)`);
});
