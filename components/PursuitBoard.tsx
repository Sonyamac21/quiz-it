"use client";
import { useEffect, useMemo, useRef, useState, CSSProperties } from "react";
import {
  PursuitPhase,
  PursuitRace,
  TeamRace,
  PURSUIT_TOTAL_QUESTIONS,
  computePursuitLayout,
  scalePursuitLayout,
  summariseRace,
  pursuitTotalPoints,
} from "@/lib/quiz/pursuit";
import { PursuitLane } from "@/components/PursuitLane";

// THE PURSUIT — the Display board (the hero surface). Presentation only: it takes
// the authoritative race state and renders the prototype's stage — title zone,
// gate tracker, question panel, mirrored columns around a shared finish column,
// footer — and choreographs the reveal pass. It owns no game logic.

type Props = {
  status: PursuitPhase;
  race: PursuitRace;
  teamNames: string[];
  qIndex: number; // 0-based current gate (-1 before first)
  timeLeft?: number | null;
  questionText?: string | null;
  questionCategory?: string | null;
  correctAnswer?: string | null;
};

// Timeline offsets for the one choreographed reveal pass (Motion Language v1.0).
const REVEAL_PAUSE = 300; // correct answer shown → hold
const COMPACTION_DELAY = 1300; // movement fully settled → reflow (never concurrent)

function cssVars(vars: Record<string, string>): CSSProperties {
  return vars as CSSProperties;
}

export function PursuitBoard({ status, race, teamNames, qIndex, timeLeft, questionText, questionCategory, correctAnswer }: Props) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(1300);

  // displayRace drives runner/block movement; heightRace drives compaction. They
  // are committed at different beats so lanes never move and reflow at once.
  const [displayRace, setDisplayRace] = useState<PursuitRace>(race);
  const [heightRace, setHeightRace] = useState<PursuitRace>(race);
  const [sweep, setSweep] = useState(false);
  const [survivorStamp, setSurvivorStamp] = useState(0);
  const timersRef = useRef<number[]>([]);

  const baseLayout = useMemo(() => computePursuitLayout(teamNames.length), [teamNames.length]);
  const layout = useMemo(() => scalePursuitLayout(baseLayout, boardWidth), [baseLayout, boardWidth]);

  // measure board width so every tier token scales to the real stage
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const update = () => setBoardWidth(el.clientWidth || 1300);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function clearTimers() {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }

  // The choreographed reveal pass.
  useEffect(() => {
    clearTimers();
    if (status === "advance") {
      // answers locked + correct answer already on screen (reveal) → pause → move.
      timersRef.current.push(window.setTimeout(() => setDisplayRace(race), REVEAL_PAUSE));
      timersRef.current.push(window.setTimeout(() => {
        setHeightRace(race); // compaction, after the travel settles
        setSurvivorStamp((n) => n + 1);
        const anyFinished = teamNames.some((t) => race[t]?.status === "completed");
        if (qIndex >= PURSUIT_TOTAL_QUESTIONS - 1 && anyFinished) {
          setSweep(true);
          timersRef.current.push(window.setTimeout(() => setSweep(false), 1200));
        }
      }, COMPACTION_DELAY));
    } else {
      // every other phase shows the current truth immediately (incl. refresh recovery)
      setDisplayRace(race);
      setHeightRace(race);
    }
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, race, qIndex]);

  // ---- tiers / columns ------------------------------------------------------
  const twoCol = layout.columns === 2;
  const half = Math.ceil(teamNames.length / 2);
  const colA = twoCol ? teamNames.slice(0, half) : teamNames;
  const colB = twoCol ? teamNames.slice(half) : [];

  // Column height is fixed at round start; compaction redistributes within it.
  const colRows = twoCol ? half : teamNames.length;
  const colHeight = colRows * layout.laneH + Math.max(0, colRows - 1) * layout.gap;

  function laneHeights(names: string[]): Record<string, number> {
    const out: Record<string, number> = {};
    if (names.length === 0) return out;
    const gaps = (names.length - 1) * layout.gap;
    const deadNames = names.filter((n) => heightRace[n]?.status === "eliminated");
    const live = names.length - deadNames.length;
    const deadH = layout.laneH * 0.7;
    const liveH = live > 0 ? Math.min(layout.laneH * 1.35, (colHeight - gaps - deadNames.length * deadH) / live) : layout.laneH;
    for (const n of names) out[n] = heightRace[n]?.status === "eliminated" ? deadH : liveH;
    return out;
  }
  const heightsA = laneHeights(colA);
  const heightsB = laneHeights(colB);

  // ---- title zone / gate tracker / stakes -----------------------------------
  const gate = qIndex >= 0 ? qIndex + 1 : 0;
  const summary = summariseRace(displayRace, teamNames);
  const stillRunning = summary.active.length + summary.completed.length;
  const isEnd = status === "complete" || status === "results";

  const showHero = status === "intro" || status === "waiting";
  const showQPanel = status === "question" || status === "reveal" || status === "advance";
  const answering = status === "question";

  const entryOf = (name: string): TeamRace => displayRace[name] ?? { stage: 0, status: "active" };

  const rootStyle = cssVars({
    "--lane-h": layout.laneH + "px",
    "--runner-s": layout.runner + "px",
    "--block-s": layout.block + "px",
    "--name-fs": layout.nameFs + "px",
    "--crest-s": layout.crest + "px",
    "--lane-gap": layout.gap + "px",
  });

  const boardClass = ["pursuit-board", answering ? "answering" : "", answering && typeof timeLeft === "number" && timeLeft <= 5 ? "urgent" : ""].filter(Boolean).join(" ");

  return (
    <div ref={boardRef} className={boardClass} style={rootStyle}>
      {showHero && (
        <div className="pu-home-hero">
          <div className="pu-home-title"><span style={{ color: "var(--brand-purple)" }}>THE</span> PURSUIT</div>
          <div className="pu-home-line">7 gates. Fall once and you&rsquo;re out.</div>
        </div>
      )}

      <div className="pu-tz">
        <div className="pu-title"><span className="accent">THE</span> PURSUIT</div>
        <div className="pu-gatebar">
          <div className="pu-gates">
            {Array.from({ length: PURSUIT_TOTAL_QUESTIONS }).map((_, i) => {
              const n = i + 1;
              const cls = ["pu-gate-dot", n < gate ? "done" : "", n === gate ? "now" : ""].filter(Boolean).join(" ");
              return <div key={i} className={cls} />;
            })}
          </div>
          <div className="pu-stakes">
            {gate > 0
              ? <>GATE {gate} OF {PURSUIT_TOTAL_QUESTIONS} · THIS GATE: <b>{pursuitTotalPoints(gate)} PTS</b></>
              : <>THIS GATE: <b>10 PTS</b></>}
          </div>
        </div>
      </div>

      {showQPanel && (
        <div className="pu-qpanel on">
          <span className="pu-qcat">GATE {Math.max(1, gate)}{questionCategory ? " · " + questionCategory.toUpperCase() : ""}</span>
          {status === "question" && typeof timeLeft === "number" && (
            <span style={{ float: "right", fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: "clamp(20px,3vh,34px)", fontVariantNumeric: "tabular-nums", color: timeLeft <= 5 ? "var(--feature-incorrect)" : "var(--brand-purple-bright)" }}>
              {timeLeft > 0 ? timeLeft + "s" : "LOCKED"}
            </span>
          )}
          <div className="pu-qtext">{questionText || "Question is live on the handsets."}</div>
          <div className={"pu-qstate" + (status === "reveal" || status === "advance" ? " correct" : "")}>
            {status === "question" ? (timeLeft === 0 ? "ANSWERS LOCKED" : "TEAMS ANSWERING…") : "CORRECT: " + (correctAnswer || "—")}
          </div>
        </div>
      )}

      <div className="pu-gridwrap">
        <div className="pu-col">
          {colA.map((name) => (
            <PursuitLane key={name} teamName={name} entry={entryOf(name)} layout={layout} mirror={false} laneHeight={heightsA[name] ?? layout.laneH} />
          ))}
        </div>
        <div className={"pu-finishcol" + (sweep ? " flare" : "")}>
          <div className="pu-sweep" />
          <div className="pu-flabel">FINISH</div>
        </div>
        <div className={"pu-col" + (twoCol ? "" : " hidden")}>
          {colB.map((name) => (
            <PursuitLane key={name} teamName={name} entry={entryOf(name)} layout={layout} mirror laneHeight={heightsB[name] ?? layout.laneH} />
          ))}
        </div>
      </div>

      <div className="pu-footer">
        <div key={survivorStamp} className="pu-survivors stamp">
          {teamNames.length === 0
            ? "—"
            : isEnd
            ? `THE PURSUIT: ${summary.completed.length} TEAM${summary.completed.length === 1 ? "" : "S"} WENT ALL THE WAY.`
            : `${stillRunning} OF ${teamNames.length} STILL RUNNING.`}
        </div>
        <div className="pu-brandbadge">QUIZ-IT · Powered by Mac Entertainment · by Sonya Mac</div>
      </div>
    </div>
  );
}
