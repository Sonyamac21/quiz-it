"use client";

/**
 * Fable Host Console primitives.
 * Ported from design/fable/quiz-it-host-screens.html.
 *
 * "Calm authority, fixed geography, one primary action, everything
 * phrased as show material. The console never celebrates and never
 * shows red errors — trouble is purple, calm, and states what's safe."
 *
 * PRESENTATION ONLY. These are building blocks the real host routes
 * opt into; they hold no gameplay/session state themselves.
 *
 * Typography law v1.2: breadcrumb/section titles → Bruno (≥14px).
 * All data (scores, answers, table cells, inputs, buttons) → Inter.
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function HostShell({ children }: { children: ReactNode }) {
  return <div className="fbh">{children}</div>;
}

export function Wordmark() {
  return (
    <span className="fbh-wm">
      <span className="q">QUIZ-</span>IT
    </span>
  );
}

export function Breadcrumb({ children }: { children: ReactNode }) {
  return <span className="fbh-bc">{children}</span>;
}

export function HostFrame({ children }: { children: ReactNode }) {
  return <div className="fbh-frame">{children}</div>;
}

export function HostTop({ children }: { children: ReactNode }) {
  return <div className="fbh-top">{children}</div>;
}

export function TopSpacer() {
  return <span className="sp" style={{ flex: 1 }} />;
}

export function Pill({ children, live }: { children: ReactNode; live?: boolean }) {
  return <span className={`fbh-pill${live ? " live" : ""}`}>{children}</span>;
}

export function HostBody({ children }: { children: ReactNode }) {
  return <div className="fbh-body">{children}</div>;
}

export function HostPad({ children }: { children: ReactNode }) {
  return <div className="fbh-pad">{children}</div>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "pri";
  big?: boolean;
};

export function HostButton({ variant = "default", big, className = "", ...rest }: BtnProps) {
  return (
    <button
      className={`fbh-btn${variant === "pri" ? " pri" : ""}${big ? " big" : ""} ${className}`.trim()}
      {...rest}
    />
  );
}

export function HostLabel({ children }: { children: ReactNode }) {
  return <div className="fbh-lbl">{children}</div>;
}

export function HostInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`fbh-inp ${className}`.trim()} {...rest} />;
}

export function Panel({
  title,
  children,
  accent,
}: {
  title?: ReactNode;
  children?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="fbh-panel" style={accent ? { borderColor: "#8A1B8D" } : undefined}>
      {title && <h4>{title}</h4>}
      {children && <div className="s">{children}</div>}
    </div>
  );
}

export function StatCard({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="fbh-stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function HostCrest({ initials, size = 22 }: { initials: string; size?: number }) {
  return (
    <span
      className="fbh-crest"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials}
    </span>
  );
}

export function StatusDot({ on }: { on?: boolean }) {
  return <span className={`fbh-sdot ${on ? "on" : "off"}`} />;
}

export function Chip({
  children,
  on,
  onClick,
}: {
  children: ReactNode;
  on?: boolean;
  onClick?: () => void;
}) {
  return (
    <span className={`fbh-chip${on ? " on" : ""}`} onClick={onClick} role="button" tabIndex={0}>
      {children}
    </span>
  );
}

export function Toggle({ on, onClick }: { on?: boolean; onClick?: () => void }) {
  return (
    <span
      className={`fbh-sw${on ? " on" : ""}`}
      onClick={onClick}
      role="switch"
      aria-checked={!!on}
      tabIndex={0}
    >
      <i />
    </span>
  );
}

/* ---------------- STATES (loading / empty / trouble) ----------------
   No spinners. No red. The bloom is the wait; trouble speaks in purple. */

export function HostLoading({ title = "Setting The Stage", note = "No spinners exist. The bloom is the wait." }: { title?: string; note?: string }) {
  return (
    <div className="fbh-center">
      <div className="fbh-bloom" />
      <div className="fbh-stage-title">{title}</div>
      <div style={{ font: "400 12px 'Inter'", color: "#B9A8D9", marginTop: 4 }}>{note}</div>
    </div>
  );
}

export function HostEmpty({
  title,
  note,
  actionLabel,
  onAction,
}: {
  title: string;
  note?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="fbh-center">
      <div className="fbh-stage-title">{title}</div>
      {note && (
        <div style={{ font: "400 12px 'Inter'", color: "#B9A8D9", margin: "6px 0 14px" }}>{note}</div>
      )}
      {actionLabel && (
        <HostButton variant="pri" onClick={onAction}>
          {actionLabel}
        </HostButton>
      )}
    </div>
  );
}

export function HostTrouble({
  title = "Display Offline",
  headline,
  note = "Show state is safe. Teams stay connected.",
}: {
  title?: string;
  headline?: string;
  note?: string;
}) {
  return (
    <div className="fbh-center">
      <span
        className="fbh-sdot"
        style={{ width: 12, height: 12, background: "#8A1B8D", animation: "fbhBloom 1.6s infinite" }}
      />
      <div className="fbh-stage-title" style={{ marginTop: 10 }}>
        {title}
      </div>
      {headline && <div style={{ font: "800 12.5px 'Inter'", marginTop: 6 }}>{headline}</div>}
      <div style={{ font: "400 12px 'Inter'", color: "#B9A8D9", marginTop: 4 }}>{note}</div>
    </div>
  );
}

/* ---------------- MISSION CONTROL — ANSWERS IN (critical) ----------------
   Control console requirement: show the ACTUAL submitted answer beside
   each team, with badge, name, submission order and — after reveal —
   correct/incorrect state. Never decorative blobs. */

export type MissionAnswer = {
  order: number;
  initials: string;
  teamName: string;
  answerText: string;
  /** null before reveal, true/false after */
  correct?: boolean | null;
};

export function MissionAnswerRow({ a }: { a: MissionAnswer }) {
  const cls =
    a.correct === true ? "correct" : a.correct === false ? "incorrect" : "";
  return (
    <div className={`fbh-answer-row ${cls}`.trim()}>
      <span className="ord">{a.order}</span>
      <HostCrest initials={a.initials} size={20} />
      <span className="nm">{a.teamName}</span>
      <span className="ans">{a.answerText || "—"}</span>
    </div>
  );
}

export function MissionAnswersIn({ answers }: { answers: MissionAnswer[] }) {
  return (
    <div>
      {answers.map((a) => (
        <MissionAnswerRow key={`${a.order}-${a.initials}`} a={a} />
      ))}
    </div>
  );
}
