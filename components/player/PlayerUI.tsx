"use client";

import { useEffect, useState, type ReactNode } from "react";
import { teamInitials } from "@/components/TeamBadge";
import { getMediaUrl } from "@/lib/getMediaUrl";

export function PlayerShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`qi-player-shell ${className}`.trim()}>{children}</div>;
}

export function PlayerStatusBar({ teamName, roundName, powerCardsEnabled = true, photoUrl, points }: { teamName: string; roundName?: string; powerCardsEnabled?: boolean; photoUrl?: string | null; points?: number }) {
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
        <img className="qi-player-status__crest qi-player-status__crest--photo" src={getMediaUrl(photoUrl) ?? undefined} alt="Your team photo" onError={() => setPhotoFailed(true)} />
      ) : (
        <span className="qi-player-status__crest" aria-hidden="true">{teamInitials(teamName)}</span>
      )}
      {typeof points === "number" && (
        <span style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: 999, background: "rgba(190,38,193,0.18)", border: "1px solid rgba(190,38,193,0.45)", color: "#fff", fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {points} pts
        </span>
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
