"use client";
import { CSSProperties } from "react";

// Quiz-It Team Badge — a reusable team crest usable anywhere in the app.
//
// Today it renders faceted initials. It is built so a later drop of richer
// identity (uploaded avatars, league icons, venue branding) needs no layout
// change: pass `avatarUrl` or `icon` and the same hexagon footprint is filled.
// Consumers only ever set `size`; everything else is optional.

export type TeamBadgeProps = {
  name: string;
  size: number; // px — the badge is always a square of this side
  avatarUrl?: string | null; // future: uploaded team photo
  icon?: React.ReactNode; // future: league / venue mark
  color?: string; // override the crest fill (defaults to brand purple)
  className?: string;
  style?: CSSProperties;
};

export function teamInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase();
}

// Hexagon crest silhouette (matches the prototype's facet language).
const CREST_CLIP = "polygon(50% 0, 100% 26%, 100% 74%, 50% 100%, 0 74%, 0 26%)";

export function TeamBadge({ name, size, avatarUrl, icon, color = "#BE26C1", className, style }: TeamBadgeProps) {
  const base: CSSProperties = {
    width: size,
    height: size,
    flex: "none",
    clipPath: CREST_CLIP,
    WebkitClipPath: CREST_CLIP,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    background: `linear-gradient(135deg, ${color}, #1d1140)`,
    border: `1px solid ${color}`,
    color: "#fff",
    ...style,
  };

  let content: React.ReactNode;
  if (avatarUrl) {
    content = <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  } else if (icon) {
    content = icon;
  } else {
    content = (
      <span style={{ font: `800 ${size * 0.38}px 'Inter', sans-serif`, letterSpacing: "0.02em" }}>{teamInitials(name)}</span>
    );
  }

  return (
    <div className={className} style={base} aria-label={name} title={name}>
      {content}
    </div>
  );
}
