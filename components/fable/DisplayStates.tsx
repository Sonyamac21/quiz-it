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

import { useEffect, useState, type ReactNode } from "react";

const BADGE = "QUIZ-IT";

export function Wordmark({ size }: { size?: number | string }) {
  return (
    <div className="wm" style={size ? { fontSize: size } : undefined}>
      <span className="q">QUIZ-</span>IT
    </div>
  );
}

function DisplayBadge({ label = BADGE }: { label?: string }) {
  return <div className="badge">{label}</div>;
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

// Rotating photo gallery for the intermission screen - venue offer/gallery
// photos plus host-approved customer photos, already merged and filtered by
// the caller (this stays presentation-only, per this file's convention: no
// Supabase reads happen here). Cross-fades on a fixed interval; a single
// photo just holds still instead of flashing.
export function IntermissionGallery({ photos, intervalMs = 6000 }: { photos: string[]; intervalMs?: number }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (photos.length < 2) return;
    const id = window.setInterval(() => setIndex(current => (current + 1) % photos.length), intervalMs);
    return () => window.clearInterval(id);
  }, [photos.length, intervalMs]);
  if (photos.length === 0) return null;
  const safeIndex = index % photos.length;
  return (
    <div className="qi-display-promo-gallery">
      {photos.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={url + i} src={url} alt="" className={"qi-display-promo-gallery-img" + (i === safeIndex ? " active" : "")} />
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
