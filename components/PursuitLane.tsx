"use client";
import { useEffect, useRef, useState } from "react";
import { PursuitLayout, TeamRace, PURSUIT_TOTAL_QUESTIONS, pursuitTotalPoints } from "@/lib/quiz/pursuit";
import { TeamBadge } from "@/components/TeamBadge";
import { PursuitRunner, RunnerPose } from "@/components/PursuitRunner";

// THE PURSUIT — one team's race lane. Pure presentation over a race entry.
//
// Runner x is computed from live block geometry (offsetLeft) so mirrored lanes
// come for free — the same maths runs both directions. Each lane reacts to its
// own entry changing; because the board commits every lane's new entry in a
// single tick, all lanes animate together (the choreographed pass). Block colour
// and runner travel ride CSS transitions; the one-shot flourishes (flash, pose,
// tally roll) are triggered here off the entry delta.

type Props = {
  teamName: string;
  entry: TeamRace;
  layout: PursuitLayout;
  mirror: boolean;
  laneHeight: number; // px — driven by the board for compaction
};

function basePose(entry: TeamRace): RunnerPose {
  if (entry.status === "completed") return "victory";
  if (entry.status === "eliminated") return "seated";
  return "idle";
}

/** Resting runner position: 0 start pad, 1..7 at block n, 8 finish, +0.55 = seated beside failed block. */
function restPos(entry: TeamRace): number {
  if (entry.status === "completed") return 8;
  if (entry.status === "eliminated") return entry.stage + 0.55;
  return entry.stage;
}

export function PursuitLane({ teamName, entry, layout, mirror, laneHeight }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const runnerRef = useRef<HTMLDivElement | null>(null);
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prevEntryRef = useRef<TeamRace | null>(null);
  const timersRef = useRef<number[]>([]);

  const [pose, setPose] = useState<RunnerPose>(basePose(entry));
  const [moving, setMoving] = useState(false);
  const [sprinting, setSprinting] = useState(false);
  const [falling, setFalling] = useState(false);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const [banked, setBanked] = useState(pursuitTotalPoints(entry.stage));

  // --- runner geometry -------------------------------------------------------
  function blockCenter(i: number): number {
    const b = blockRefs.current[i];
    return b ? b.offsetLeft + b.offsetWidth / 2 : 0;
  }
  function pitch(): number {
    const p = blockCenter(1) - blockCenter(0);
    return p || layout.block * 1.4;
  }
  function runnerX(pos: number): number {
    if (pos <= 0) return blockCenter(0) - 1.5 * pitch();
    if (pos >= 8) return blockCenter(6) + 1.8 * pitch();
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    const xlo = lo < 1 ? blockCenter(0) - 1.5 * pitch() : blockCenter(lo - 1);
    if (lo === hi) return xlo;
    const xhi = blockCenter(hi - 1);
    return xlo + (xhi - xlo) * (pos - lo);
  }
  function placeRunner(pos: number, instant: boolean) {
    const track = trackRef.current;
    const runner = runnerRef.current;
    if (!track || !runner) return;
    const half = layout.runner / 2;
    const x = Math.max(half, Math.min(track.clientWidth - half, runnerX(pos))) - half;
    if (instant) runner.style.transition = "none";
    runner.style.left = x + "px";
    if (instant) {
      void runner.offsetWidth; // flush so the next move animates
      runner.style.transition = "";
    }
  }

  function clearTimers() {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }
  function later(fn: () => void, ms: number) {
    timersRef.current.push(window.setTimeout(fn, ms));
  }

  // --- react to this lane's entry changing (the synchronized pass) -----------
  useEffect(() => {
    const prev = prevEntryRef.current;
    const cur = entry;
    clearTimers();

    if (!prev) {
      // First render / refresh recovery: land instantly, no animation.
      placeRunner(restPos(cur), true);
      setPose(basePose(cur));
      setBanked(pursuitTotalPoints(cur.stage));
      prevEntryRef.current = cur;
      return;
    }

    const advanced = cur.status !== "eliminated" && cur.stage > prev.stage && cur.status !== "completed";
    const finished = cur.status === "completed" && prev.status !== "completed";
    const eliminated = cur.status === "eliminated" && prev.status !== "eliminated";

    if (finished) {
      setFlashIndex(6);
      setPose("run");
      setMoving(true);
      setSprinting(true);
      placeRunner(8, false);
      rollTally(pursuitTotalPoints(PURSUIT_TOTAL_QUESTIONS));
      later(() => { setMoving(false); setSprinting(false); setPose("victory"); setFlashIndex(null); }, 950);
    } else if (advanced) {
      setFlashIndex(prev.stage);
      setPose("run");
      setMoving(true);
      placeRunner(restPos(cur), false);
      rollTally(pursuitTotalPoints(cur.stage));
      later(() => {
        setMoving(false);
        // escalation flourish on gates 5–6
        if (cur.stage === 5 || cur.stage === 6) {
          setPose("victory");
          later(() => setPose("idle"), 200);
        } else {
          setPose("idle");
        }
        setFlashIndex(null);
      }, 700);
    } else if (eliminated) {
      setFlashIndex(cur.stage);
      setPose("run");
      placeRunner(cur.stage + 0.55, false);
      later(() => setPose("stumble"), 300);
      later(() => setFalling(true), 450);
      later(() => { setFalling(false); setPose("seated"); setFlashIndex(null); }, 850);
    } else {
      // No delta (e.g. a still lane during someone else's move) — settle.
      placeRunner(restPos(cur), true);
      setPose(basePose(cur));
      setBanked(pursuitTotalPoints(cur.stage));
    }

    prevEntryRef.current = cur;
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.stage, entry.status]);

  // Re-place on layout / compaction / resize (geometry may have shifted).
  useEffect(() => {
    placeRunner(restPos(entry), true);
    const onResize = () => placeRunner(restPos(entry), true);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.block, layout.runner, laneHeight, mirror]);

  // --- banked tally count-up -------------------------------------------------
  const bankedRef = useRef(banked);
  bankedRef.current = banked;
  function rollTally(to: number) {
    const from = bankedRef.current;
    if (from === to) { setBanked(to); return; }
    const t0 = performance.now();
    const dur = 300;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setBanked(Math.round(from + (to - from) * eased));
      if (k < 1) requestAnimationFrame(step);
      else setBanked(to);
    };
    requestAnimationFrame(step);
  }

  useEffect(() => () => clearTimers(), []);

  // --- derived block classes -------------------------------------------------
  function blockClass(i: number): string {
    const classes = ["pu-block"];
    if (i === 6) classes.push("b7");
    if (i < entry.stage) classes.push("done");
    else if (entry.status === "eliminated" && i === entry.stage) classes.push("failed");
    else if (entry.status !== "completed" && entry.status !== "eliminated" && i === entry.stage) classes.push("current");
    if (flashIndex === i) classes.push("flash");
    return classes.join(" ");
  }

  const laneClasses = ["pu-lane"];
  if (mirror) laneClasses.push("mirror");
  if (entry.status === "eliminated") laneClasses.push("eliminated");
  if (entry.status === "completed") laneClasses.push("finished");

  const runnerClasses = [moving ? "moving" : "", sprinting ? "sprinting" : "", falling ? "falling" : ""].filter(Boolean).join(" ");
  const isGold = entry.status === "completed";

  return (
    <div className={laneClasses.join(" ")} style={{ height: laneHeight }}>
      <div className="pu-ident">
        <TeamBadge name={teamName} size={layout.crest} />
        <div className="pu-idtext">
          <div className="pu-tname">{teamName}</div>
          <div className={"pu-banked" + (isGold ? " gold" : "")}>{banked}</div>
        </div>
      </div>
      <div className="pu-track" ref={trackRef}>
        <div className="pu-blocks">
          {Array.from({ length: PURSUIT_TOTAL_QUESTIONS }).map((_, i) => (
            <div key={i} className={blockClass(i)} ref={(el) => { blockRefs.current[i] = el; }} />
          ))}
        </div>
        <PursuitRunner pose={pose} className={runnerClasses} ref={runnerRef} />
        <div className={"pu-fbanner" + (entry.status === "completed" ? " on" : "")}>FINISH</div>
      </div>
    </div>
  );
}
