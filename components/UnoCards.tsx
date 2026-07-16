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

  useEffect(() => {
    if (!sessionPin) return;
    const supabase = createSupabaseBrowserClient();
    const refetch = async () => {
      const { data } = await supabase.from("uno_cards").select("card_type").eq("team_name", teamName).eq("session_pin", sessionPin);
      if (data) {
        setUsed([...new Set(data.map(d => d.card_type))]);
      }
    };
    refetch();
    // Keep EVERY rendered instance of this team's cards in sync via realtime.
    // Each screen (question/answer/celebration) mounts its own UnoPlayerCards with
    // independent local state; without this, a card played on one screen still
    // looked available on another and could be played twice, and inventory drifted
    // (cards appearing to vanish or stay usable). A played card now becomes
    // unavailable everywhere immediately.
    const channel = supabase
      .channel("uno-cards-" + sessionPin + "-" + teamName)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "uno_cards", filter: "session_pin=eq." + sessionPin }, (payload) => {
        const row = payload.new as { team_name?: string; card_type?: string };
        if (row.team_name !== teamName) return;
        if (row.card_type) setUsed(prev => prev.includes(row.card_type!) ? prev : [...prev, row.card_type!]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [teamName, sessionPin]);
  const [playing, setPlaying] = useState<string | null>(null);

  const playCard = async (cardType: string) => {
    if (used.includes(cardType) || playing) return;
    setPlaying(cardType);
    const supabase = createSupabaseBrowserClient();
    const playedAt = new Date().toISOString();
    // REVERSE needs an existing score to change. Check that before atomically
    // consuming the card so a team never loses it without receiving its effect.
    let reversedScore: number | null = null;
    if (cardType === "reverse" && sessionPin) {
      const { data: existing } = await supabase.from("scores").select("total_points").eq("session_pin", sessionPin).eq("team_name", teamName).maybeSingle();
      if (!existing) {
        // No score row to reverse yet — do not consume the card, let the team keep it.
        setPlaying(null);
        return;
      }
      const current = existing.total_points || 0;
      const sign = current < 0 ? -1 : 1;
      reversedScore = sign * parseInt(Math.abs(current).toString().split("").reverse().join("") || "0", 10);
    }
    const { error: consumeError } = await supabase.from("uno_cards").insert({
      team_name: teamName,
      card_type: cardType,
      used: true,
      played_at: playedAt,
      session_pin: sessionPin || "",
      round_number: roundNumber ?? null,
    });
    if (consumeError) {
      // The database unique constraint is the final authority across tabs,
      // refreshes and reconnects. Refetch so this handset immediately reflects
      // a card that another client has already spent.
      const { data } = await supabase.from("uno_cards").select("card_type").eq("team_name", teamName).eq("session_pin", sessionPin || "");
      if (data) setUsed([...new Set(data.map(d => d.card_type))]);
      setPlaying(null);
      return;
    }
    if (cardType === "reverse" && sessionPin && reversedScore != null) {
      const result = await setScoreAbsolute(supabase, sessionPin, teamName, reversedScore, {
        eventKey: `reverse:${sessionPin}:${teamName}:${playedAt}`,
      });
      if (result.scoreboardSyncError) console.error("Reverse card: score updated but scoreboard_data sync failed:", result.scoreboardSyncError);
    }
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
    setUsed(prev => [...prev, cardType]);
    setPlaying(null);
  };

  if (compact) {
    // Fable power-card rail: each card echoes the fanned "boost / timeout /
    // reverse" faces from the approved design (gradient face + foil sheen +
    // spent dimming), scaled down to persist under the live question. All the
    // play/lock logic below is unchanged — only presentation is Fable-styled.
    const FABLE: Record<string, { face: string; ink: string; sig: string; cname: string }> = {
      x2:      { face: "linear-gradient(160deg,#4a3505,#171003 70%)", ink: "#FFC533", sig: "⚡", cname: "BOOST" },
      block:   { face: "linear-gradient(160deg,#062b4a,#04101d 70%)", ink: "#38A8FF", sig: "⏸", cname: "TIME-OUT" },
      reverse: { face: "linear-gradient(160deg,#4a0a12,#1a0306 70%)", ink: "#FF3B4E", sig: "↻", cname: "REVERSE" },
    };
    const remaining = CARDS.filter(c => !used.includes(c.type)).length;
    return (
      <div className="fbl" style={{ paddingTop: 4 }}>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          {CARDS.map(card => {
            const isUsed = used.includes(card.type);
            const isLocked = isUsed;
            const isPlaying = playing === card.type;
            const fb = FABLE[card.type] || { face: card.bg, ink: card.color, sig: card.emoji, cname: card.label.toUpperCase() };
            return (
              <button
                key={card.type}
                onClick={() => playCard(card.type)}
                disabled={isLocked || !!playing}
                title={card.desc}
                style={{
                  position: "relative", overflow: "hidden",
                  width: 78, aspectRatio: "2 / 3", borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.28)",
                  background: fb.face, color: fb.ink,
                  cursor: isLocked ? "not-allowed" : "pointer",
                  display: "flex", flexDirection: "column" as const,
                  alignItems: "flex-start", justifyContent: "space-between",
                  padding: "9px 8px",
                  filter: isUsed ? "saturate(0.3) brightness(0.5)" : "none",
                  opacity: 1,
                  boxShadow: isLocked ? "0 6px 18px rgba(5,0,13,0.6)" : "0 10px 26px rgba(5,0,13,0.7), inset 0 0 0 1px rgba(255,255,255,0.08)",
                  transform: isPlaying ? "scale(0.95)" : "scale(1)",
                  transition: "all 0.15s",
                }}
              >
                {!isLocked && (
                  <span style={{ position: "absolute", inset: 0, borderRadius: 12, pointerEvents: "none",
                    background: "linear-gradient(115deg,transparent 30%,rgba(255,255,255,0.14) 45%,transparent 60%)",
                    animation: "fblFoil 5s ease-in-out infinite" }} />
                )}
                <span style={{ position: "relative", font: "800 8px 'Inter'", letterSpacing: "0.2em" }}>{fb.cname}</span>
                <span style={{ position: "relative", fontSize: 22, lineHeight: 1 }}>{isUsed ? "✓" : fb.sig}</span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 8, textAlign: "center", font: "600 10px 'Inter'", color: "#6B5A8E", letterSpacing: "0.14em" }}>
          {`${remaining} OF ${CARDS.length} CARD${remaining === 1 ? "" : "S"} REMAINING TONIGHT · EACH ONCE PER QUIZ`}
        </div>
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
          const isLocked = isUsed;
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
