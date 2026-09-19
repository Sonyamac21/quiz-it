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
// button in the top-right. Positions are picked at random within these
// bounds (see randomPlacement below), not from a fixed layout.
const PLACEMENT_X: [number, number] = [7, 93];
const PLACEMENT_Y: [number, number] = [30, 92];

function randomPlacement(): { x: number; y: number; rot: number; scale: number } {
  return {
    x: PLACEMENT_X[0] + Math.random() * (PLACEMENT_X[1] - PLACEMENT_X[0]),
    y: PLACEMENT_Y[0] + Math.random() * (PLACEMENT_Y[1] - PLACEMENT_Y[0]),
    rot: -16 + Math.random() * 32,
    scale: 0.72 + Math.random() * 0.34,
  };
}

// One "photo taken during the quiz" fluttering onto the screen, holding for
// a while, then fluttering off again to be replaced at a fresh random spot
// - each slot runs its own independent, staggered loop rather than a shared
// clock, so the wall never all-changes-at-once and instead feels alive/
// continuous.
function GalleryPhotoSlot({ photos, startDelayMs, startIndex, step }: { photos: string[]; startDelayMs: number; startIndex: number; step: number }) {
  // Starts at its own offset into the photo list and advances by `step`
  // (the total slot count) each cycle, so with plenty of photos every slot
  // works through its own slice of the full set instead of all slots
  // showing the same handful at once - the whole set gets shown over time.
  // With only a few photos, the modulo just wraps straight back around, so
  // the same one or two photos repeat rather than leaving a slot empty.
  const [photoIdx, setPhotoIdx] = useState(startIndex);
  const [placement, setPlacement] = useState(randomPlacement);
  const [entering, setEntering] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (photos.length === 0) return;
    let cancelled = false;
    const timers: number[] = [];
    const HOLD_MS = 7000;
    const LEAVE_MS = 650;

    const cycle = () => {
      if (cancelled) return;
      setEntering(true);
      setLeaving(false);
      timers.push(window.setTimeout(() => {
        if (cancelled) return;
        setLeaving(true);
        timers.push(window.setTimeout(() => {
          if (cancelled) return;
          setPhotoIdx(p => (p + step) % photos.length);
          setPlacement(randomPlacement());
          cycle();
        }, LEAVE_MS));
      }, HOLD_MS));
    };

    const start = window.setTimeout(cycle, startDelayMs);
    timers.push(start);
    return () => { cancelled = true; timers.forEach(clearTimeout); };
    // photos.length intentionally excludes photoIdx - each slot advances its
    // own index independently of re-renders from other slots or new photos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length, startDelayMs, step]);

  if (photos.length === 0) return null;
  const url = photos[photoIdx % photos.length];
  return (
    <div
      className={"qi-display-photo-flutter" + (entering ? " is-in" : "") + (leaving ? " is-out" : "")}
      style={{
        left: `${placement.x}%`,
        top: `${placement.y}%`,
        "--rot": `${placement.rot}deg`,
        "--scale": placement.scale,
      } as CSSProperties}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" />
    </div>
  );
}

// Full-screen "photo wall" for the intermission - team photos taken during
// the quiz (plus venue promo/gallery images) scattered at random within a
// safe area and fluttering onto the screen like polaroids landing, rather
// than one small rotating frame. Presentation-only (per this file's
// convention); the caller merges and filters the photo list.
export function IntermissionGallery({ photos }: { photos: string[] }) {
  if (photos.length === 0) return null;
  const slotCount = Math.min(8, Math.max(3, photos.length * 2));
  return (
    <div className="qi-display-photo-wall">
      {Array.from({ length: slotCount }).map((_, i) => (
        <GalleryPhotoSlot key={i} photos={photos} startDelayMs={i * 850} startIndex={i % photos.length} step={slotCount} />
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
