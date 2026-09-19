"use client";

/**
 * Shared Quiz-It display state presentation components.
 *
 * These are PRESENTATION ONLY. They take plain props and render the
 * approved 1920×1080 Display language: purple bloom, Bruno stamps,
 * Inter reading text, "no error colour — trouble speaks in purple".
 * Gameplay/scoring/realtime state is passed in by the caller; nothing
 * here reads Supabase or drives the show.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

const BADGE = "QUIZ-IT";

export function Wordmark({ size }: { size?: number | string }) {
  return (
    <div className="wm" style={size ? { fontSize: size } : undefined}>
      <span className="q">QUIZ-</span>IT
    </div>
  );
}

function DisplayBadge({ label = BADGE }: { label?: string }) {
  // Deliberately its own class, not "badge" - QuizItBadge (app/host/display/
  // page.tsx) is a completely different corner-badge system (avatar + pill
  // background) that also uses the class "badge". Sharing the name meant
  // this plain text label picked up QuizItBadge's pill/backdrop-blur styling
  // by accident, and vice versa QuizItBadge picked up rules meant only for
  // this simple label - two unrelated badge designs bleeding into each other
  // wherever both happened to render. Keeping the position rule (still
  // shared, both badges pin to the same corner) but splitting the visual
  // rule apart.
  return <div className="qi-legacy-badge">{label}</div>;
}

/** Generic stage wrapper so every state shares the bloom + safe area. */
export function DisplayStage({
  children,
  className = "",
  badge = BADGE,
}: {
  children: ReactNode;
  className?: string;
  badge?: string;
}) {
  return (
    <div className={`fbl fbl-state qi-display-state ${className}`.trim()}>
      {children}
      <DisplayBadge label={badge} />
    </div>
  );
}

/* ---------------- SHOW STRUCTURE ---------------- */

export function RoundStart({
  roundNumber,
  roundName,
  points,
  questionCount,
  modifierLine,
}: {
  roundNumber: number;
  roundName: string;
  points?: number;
  questionCount?: number;
  modifierLine?: string;
}) {
  const sub = [
    roundName?.toUpperCase(),
    questionCount ? `${questionCount} QUESTIONS` : null,
    points ? `${points} PTS + SPEED` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <DisplayStage>
      <div className="qi-display-eyebrow">UP NEXT</div>
      <div className="stamp enter">ROUND {roundNumber}</div>
      {sub && <div className="sub">{sub}</div>}
      {modifierLine && <div className="whis">{modifierLine.toUpperCase()}</div>}
    </DisplayStage>
  );
}

export function RoundEnd({
  roundNumber,
  captions = [],
  hostPick,
}: {
  roundNumber: number;
  captions?: string[];
  hostPick?: string;
}) {
  return (
    <DisplayStage>
      <div className="qi-display-eyebrow">ROUND COMPLETE</div>
      <div className="stamp enter">END OF ROUND {roundNumber}</div>
      {captions.length > 0 && <div className="sub">{captions.join(" · ").toUpperCase()}</div>}
      {hostPick && <div className="whis">{hostPick.toUpperCase()}</div>}
    </DisplayStage>
  );
}

export function QuizComplete({
  teamCount,
  questionCount,
  winner,
  nextLine = "SEE YOU NEXT THURSDAY",
}: {
  teamCount?: number;
  questionCount?: number;
  winner?: string;
  nextLine?: string;
}) {
  const sub = [
    teamCount ? `${teamCount} TEAMS` : null,
    questionCount ? `${questionCount} QUESTIONS` : null,
    winner ? `WON BY ${winner.toUpperCase()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <DisplayStage>
      <div className="stamp enter" style={{ fontSize: "clamp(24px,4.4vw,64px)" }}>
        THAT&apos;S A WRAP
      </div>
      {sub && <div className="sub">{sub}</div>}
      <div className="whis">QUIZ-IT · {nextLine}</div>
    </DisplayStage>
  );
}

export function Intermission({
  nextLabel = "NEXT ROUND COMING UP",
  venueLine,
}: {
  nextLabel?: string;
  venueLine?: string;
}) {
  return (
    <DisplayStage>
      <div className="bloom" aria-hidden="true" />
      <div className="sub">{nextLabel.toUpperCase()}</div>
      <div className="whis">
        STANDINGS ON YOUR PHONES{venueLine ? ` · ${venueLine.toUpperCase()}` : ""}
      </div>
    </DisplayStage>
  );
}

// Safe placement bounds for the fluttering photo wall, as a percentage of
// the screen - kept clear of the top-left corner brand mark and the
// centered "TAKE A BREATHER / venue name / next round" title block (which
// all sit in the top ~26% of the screen), and clear of the fullscreen
// button in the top-right.
const PLACEMENT_X: [number, number] = [7, 93];
const PLACEMENT_Y: [number, number] = [30, 92];
// Photos are placed on a hidden grid, one photo per cell, with a random
// jitter + rotation inside each cell - pure random x/y let photos land on
// top of each other, so a grid is what actually guarantees no overlap; the
// per-cell jitter and rotation are what stop it reading as a grid. More
// cells than the max photo count on screen at once, so a freed cell is
// always available for the next photo to land in.
const GRID_COLS = 4;
const GRID_ROWS = 3;
const GRID_CELLS = GRID_COLS * GRID_ROWS;

function cellPlacement(cell: number): { x: number; y: number; rot: number; scale: number; drift: number } {
  const col = cell % GRID_COLS;
  const row = Math.floor(cell / GRID_COLS);
  const cellW = (PLACEMENT_X[1] - PLACEMENT_X[0]) / GRID_COLS;
  const cellH = (PLACEMENT_Y[1] - PLACEMENT_Y[0]) / GRID_ROWS;
  const cx = PLACEMENT_X[0] + cellW * (col + 0.5);
  const cy = PLACEMENT_Y[0] + cellH * (row + 0.5);
  return {
    x: cx + (Math.random() - 0.5) * cellW * 0.5,
    y: cy + (Math.random() - 0.5) * cellH * 0.5,
    rot: -16 + Math.random() * 32,
    scale: 0.78 + Math.random() * 0.28,
    // Sideways sway amplitude (px, signed) for the flutter-in/out keyframes
    // below - randomised per landing so photos drift and wobble in like a
    // dropped photo catching air, rather than falling in a dead-straight
    // line. Sign picked at random so some sway starts left, some right.
    drift: (45 + Math.random() * 65) * (Math.random() < 0.5 ? -1 : 1),
  };
}

function shuffledCells(): number[] {
  const cells = Array.from({ length: GRID_CELLS }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells;
}

type GallerySlotState = { cell: number; photoIdx: number; placement: ReturnType<typeof cellPlacement>; nonce: number; phase: "pending" | "in" | "hold" | "out" };

// Full-screen "photo wall" for the intermission - team photos taken during
// the quiz (plus venue promo/gallery images) scattered across a hidden grid
// (so nothing overlaps) at a random jittered position and angle within its
// cell, fluttering onto the screen like polaroids landing, rather than one
// small rotating frame. Cell assignment is owned here (not per-photo) so
// two photos can never be handed the same spot. Presentation-only (per
// this file's convention); the caller merges and filters the photo list.
export function IntermissionGallery({ photos }: { photos: string[] }) {
  const slotCount = Math.min(GRID_CELLS, Math.max(3, photos.length * 2));
  const [slots, setSlots] = useState<GallerySlotState[]>(() => {
    const cells = shuffledCells();
    return Array.from({ length: slotCount }, (_, i) => ({
      cell: cells[i],
      photoIdx: i % Math.max(1, photos.length),
      placement: cellPlacement(cells[i]),
      nonce: 0,
      // Starts hidden - the effect below staggers each slot's first
      // flutter-in the same way it staggers every later cycle, so the
      // whole wall doesn't land on screen in one go.
      phase: "pending" as const,
    }));
  });

  useEffect(() => {
    if (photos.length === 0) return;
    let cancelled = false;
    const timers: number[] = [];
    const HOLD_MS = 7000;
    const LEAVE_MS = 850; // matches .qi-display-photo-flutter.is-out's animation-duration in globals.css

    const scheduleHold = (slotIndex: number) => {
      timers.push(window.setTimeout(() => {
        if (cancelled) return;
        setSlots(prev => prev.map((s, i) => i === slotIndex ? { ...s, phase: "out" } : s));
        timers.push(window.setTimeout(() => {
          if (cancelled) return;
          setSlots(prev => {
            const usedCells = new Set(prev.filter((_, i) => i !== slotIndex).map(s => s.cell));
            const freeCells = shuffledCells().filter(c => !usedCells.has(c));
            const nextCell = freeCells[0] ?? prev[slotIndex].cell;
            const next = [...prev];
            next[slotIndex] = {
              cell: nextCell,
              photoIdx: (next[slotIndex].photoIdx + slotCount) % photos.length,
              placement: cellPlacement(nextCell),
              nonce: next[slotIndex].nonce + 1,
              phase: "in",
            };
            return next;
          });
          scheduleHold(slotIndex);
        }, LEAVE_MS));
      }, HOLD_MS));
    };

    slots.forEach((_, i) => {
      // First reveal: flip this slot from "pending" (invisible) to "in"
      // after its stagger delay, then hand off to the normal hold/leave/
      // re-enter loop.
      timers.push(window.setTimeout(() => {
        if (cancelled) return;
        setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, phase: "in" } : s));
        scheduleHold(i);
      }, i * 900 + 300));
    });

    return () => { cancelled = true; timers.forEach(clearTimeout); };
    // Runs once per photo-list identity / slot count change - each slot's
    // own loop re-reads current state via the setSlots updater rather than
    // closing over `slots`, so it doesn't need slots itself as a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length, slotCount]);

  if (photos.length === 0) return null;
  return (
    <div className="qi-display-photo-wall">
      {slots.filter(slot => slot.phase !== "pending").map(slot => {
        const i = slots.indexOf(slot);
        return (
        // Keyed on nonce so each new photo/placement is a fresh DOM node -
        // that's what makes the flutter-in keyframe actually replay every
        // cycle instead of freezing at whichever angle it first entered
        // with (a plain class toggle on the same node doesn't restart a
        // CSS animation that's already applied via "forwards").
        <div
          key={`${i}-${slot.nonce}`}
          className={"qi-display-photo-flutter" + (slot.phase === "out" ? " is-out" : " is-in")}
          style={{
            left: `${slot.placement.x}%`,
            top: `${slot.placement.y}%`,
            "--rot": `${slot.placement.rot}deg`,
            "--scale": slot.placement.scale,
            "--drift": `${slot.placement.drift}px`,
          } as CSSProperties}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photos[slot.photoIdx % photos.length]} alt="" />
        </div>
        );
      })}
    </div>
  );
}

export function WaitingForHost({
  message = "YOUR HOST WILL BE RIGHT BACK",
}: {
  message?: string;
}) {
  return (
    <DisplayStage>
      <div className="bloom" aria-hidden="true" />
      <div className="sub">{message.toUpperCase()}</div>
    </DisplayStage>
  );
}

/* ---------------- SYSTEM STATES ----------------
   "System trouble never breaks character: purple, calm, present
   tense, states what's safe. No codes on the Display, ever." */

export function DisplayLoading({ message = "SETTING THE STAGE…" }: { message?: string }) {
  return (
    <DisplayStage>
      <div className="bloom" aria-hidden="true" />
      <div className="whis">{message.toUpperCase()}</div>
    </DisplayStage>
  );
}

export function DisplayReconnecting() {
  return (
    <DisplayStage>
      <div className="recdot" />
      <div className="sub">RECONNECTING TO THE SHOW…</div>
      <div className="whis">THE GAME STATE IS SAFE</div>
    </DisplayStage>
  );
}

export function DisplayConnectionLost() {
  return (
    <DisplayStage>
      <Wordmark size="clamp(28px,4.2vw,64px)" />
      <div className="sub">WE&apos;LL BE BACK IN A MOMENT</div>
      <div className="whis">YOUR HOST HAS THE ROOM</div>
    </DisplayStage>
  );
}

export function DisplayNoSession() {
  return (
    <DisplayStage>
      <Wordmark size="clamp(32px,5.4vw,80px)" />
      <div className="whis">NO SHOW SCHEDULED ON THIS SCREEN</div>
    </DisplayStage>
  );
}

export function DisplayMaintenance() {
  return (
    <DisplayStage>
      <Wordmark size="clamp(28px,4.2vw,64px)" />
      <div className="sub">POLISHING THE STAGE</div>
      <div className="whis">BACK BEFORE SHOWTIME</div>
    </DisplayStage>
  );
}

export function DemoStage({
  children,
  title = "THE PURSUIT",
}: {
  children?: ReactNode;
  title?: string;
}) {
  return (
    <DisplayStage badge="QUIZ-IT · DEMO">
      {children ?? (
        <>
          <div className="stamp" style={{ fontSize: "clamp(22px,3.6vw,52px)" }}>
            {title}
          </div>
          <div className="sub">DEMO — SAMPLE TEAMS PLAYING AUTOMATICALLY</div>
          <div className="whis">FOR VENUE PREVIEWS &amp; SALES</div>
        </>
      )}
    </DisplayStage>
  );
}
