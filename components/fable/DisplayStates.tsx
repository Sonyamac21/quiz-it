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

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

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
// 2 rows (not 3) keeps each cell tall enough for a max-scale (1.1x) 4:5
// photo to fit without its height spilling into the row above/below - a
// 3-row grid's shorter cells was the exact thing that caused overlap
// before. 5 columns instead gives enough total cells (10) to hold
// MAX_ACTIVE_PHOTOS (8) plus 2 spare, without shrinking row height.
const GRID_COLS = 5;
const GRID_ROWS = 2;
const GRID_CELLS = GRID_COLS * GRID_ROWS;
// Max photos on screen at once - fewer than GRID_CELLS so a freed cell is
// always available for the next photo to land in without waiting.
const MAX_ACTIVE_PHOTOS = 8;

function cellPlacement(cell: number): { x: number; y: number; rot: number; scale: number; drift: number } {
  const col = cell % GRID_COLS;
  const row = Math.floor(cell / GRID_COLS);
  const cellW = (PLACEMENT_X[1] - PLACEMENT_X[0]) / GRID_COLS;
  const cellH = (PLACEMENT_Y[1] - PLACEMENT_Y[0]) / GRID_ROWS;
  const cx = PLACEMENT_X[0] + cellW * (col + 0.5);
  const cy = PLACEMENT_Y[0] + cellH * (row + 0.5);
  return {
    // Jitter pulled in from 0.5x to 0.3x of the cell, and the size range
    // below narrowed - the wider jitter/scale combination used previously
    // let a bigger-than-average photo edge into a neighbouring cell's
    // territory (especially with a 3-row grid's shorter cells), which is
    // what caused photos to visibly land on top of each other.
    x: cx + (Math.random() - 0.5) * cellW * 0.3,
    y: cy + (Math.random() - 0.5) * cellH * 0.3,
    rot: -16 + Math.random() * 32,
    scale: 0.7 + Math.random() * 0.4,
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

// One photo's whole life on the wall - claims its own grid cell from a
// shared registry, flutters in, holds, flutters out, then repeats with a
// fresh cell + the next photo in this slot's slice of the list. This slot
// manages its OWN timer lifecycle end to end, independent of every other
// slot - a previous version stored all slots in one parent array sized
// once at mount, so a venue adding more photos mid-intermission (growing
// slotCount) never actually grew that array, and every slot's timers got
// torn down and restarted (a visible freeze/reset) whenever photos.length
// changed at all. Splitting each slot into its own component means adding
// a photo just mounts one more independent slot alongside the others,
// untouched, and removing one just lets that slot's cell go free.
function GalleryPhotoSlot({ slotIndex, photos, cellRegistryRef, startDelayMs, step }: {
  slotIndex: number;
  photos: string[];
  cellRegistryRef: { current: Set<number> };
  startDelayMs: number;
  step: number;
}) {
  const [photoIdx, setPhotoIdx] = useState(slotIndex);
  const [placement, setPlacement] = useState<ReturnType<typeof cellPlacement> | null>(null);
  const [phase, setPhase] = useState<"pending" | "in" | "out">("pending");
  const [nonce, setNonce] = useState(0);
  const ownedCellRef = useRef<number | null>(null);
  // A photo URL that 404s (deleted from storage, a stale link) left the
  // browser's broken-image glyph fluttering onto the screen inside this
  // Polaroid frame for its full 11s hold - the exact "blank uploaded photo
  // floating onto the screen" bug reported live. Skip a failed URL for the
  // rest of this slot's rotation rather than showing it.
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (photos.length === 0) return;
    let cancelled = false;
    const timers: number[] = [];
    const HOLD_MS = 11000;
    const LEAVE_MS = 1700; // matches .qi-display-photo-flutter.is-out's animation-duration in globals.css

    const claimCell = () => {
      const registry = cellRegistryRef.current;
      if (ownedCellRef.current != null) registry.delete(ownedCellRef.current);
      const free = shuffledCells().filter(c => !registry.has(c));
      const cell = free[0] ?? ownedCellRef.current ?? 0;
      registry.add(cell);
      ownedCellRef.current = cell;
      return cellPlacement(cell);
    };

    const cycle = () => {
      if (cancelled) return;
      setPlacement(claimCell());
      setPhase("in");
      timers.push(window.setTimeout(() => {
        if (cancelled) return;
        setPhase("out");
        timers.push(window.setTimeout(() => {
          if (cancelled) return;
          setPhotoIdx(p => (p + step) % photos.length);
          setNonce(n => n + 1);
          cycle();
        }, LEAVE_MS));
      }, HOLD_MS));
    };

    const start = window.setTimeout(cycle, startDelayMs);
    timers.push(start);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      if (ownedCellRef.current != null) { cellRegistryRef.current.delete(ownedCellRef.current); ownedCellRef.current = null; }
    };
    // photos.length only - each slot's own loop is deliberately independent
    // of sibling slot count, so it never restarts just because another
    // slot mounted or unmounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length, startDelayMs, step]);

  const currentPhoto = photos[photoIdx % photos.length];
  if (phase === "pending" || !placement || photos.length === 0 || currentPhoto === failedPhoto) return null;
  return (
    // Keyed on nonce so each new photo/placement is a fresh DOM node -
    // that's what makes the flutter-in keyframe actually replay every
    // cycle instead of freezing at whichever angle it first entered with
    // (a plain class toggle on the same node doesn't restart a CSS
    // animation that's already applied via "forwards").
    <div
      key={nonce}
      className={"qi-display-photo-flutter" + (phase === "out" ? " is-out" : " is-in")}
      style={{
        left: `${placement.x}%`,
        top: `${placement.y}%`,
        "--rot": `${placement.rot}deg`,
        "--scale": placement.scale,
        "--drift": `${placement.drift}px`,
      } as CSSProperties}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={currentPhoto} alt="" onError={() => setFailedPhoto(currentPhoto)} />
    </div>
  );
}

// Full-screen "photo wall" for the intermission - team photos taken during
// the quiz (plus venue promo/gallery images) scattered across a hidden grid
// (so nothing overlaps) at a random jittered position and angle within its
// cell, fluttering onto the screen like polaroids landing, rather than one
// small rotating frame. Presentation-only (per this file's convention);
// the caller merges and filters the photo list.
export function IntermissionGallery({ photos }: { photos: string[] }) {
  // Always fills MAX_ACTIVE_PHOTOS slots regardless of how many unique
  // photos exist - repeats are fine (and expected) when there are fewer
  // photos than slots, rather than leaving the wall sparse.
  const slotCount = photos.length === 0 ? 0 : MAX_ACTIVE_PHOTOS;
  // Shared cell-occupancy registry, one Set for the whole wall's lifetime -
  // a ref rather than React state because slots read/mutate it directly
  // inside their own timer callbacks; it never needs to trigger a render
  // itself, only to stay current for whichever slot claims a cell next.
  const cellRegistryRef = useRef<Set<number>>(new Set());

  if (photos.length === 0) return null;
  return (
    <div className="qi-display-photo-wall">
      {Array.from({ length: slotCount }).map((_, i) => (
        <GalleryPhotoSlot key={i} slotIndex={i} photos={photos} cellRegistryRef={cellRegistryRef} startDelayMs={i * 1400 + 400} step={slotCount} />
      ))}
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
