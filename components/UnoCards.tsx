"use client";
import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { setScoreAbsolute } from "@/lib/quiz/scoreService";

const CARDS = [
  { type: "block",   label: "Time-Out", emoji: "⏸",  color: "#60a5fa", bg: "rgba(59,130,246,0.25)", desc: "Freezes all other teams for 10 seconds — activates when the host starts the timer." },
  { type: "reverse", label: "Reverse",  emoji: "↻",  color: "#f87171", bg: "rgba(239,68,68,0.25)",  desc: "Reverses the digits of your score. 19 becomes 91. 34 becomes 43." },
  { type: "x2",      label: "Boost",    emoji: "⚡", color: "#facc15", bg: "rgba(234,179,8,0.2)",   desc: "Doubles your points for every correct answer in the current round." },
];

export function UnoPlayerCards({ teamName, sessionPin, roundNumber, compact = false }: { teamName: string; sessionPin?: string; roundNumber?: number; compact?: boolean }) {
  const [used, setUsed] = useState<string[]>([]);
  const [usedThisRound, setUsedThisRound] = useState<number[]>([]);

  useEffect(() => {
    if (!sessionPin) return;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.from("uno_cards").select("card_type, round_number").eq("team_name", teamName).eq("session_pin", sessionPin);
      if (data) {
        setUsed(data.map(d => d.card_type));
        setUsedThisRound(data.map(d => d.round_number).filter((n): n is number => n != null));
      }
    })();
  }, [teamName, sessionPin]);
  const [playing, setPlaying] = useState<string | null>(null);

  // A team may only activate one Power Card per round. Once any card has been
  // played with the current round_number, every other (not-yet-used) card is
  // locked until the next round begins - this resets automatically since it's
  // derived from usedThisRound rather than a separate flag that would need
  // explicit clearing.
  const roundLocked = roundNumber != null && usedThisRound.includes(roundNumber);

  const playCard = async (cardType: string) => {
    if (used.includes(cardType) || playing || roundLocked) return;
    setPlaying(cardType);
    const supabase = createSupabaseBrowserClient();
    const playedAt = new Date().toISOString();
    const insertPromise = supabase.from("uno_cards").insert({
      team_name: teamName,
      card_type: cardType,
      used: true,
      played_at: playedAt,
      session_pin: sessionPin || "",
      round_number: roundNumber ?? null,
    });
    // Reverse has no dependency on the uno_cards insert above - kick it off
    // immediately, in parallel, instead of waiting for the insert to finish
    // first. This is what was causing the noticeable delay: the score change
    // was serialized behind an unrelated write.
    // Routed through the shared score service (scores table is authoritative).
    // eventKey ties this score event to the card-play timestamp so the same
    // reverse can't be applied twice.
    const reversePromise = (cardType === "reverse" && sessionPin)
      ? (async () => {
          const { data: existing } = await supabase.from("scores").select("total_points").eq("session_pin", sessionPin).eq("team_name", teamName).maybeSingle();
          if (existing) {
            const current = existing.total_points || 0;
            const sign = current < 0 ? -1 : 1;
            const reversed = sign * parseInt(Math.abs(current).toString().split("").reverse().join("") || "0", 10);
            const result = await setScoreAbsolute(supabase, sessionPin, teamName, reversed, {
              eventKey: `reverse:${sessionPin}:${teamName}:${playedAt}`,
            });
            if (result.scoreboardSyncError) console.error("Reverse card: score updated but scoreboard_data sync failed:", result.scoreboardSyncError);
          }
        })()
      : Promise.resolve();
    await insertPromise;
    if (cardType === "block" && sessionPin) {
      // Store as pending — the 10-second lockout activates when the HOST presses
      // the timer button, not immediately. This means on a 15-second question,
      // other teams have 5 seconds left after the timer starts to answer.
      await supabase.from("sessions").update({
        block_pending: true,
        block_team: teamName,
        block_until: null,
      }).eq("pin", sessionPin);
    }
    await reversePromise;
    setUsed(prev => [...prev, cardType]);
    if (roundNumber != null) setUsedThisRound(prev => [...prev, roundNumber]);
    setPlaying(null);
  };

  if (compact) {
    return (
      <div style={{ display: "flex", gap: 8, justifyContent: "center", paddingTop: 6 }}>
        {CARDS.map(card => {
          const isUsed = used.includes(card.type);
          const isLocked = isUsed || roundLocked;
          const isPlaying = playing === card.type;
          return (
            <button
              key={card.type}
              onClick={() => playCard(card.type)}
              disabled={isLocked || !!playing}
              title={card.desc}
              style={{
                width: 56, height: 56, borderRadius: 12,
                border: "2px solid " + (isLocked ? "rgba(255,255,255,0.1)" : card.color),
                background: isLocked ? "rgba(255,255,255,0.04)" : card.bg,
                color: isLocked ? "rgba(255,255,255,0.2)" : card.color,
                cursor: isLocked ? "not-allowed" : "pointer",
                display: "flex", flexDirection: "column" as const,
                alignItems: "center", justifyContent: "center", gap: 1,
                opacity: isLocked ? 0.4 : 1,
                boxShadow: isLocked ? "none" : "0 0 12px " + card.color + "44",
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
          const isLocked = isUsed || roundLocked;
          const isPlaying = playing === card.type;
          return (
            <button
              key={card.type}
              onClick={() => playCard(card.type)}
              disabled={isLocked || !!playing}
              style={{
                width: "100%", padding: "14px 16px", borderRadius: 12,
                border: "2px solid " + (isLocked ? "rgba(255,255,255,0.1)" : card.color),
                background: isLocked ? "rgba(255,255,255,0.05)" : card.bg,
                color: isLocked ? "rgba(255,255,255,0.3)" : "#fff",
                cursor: isLocked ? "not-allowed" : "pointer",
                display: "flex", flexDirection: "row" as const, alignItems: "center", gap: 14,
                opacity: isLocked ? 0.5 : 1, transition: "all 0.2s",
                boxShadow: isLocked ? "none" : "0 4px 16px " + card.color + "44",
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
