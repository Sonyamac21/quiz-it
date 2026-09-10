"use client";
import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const CARDS = [
  { type: "block",   label: "Time-Out", emoji: "⏸",  color: "#60a5fa", bg: "rgba(59,130,246,0.25)", desc: "Freezes all other teams for 10 seconds — activates when the host starts the timer." },
  { type: "reverse", label: "Reverse",  emoji: "↻",  color: "#f87171", bg: "rgba(239,68,68,0.25)",  desc: "Reverses the digits of your score. 19 becomes 91. 34 becomes 43." },
  { type: "x2",      label: "Boost",    emoji: "⚡", color: "#facc15", bg: "rgba(234,179,8,0.2)",   desc: "Doubles your points for every correct answer in the current round." },
];

export function UnoPlayerCards({ teamName, sessionPin, playerToken, roundNumber, compact = false, enabled = true }: { teamName: string; sessionPin?: string; playerToken?: string; roundNumber?: number; compact?: boolean; enabled?: boolean }) {
  const [used, setUsed] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  // A card disappears from the rail entirely - on every screen size, since
  // this one component renders on phone/iPad/tablet alike - the moment it's
  // used, or the moment it genuinely can't be played right now (Reverse
  // outside Rounds 1-2, or Power Cards paused for the round via `enabled`).
  // Previously `enabled` was NOT part of this filter, so a paused round
  // still showed every card, just greyed out and disabled - a visible but
  // untappable card reads as "broken", not "unavailable".
  const visibleCards = CARDS.filter(card => enabled && !used.includes(card.type) && (card.type !== "reverse" || roundNumber === 1 || roundNumber === 2));

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
    if (!enabled || !sessionPin || used.includes(cardType) || playing) return;
    // Reverse can only be played in Rounds 1 and 2 - checked here (not just in the
    // disabled prop below) so a handset that's still showing a stale round
    // number can't sneak a Reverse play through after Round 1 has started.
    if (cardType === "reverse" && (!roundNumber || roundNumber > 2)) {
      setFeedback({ ok: false, text: "Reverse is only available in Rounds 1 and 2." });
      return;
    }
    setFeedback(null);
    setPlaying(cardType);
    const supabase = createSupabaseBrowserClient();
    // Re-check the live round rule at activation time so a handset with a
    // briefly stale realtime view cannot spend a card during a disabled round.
    const { data: sessionRule } = await supabase.from("sessions").select("allow_power_cards").eq("pin", sessionPin).maybeSingle();
    if (sessionRule?.allow_power_cards === false) {
      setFeedback({ ok: false, text: "Power Cards are paused for this round." });
      setPlaying(null);
      return;
    }
    const playedAt = new Date().toISOString();
    // REVERSE: consuming the card and reversing the score now happen in a
    // single atomic database transaction (play_reverse_card RPC - see
    // supabase/migrations/202608270001_atomic_score_functions.sql). This
    // replaces the old sequence of "read score in JS, insert spent-card row,
    // then separately write the reversed score" - which could overwrite a
    // concurrent score change, or spend the card without its effect landing
    // if the later write failed. The RPC reads the CURRENT score and
    // consumes the card in the same transaction, so either both happen or
    // neither does.
    if (cardType === "reverse" && sessionPin) {
      if (!playerToken) {
        setFeedback({ ok: false, text: "Reconnect on the handset that joined this team to use Reverse." });
        setPlaying(null);
        return;
      }
      const { data, error } = await supabase.rpc("play_reverse_card", {
        p_session_pin: sessionPin,
        p_team_name: teamName,
        p_player_token: playerToken,
        p_round_number: roundNumber ?? null,
        p_event_key: `reverse:${sessionPin}:${teamName}:${playedAt}`,
      });
      if (error) {
        console.error("Reverse card failed:", error.message);
        setFeedback({ ok: false, text: "Reverse was not accepted. Please tap again." });
        setPlaying(null);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.applied) {
        // card-already-used / no-score-row / already-applied - refetch so
        // this handset reflects whatever actually happened rather than
        // assuming the card is still available.
        const { data: cards } = await supabase.from("uno_cards").select("card_type").eq("team_name", teamName).eq("session_pin", sessionPin);
        if (cards) setUsed([...new Set(cards.map(d => d.card_type))]);
        const reason = String(row?.reason || "");
        // Surface the raw reason in the console for every unhandled case
        // (e.g. "handset-not-authorised", "session-not-active") instead of
        // only for network errors - a silent "not accepted" message with no
        // trace of WHY made a genuine rejection indistinguishable from a
        // transient blip when reported live.
        if (!["card-already-used", "reverse-only-in-rounds-1-2", "reverse-only-in-round-1", "cards-disabled"].includes(reason)) {
          console.error("Reverse card rejected:", reason || "(no reason returned)");
        }
        setFeedback({ ok: false, text: reason === "card-already-used" ? "Reverse has already been used this quiz." : reason === "reverse-only-in-rounds-1-2" || reason === "reverse-only-in-round-1" ? "Reverse is only available in Rounds 1 and 2." : reason === "cards-disabled" ? "Power Cards are paused for this round." : reason === "handset-not-authorised" ? "This handset isn't recognised for this team - rejoin the quiz on this phone, then try again." : reason === "session-not-active" ? "This quiz session isn't live." : "Reverse was not accepted. Please tap again." });
        setPlaying(null);
        return;
      }
      setUsed(prev => [...prev, cardType]);
      setFeedback({ ok: true, text: `Reverse accepted · score is now ${row.total_points ?? 0}.` });
      setPlaying(null);
      return;
    }
    // Reserve the one shared Time-Out slot before consuming the card. The
    // conditional update is atomic: if two teams tap together, only the first
    // can change an unreserved session row and the other keeps its card.
    if (cardType === "block") {
      const nowIso = new Date().toISOString();
      const { data: reserved, error: reserveError } = await supabase.from("sessions").update({
        block_pending: true,
        block_team: teamName,
        block_until: null,
      }).eq("pin", sessionPin).eq("block_pending", false).or(`block_until.is.null,block_until.lt.${nowIso}`).select("id").maybeSingle();
      if (reserveError || !reserved) {
        setFeedback({ ok: false, text: "Another team already has a Time-Out waiting or active." });
        setPlaying(null);
        return;
      }
    }
    const { error: consumeError } = await supabase.from("uno_cards").insert({
      team_name: teamName,
      card_type: cardType,
      used: true,
      played_at: playedAt,
      session_pin: sessionPin,
      round_number: roundNumber ?? null,
    });
    if (consumeError) {
      if (cardType === "block") {
        await supabase.from("sessions").update({ block_pending: false, block_team: null, block_until: null }).eq("pin", sessionPin).eq("block_team", teamName).eq("block_pending", true);
      }
      // The database unique constraint is the final authority across tabs,
      // refreshes and reconnects. Refetch so this handset immediately reflects
      // a card that another client has already spent.
      const { data } = await supabase.from("uno_cards").select("card_type").eq("team_name", teamName).eq("session_pin", sessionPin);
      if (data) setUsed([...new Set(data.map(d => d.card_type))]);
      setFeedback({ ok: false, text: `${CARDS.find(card => card.type === cardType)?.label || "Card"} was not accepted. Please tap again.` });
      setPlaying(null);
      return;
    }
    setUsed(prev => [...prev, cardType]);
    setFeedback({ ok: true, text: `${CARDS.find(card => card.type === cardType)?.label || "Card"} accepted.` });
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
    const remaining = visibleCards.length;
    return (
      <div className="fbl" style={{ paddingTop: 4, padding: "4px 14px 0" }}>
        <div className="qi-player-card-rail" style={{ display: "flex", gap: 10 }}>
          {visibleCards.map(card => {
            const isUsed = used.includes(card.type);
            const isReverseOutOfRound = card.type === "reverse" && (!roundNumber || roundNumber > 2);
            const isLocked = isUsed || !enabled || isReverseOutOfRound;
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
                  flex: "1 1 0", minWidth: 0, maxWidth: 110, aspectRatio: "2 / 3", borderRadius: 12,
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
          {feedback ? <span role="status" style={{ color: feedback.ok ? "#2EE06E" : "#FF7280", letterSpacing: ".04em" }}>{feedback.text}</span> : enabled ? `${remaining} CARD${remaining === 1 ? "" : "S"} REMAINING · EACH ONCE PER QUIZ` : "POWER CARDS ARE NOT AVAILABLE THIS ROUND"}
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
        {/* Every card still in visibleCards is, by construction, unused,
            round-eligible, and not paused - so there's no "locked" state
            left to render here; a card that can't be played is simply not
            in this list at all. */}
        {visibleCards.map(card => {
          const isPlaying = playing === card.type;
          return (
            <button
              key={card.type}
              onClick={() => playCard(card.type)}
              disabled={!!playing}
              style={{
                width: "100%", padding: "14px 16px", borderRadius: 12,
                border: "2px solid " + card.color,
                background: card.bg,
                color: "#fff",
                cursor: playing ? "not-allowed" : "pointer",
                display: "flex", flexDirection: "row" as const, alignItems: "center", gap: 14,
                opacity: 1, transition: "all 0.2s",
                boxShadow: "0 4px 16px " + card.color + "44",
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
        {visibleCards.length === 0 && (
          <div style={{ fontSize: 12, color: "#8F7AAF", textAlign: "center" as const, padding: "6px 0" }}>
            {enabled ? "No power cards left to play." : "Power Cards are not available this round."}
          </div>
        )}
      </div>
    </div>
  );
}

// Legacy export kept for compatibility
export function UnoHostPanel() { return null; }
