"use client";

import { useEffect, useState, type ReactNode } from "react";
import { teamInitials } from "@/components/TeamBadge";

export function PlayerShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`qi-player-shell ${className}`.trim()}>{children}</div>;
}

export function PlayerStatusBar({ teamName, roundName, powerCardsEnabled = true }: { teamName: string; roundName?: string; powerCardsEnabled?: boolean }) {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);
  return (
    <header className="qi-player-status" aria-label="Player status">
      <span className="qi-player-status__crest" aria-hidden="true">{teamInitials(teamName)}</span>
      <span className="qi-player-status__identity"><strong>{teamName}</strong>{roundName ? <small>{roundName}</small> : null}</span>
      {powerCardsEnabled ? <span className="qi-player-status__cards" title="Power Cards available">CARDS</span> : null}
      <span className={`qi-player-status__connection${online ? " is-online" : " is-offline"}`}><i aria-hidden="true" />{online ? "LIVE" : "OFFLINE"}</span>
    </header>
  );
}

export function PlayerResultBanner({ tone, title, children }: { tone: "correct" | "incorrect" | "locked" | "neutral"; title: string; children?: ReactNode }) {
  return <div className={`qi-player-result qi-player-result--${tone}`} role="status"><strong>{title}</strong>{children ? <div>{children}</div> : null}</div>;
}
