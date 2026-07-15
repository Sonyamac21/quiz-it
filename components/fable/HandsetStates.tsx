"use client";

/**
 * Fable Handset state presentation components.
 * Ported verbatim from design/fable/quiz-it-show-screens.html
 * ("HANDSET — JOIN → PLAY", "HANDSET — SET-PIECES & FINALE").
 *
 * PRESENTATION ONLY. Gameplay interactions (select/lock, submit,
 * realtime sync, scoring) stay in PlayerQuizScreen and are passed in
 * as props/handlers. Nothing here mutates game state.
 *
 * Typography law v1.2: "LOCKED", "CORRECT", "CHAMPIONS", "EYES UP"
 * are branded stamps → Bruno. Team names, scores, points, answers,
 * body copy → Inter. Nothing below 14px.
 */

import type { ReactNode } from "react";

export function Crest({
  initials,
  size = 40,
  gold,
  dim,
}: {
  initials: string;
  size?: number;
  gold?: boolean;
  dim?: boolean;
}) {
  return (
    <span
      className="crest"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        ...(gold
          ? { borderColor: "#E8C36A", boxShadow: "0 0 24px rgba(232,195,106,.5)" }
          : {}),
        ...(dim ? { opacity: 0.5 } : {}),
      }}
    >
      {initials}
    </span>
  );
}

function HStage({
  children,
  className = "",
  strip,
}: {
  children: ReactNode;
  className?: string;
  strip?: ReactNode;
}) {
  return (
    <div className={`fbl fbl-state fbl-hstate ${className}`.trim()}>
      {strip}
      {children}
    </div>
  );
}

function Strip({ initials, right }: { initials: string; right: string }) {
  return (
    <div className="strip">
      <Crest initials={initials} size={40} />
      <span>{right}</span>
    </div>
  );
}

/* ---------------- JOIN → PLAY ---------------- */

export function HandsetWaiting({
  initials,
  teamName,
  teamCount,
}: {
  initials: string;
  teamName: string;
  teamCount?: number;
}) {
  return (
    <HStage>
      <div className="mid">
        <Crest initials={initials} size={120} />
        <div className="pstA enter" style={{ fontSize: "clamp(22px,6.6vw,30px)" }}>
          {teamName}
        </div>
        <div className="pstB">
          Waiting for your host…
          {teamCount ? (
            <>
              <br />
              {teamCount} teams in the room tonight
            </>
          ) : null}
        </div>
      </div>
    </HStage>
  );
}

export function HandsetAnswerLocked({
  initials,
  answerText,
  round,
}: {
  initials: string;
  answerText: string;
  round: string;
}) {
  return (
    <HStage strip={<Strip initials={initials} right={round} />}>
      <div className="mid">
        <span className="plate">{answerText.toUpperCase()}</span>
        <div className="pstA bruno enter" style={{ fontSize: "clamp(24px,7vw,32px)" }}>
          LOCKED
        </div>
        <div className="pstB">Answer sealed until the reveal.</div>
      </div>
    </HStage>
  );
}

export function HandsetCorrect({
  gained,
  breakdown,
}: {
  gained: number;
  breakdown?: string;
}) {
  return (
    <HStage className="correct">
      <div className="mid">
        <div className="pstA bruno enter" style={{ fontSize: "clamp(26px,7.6vw,34px)", color: "#fff" }}>
          CORRECT
        </div>
        <div className="pstA" style={{ fontSize: "clamp(24px,7vw,32px)", color: "#2EE06E" }}>
          +{gained}
        </div>
        {breakdown && <div className="pstB">{breakdown}</div>}
      </div>
    </HStage>
  );
}

export function HandsetIncorrect({
  yourAnswer,
  correctAnswer,
  signOff = "That one stung — next one's yours.",
}: {
  yourAnswer: string;
  correctAnswer: string;
  signOff?: string;
}) {
  return (
    <HStage>
      <div className="mid">
        <div className="pstB" style={{ fontSize: "clamp(14px,4vw,17px)" }}>
          Your answer · <span style={{ color: "#FF3B4E" }}>{yourAnswer}</span>
        </div>
        <div className="pstA enter" style={{ fontSize: "clamp(24px,7vw,32px)" }}>
          {correctAnswer}
        </div>
        <div className="pstB">{signOff}</div>
      </div>
    </HStage>
  );
}

export function HandsetEyesUp({
  initials,
  rankLine,
}: {
  initials: string;
  rankLine: string;
}) {
  return (
    <HStage>
      <div className="mid">
        <Crest initials={initials} size={64} dim />
        <div
          className="pstB bruno"
          style={{
            fontFamily: "'Bruno Ace SC',var(--font-logo),cursive",
            fontSize: "clamp(14px,4vw,18px)",
            letterSpacing: ".24em",
          }}
        >
          EYES UP
        </div>
        <div className="pstB" style={{ fontSize: "clamp(13px,3.4vw,15px)", color: "#6B5A8E" }}>
          {rankLine.toUpperCase()}
        </div>
      </div>
    </HStage>
  );
}

/* ---------------- FINALE ---------------- */

export function HandsetWinner({
  initials,
  message = "Get up there — your photo's waiting.",
}: {
  initials: string;
  message?: string;
}) {
  return (
    <HStage className="winner">
      <div className="mid">
        <Crest initials={initials} size={80} gold />
        <div
          className="pstA bruno enter"
          style={{
            fontSize: "clamp(24px,6.8vw,30px)",
            letterSpacing: ".14em",
            color: "#E8C36A",
            textShadow: "0 0 20px rgba(232,195,106,.6)",
          }}
        >
          CHAMPIONS
        </div>
        <div className="pstB" style={{ color: "#E8C36A" }}>
          {message}
        </div>
      </div>
    </HStage>
  );
}

export function HandsetQuizFinished({
  initials,
  rankLine,
  statLine,
  superlative,
  nextLine = "Same tables next Thursday.",
  onSaveShare,
}: {
  initials: string;
  rankLine: string;
  statLine?: string;
  superlative?: string;
  nextLine?: string;
  onSaveShare?: () => void;
}) {
  return (
    <HStage strip={<Strip initials={initials} right="YOUR NIGHT" />}>
      <div
        style={{
          background: "#150A2E",
          border: "1px solid #2E1A52",
          borderRadius: 18,
          padding: "6%",
          marginTop: "2%",
          width: "100%",
        }}
      >
        <div className="pstA" style={{ fontSize: "clamp(20px,6vw,26px)" }}>
          {rankLine}
        </div>
        <div className="pstB" style={{ fontSize: "clamp(13px,3.6vw,15px)" }}>
          {statLine}
          {superlative ? (
            <>
              <br />
              Superlative: <b style={{ color: "#fff" }}>{superlative}</b>
            </>
          ) : null}
        </div>
      </div>
      <div style={{ marginTop: "auto", width: "100%" }}>
        <div className="bar pri" onClick={onSaveShare} role="button" tabIndex={0}>
          SAVE &amp; SHARE
        </div>
        <div className="pstB" style={{ textAlign: "center", fontSize: "clamp(12px,3.2vw,14px)" }}>
          {nextLine}
        </div>
      </div>
    </HStage>
  );
}

/* ---------------- TROUBLE / SETTINGS / PROFILE ---------------- */

export function HandsetReconnecting({
  initials,
  round = "LIVE",
  questionText,
}: {
  initials: string;
  round?: string;
  questionText?: string;
}) {
  return (
    <HStage>
      <div className="strip" style={{ opacity: 0.6 }}>
        <Crest initials={initials} size={40} />
        <span>{round}</span>
      </div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, font: "600 14px 'Inter'", color: "#B9A8D9" }}
      >
        <i className="recdot" style={{ width: 10, height: 10 }} />
        Reconnecting to the show…
      </div>
      {questionText && (
        <div className="mid" style={{ opacity: 0.5 }}>
          <div className="pstA" style={{ fontSize: "clamp(20px,5.6vw,26px)" }}>
            {questionText}
          </div>
        </div>
      )}
      <div className="pstB" style={{ fontSize: "clamp(12px,3.2vw,14px)" }}>
        Still with you — the show carries on on the big screen.
      </div>
    </HStage>
  );
}

type SettingRow = { label: string; value: string; active?: boolean };

export function HandsetSettings({
  rows,
  onRow,
}: {
  rows: SettingRow[];
  onRow?: (label: string) => void;
}) {
  return (
    <HStage strip={<div className="strip"><span>SETTINGS</span></div>}>
      <div className="row-set">
        {rows.map((r) => (
          <div key={r.label} onClick={() => onRow?.(r.label)} role="button" tabIndex={0}>
            {r.label}
            <b className={r.active ? "" : "off"}>{r.value}</b>
          </div>
        ))}
      </div>
      <div className="pstB" style={{ marginTop: "auto", fontSize: "clamp(12px,3.2vw,14px)" }}>
        Quiz-It · Powered by Mac Entertainment
      </div>
    </HStage>
  );
}

export function HandsetProfile({
  initials,
  teamName,
  historyLine,
  onEditCrest,
}: {
  initials: string;
  teamName: string;
  historyLine?: string;
  onEditCrest?: () => void;
}) {
  return (
    <HStage>
      <div className="mid">
        <Crest initials={initials} size={88} />
        <div className="pstA" style={{ fontSize: "clamp(22px,6.4vw,28px)" }}>
          {teamName}
        </div>
        {historyLine && (
          <div className="pstB" style={{ fontSize: "clamp(13px,3.6vw,15px)" }}>
            {historyLine}
          </div>
        )}
      </div>
      <div className="bar" onClick={onEditCrest} role="button" tabIndex={0}>
        EDIT CREST GEOMETRY
      </div>
    </HStage>
  );
}
