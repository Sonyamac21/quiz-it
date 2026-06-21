"use client";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const CARDS = [
  { type: "block",   label: "Time-Out", emoji: "X",  color: "#60a5fa", bg: "rgba(59,130,246,0.25)", desc: "Block all teams for 10 seconds" },
  { type: "reverse", label: "Reverse",  emoji: "R",  color: "#f87171", bg: "rgba(239,68,68,0.25)",  desc: "Flip the scoreboard" },
  { type: "x2",      label: "Boost",    emoji: "2x", color: "#facc15", bg: "rgba(234,179,8,0.2)",   desc: "Double your points" },
];

export function UnoPlayerCards({ teamName, sessionPin, compact = false }: { teamName: string; sessionPin?: string; compact?: boolean }) {
  const [used, setUsed] = useState<string[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);

  const playCard = async (cardType: string) => {
    if (used.includes(cardType) || playing) return;
    setPlaying(cardType);
    const supabase = createSupabaseBrowserClient();
    await supabase.from("uno_cards").insert({
      team_name: teamName,
      card_type: cardType,
      used: true,
      played_at: new Date().toISOString(),
      session_pin: sessionPin || "",
    });
    if (cardType === "block" && sessionPin) {
      await supabase.from("sessions").update({
        block_until: new Date(Date.now() + 10000).toISOString(),
        block_team: teamName,
      }).eq("pin", sessionPin);
    }
    if (cardType === "reverse" && sessionPin) {
      const { data: existing } = await supabase.from("scores").select("total_points").eq("session_pin", sessionPin).eq("team_name", teamName).maybeSingle();
      if (existing) {
        const current = existing.total_points || 0;
        const sign = current < 0 ? -1 : 1;
        const reversed = sign * parseInt(Math.abs(current).toString().split("").reverse().join("") || "0", 10);
        await supabase.from("scores").update({ total_points: reversed }).eq("session_pin", sessionPin).eq("team_name", teamName);
      }
    }
    setUsed(prev => [...prev, cardType]);
    setPlaying(null);
  };

  if (compact) {
    return (
      <div style={{ display: "flex", gap: 8, justifyContent: "center", paddingTop: 6 }}>
        {CARDS.map(card => {
          const isUsed = used.includes(card.type);
          const isPlaying = playing === card.type;
          return (
            <button
              key={card.type}
              onClick={() => playCard(card.type)}
              disabled={isUsed || !!playing}
              title={card.desc}
              style={{
                width: 56, height: 56, borderRadius: 12,
                border: "2px solid " + (isUsed ? "rgba(255,255,255,0.1)" : card.color),
                background: isUsed ? "rgba(255,255,255,0.04)" : card.bg,
                color: isUsed ? "rgba(255,255,255,0.2)" : card.color,
                cursor: isUsed ? "not-allowed" : "pointer",
                display: "flex", flexDirection: "column" as const,
                alignItems: "center", justifyContent: "center", gap: 1,
                opacity: isUsed ? 0.4 : 1,
                boxShadow: isUsed ? "none" : "0 0 12px " + card.color + "44",
                transform: isPlaying ? "scale(0.93)" : "scale(1)",
                transition: "all 0.15s", padding: 0,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 900, lineHeight: 1 }}>{card.emoji}</span>
              <span style={{ fontSize: 7, letterSpacing: 0.5, fontWeight: 700, opacity: 0.8 }}>{card.label.toUpperCase()}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", background: "rgba(45,10,94,0.7)", borderRadius: 16, border: "1px solid rgba(190,38,193,0.5)" }}>
      <div style={{ fontSize: 12, letterSpacing: 3, color: "#BE26C1", marginBottom: 12, textTransform: "uppercase" as const, fontWeight: 700 }}>
        Your Power Cards
      </div>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
        {CARDS.map(card => {
          const isUsed = used.includes(card.type);
          const isPlaying = playing === card.type;
          return (
            <button
              key={card.type}
              onClick={() => playCard(card.type)}
              disabled={isUsed || !!playing}
              style={{
                width: "100%", padding: "14px 16px", borderRadius: 12,
                border: "2px solid " + (isUsed ? "rgba(255,255,255,0.1)" : card.color),
                background: isUsed ? "rgba(255,255,255,0.05)" : card.bg,
                color: isUsed ? "rgba(255,255,255,0.3)" : "#fff",
                cursor: isUsed ? "not-allowed" : "pointer",
                display: "flex", flexDirection: "row" as const, alignItems: "center", gap: 14,
                opacity: isUsed ? 0.5 : 1, transition: "all 0.2s",
                boxShadow: isUsed ? "none" : "0 4px 16px " + card.color + "44",
                transform: isPlaying ? "scale(0.97)" : "scale(1)",
                textAlign: "left" as const,
              }}
            >
              <span style={{ fontSize: 26, fontWeight: 900, minWidth: 40, textAlign: "center" as const, color: card.color }}>{card.emoji}</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>{card.label}</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{card.desc}</div>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 16, opacity: 0.5 }}>›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Legacy export kept for compatibility
export function UnoHostPanel() { return null; }
