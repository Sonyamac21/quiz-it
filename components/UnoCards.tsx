"use client";
import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const CARDS = [
  { type: "block",   label: "Block",   emoji: "X",  color: "#3b82f6", bg: "#1e3a8a", desc: "Block all teams for 10 seconds" },
  { type: "reverse", label: "Reverse", emoji: "R",  color: "#ef4444", bg: "#7f1d1d", desc: "Flip the scoreboard" },
  { type: "x2",      label: "x2",      emoji: "2x", color: "#eab308", bg: "#713f12", desc: "Double your points" },
];

function getCardInfo(type: string) {
  return CARDS.find(c => c.type === type);
}

export function UnoPlayerCards({ teamName }: { teamName: string }) {
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
    });
    setUsed(prev => [...prev, cardType]);
    setPlaying(null);
  };

  return (
    <div style={{ padding: "20px", background: "#1a0a2e", borderRadius: 16, border: "1px solid rgba(190,38,193,0.5)" }}>
      <div style={{ fontSize: 13, letterSpacing: 3, color: "#BE26C1", marginBottom: 16, textTransform: "uppercase" as const, fontWeight: 700 }}>
        Your Power Cards
      </div>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
        {CARDS.map(card => {
          const isUsed = used.includes(card.type);
          const isPlaying = playing === card.type;
          return (
            <button
              key={card.type}
              onClick={() => playCard(card.type)}
              disabled={isUsed || !!playing}
              style={{
                width: "100%",
                padding: "18px 20px",
                borderRadius: 14,
                border: "2px solid " + (isUsed ? "rgba(255,255,255,0.1)" : card.color),
                background: isUsed ? "rgba(255,255,255,0.05)" : card.bg,
                color: isUsed ? "rgba(255,255,255,0.3)" : "#fff",
                cursor: isUsed ? "not-allowed" : "pointer",
                display: "flex",
                flexDirection: "row" as const,
                alignItems: "center",
                gap: 16,
                opacity: isUsed ? 0.5 : 1,
                transition: "all 0.2s",
                boxShadow: isUsed ? "none" : "0 4px 20px " + card.color + "55",
                transform: isPlaying ? "scale(0.97)" : "scale(1)",
                textAlign: "left" as const,
              }}
            >
              <span style={{ fontSize: 32, fontWeight: 900, minWidth: 48, textAlign: "center" as const, color: card.color }}>{card.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, marginBottom: 3, color: isUsed ? "rgba(255,255,255,0.3)" : card.color }}>{card.label}</div>
                <div style={{ fontSize: 13, color: isUsed ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.85)", lineHeight: 1.3 }}>
                  {isUsed ? "Already used" : card.desc}
                </div>
              </div>
              {!isUsed && <span style={{ fontSize: 24, color: card.color, opacity: 0.7 }}>›</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function UnoHostPanel() {
  const [cards, setCards] = useState<any[]>([]);
  const [flash, setFlash] = useState<any | null>(null);

  const fetchCards = async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase
      .from("uno_cards")
      .select("*")
      .order("played_at", { ascending: false });
    if (data) setCards(data);
  };

  useEffect(() => {
    fetchCards();
    const supabase = creeSupabaseBrowserClient();
    const channel = supabase
      .channel("uno-cards-host")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "uno_cards" }, (payload) => {
        setCards(prev => [payload.new, ...prev]);
        setFlash(payload.new);
        setTimeout(() => setFlash(null), 4000);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div style={{ background: "#0d0520", borderRadius: 12, border: "1px solid rgba(190,38,193,0.3)", overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(190,38,193,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, letterSpacing: 3, color: "rgba(190,38,193,0.8)", textTransform: "uppercase" as const }}>UNO Cards Played</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{cards.length} played</span>
      </div>
      {flash && (
        <div style={{ padding: "16px", background: (getCardInfo(flash.card_type)?.color || "#BE26C1") + "22", borderBottom: "2px solid " + (getCardInfo(flash.card_type)?.color || "#BE26C1"), display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: getCardInfo(flash.card_type)?.color }}>{flash.team_name} played {getCardInfo(flash.card_type)?.label}!</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{getCardInfo(flash.card_type)?.desc}</div>
          </div>
        </div>
      )}
      {cards.length === 0 ? (
        <div style={{ padding: "24px 16px", textAlign: "center" as const, color: "rgba(255,255,255,0.2)", fontSize: 13 }}>No cards played yet</div>
      ) : (
        <div style={{ maxHeight: 300, overflowY: "auto" as const }}>
          {cards.map((card, i) => {
            const info = getCardInfo(card.card_type);
            return (
              <div key={card.id || i} style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ color: info?.color, fontWeight: 700, fontSize: 13 }}>{info?.label}</span>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}> - {card.team_name}</span>
                </div>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
                  {card.played_at ? new Date(card.played_at).toLocaleTimeString() : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
