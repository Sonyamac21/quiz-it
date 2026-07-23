"use client";

import { useEffect, useState, type ReactNode } from "react";
import { teamInitials } from "@/components/TeamBadge";

export function PlayerShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`qi-player-shell ${className}`.trim()}>{children}</div>;
}

export function PlayerStatusBar({ teamName, roundName, powerCardsEnabled = true, photoUrl }: { teamName: string; roundName?: string; powerCardsEnabled?: boolean; photoUrl?: string | null }) {
  const [online, setOnline] = useState(true);
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);
  // Reset the "failed to load" state if the team switches to a different
  // photo (e.g. after a reconnect fetch resolves) - otherwise a genuinely new
  // URL would stay stuck showing the initials fallback from the old failure.
  // Done during render with a state mirror of the prop (the React-documented
  // "adjusting state when a prop changes" pattern) rather than a ref, which
  // this codebase's lint rules disallow reading/writing during render, or an
  // effect, which would cost an avoidable extra render pass.
  const [lastPhotoUrl, setLastPhotoUrl] = useState(photoUrl);
  if (lastPhotoUrl !== photoUrl) {
    setLastPhotoUrl(photoUrl);
    if (photoFailed) setPhotoFailed(false);
  }
  const showPhoto = !!photoUrl && !photoFailed;
  return (
    <header className="qi-player-status" aria-label="Player status">
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="qi-player-status__crest qi-player-status__crest--photo" src={photoUrl as string} alt="" aria-hidden="true" onError={() => setPhotoFailed(true)} />
      ) : (
        <span className="qi-player-status__crest" aria-hidden="true">{teamInitials(teamName)}</span>
      )}
      <span className="qi-player-status__identity"><strong>{teamName}</strong>{roundName ? <small>{roundName}</small> : null}</span>
      {powerCardsEnabled ? <span className="qi-player-status__cards" title="Power Cards available">CARDS</span> : null}
      <span className={`qi-player-status__connection${online ? " is-online" : " is-offline"}`}><i aria-hidden="true" />{online ? "LIVE" : "OFFLINE"}</span>
    </header>
  );
}

export function PlayerResultBanner({ tone, title, children }: { tone: "correct" | "incorrect" | "locked" | "neutral"; title: string; children?: ReactNode }) {
  return <div className={`qi-player-result qi-player-result--${tone}`} role="status"><strong>{title}</strong>{children ? <div>{children}</div> : null}</div>;
}
