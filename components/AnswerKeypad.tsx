"use client";
import { useState } from "react";
import { ShuffleIcon } from "@/components/icons/HostIcons";

const ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M"],
];
// Calculator order is quicker to scan under pressure than a telephone layout.
const NUMBERS = ["7","8","9","4","5","6","1","2","3","0"];

// Fisher-Yates, kept local rather than pulled from a shared util - this is
// the only place in the app that shuffles a fixed-size row of strings.
function shuffleRow<T>(row: T[]): T[] {
  const arr = [...row];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function AnswerKeypad({ onSubmit, mode = "text", scrambled = false }: { onSubmit: (val: string) => void; mode?: "text" | "number"; scrambled?: boolean }) {
  const [value, setValue] = useState("");
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  // Host-only "mix up their keyboard" tool: each row's keys are shuffled
  // once per mount (the parent already remounts this component with a fresh
  // `key` on every new question, so a lazy useState initializer here gives a
  // layout that's scrambled but stable for the whole question - not
  // re-shuffling itself out from under a team mid-type on every keystroke).
  const [rows] = useState(() => (scrambled ? ROWS.map(shuffleRow) : ROWS));
  const [numbers] = useState(() => (scrambled ? shuffleRow(NUMBERS) : NUMBERS));
  const purple = "#BE26C1";
  const font = "'Inter', sans-serif";

  // Text mode has 5 rows of keys (full A-Z) vs number mode's 1 row, so it needs to
  // scale down on shorter screens (e.g. iPhone SE) to avoid pushing Submit off-screen.
  const isCompact = mode === "text";
  const keyStyle = {
    flex: 1,
    minWidth: 0,
    padding: isCompact ? "clamp(8px, 2.2vh, 24px) 0" : "clamp(14px, 3.4vh, 30px) 0",
    borderRadius: 12,
    background: "rgba(255,255,255,0.14)",
    border: "1.5px solid rgba(255,255,255,0.32)",
    color: "#fff",
    fontSize: isCompact ? "clamp(16px, 3.6vh, 28px)" : "clamp(20px, 4.2vh, 32px)",
    fontWeight: 800 as const,
    fontFamily: font,
    cursor: "pointer",
    touchAction: "manipulation" as const,
    WebkitTapHighlightColor: "transparent",
  };

  const addChar = (c: string) => {
    setValue(prev => prev + c);
    setPressedKey(c);
    setTimeout(() => setPressedKey(prev => (prev === c ? null : prev)), 150);
  };
  const backspace = () => setValue(prev => prev.slice(0, -1));

  return (
    <div className="qi-player-keypad" style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
      {scrambled && (
        <div style={{ padding: "6px 10px", borderRadius: 10, background: "rgba(255,59,78,0.16)", border: "1px solid rgba(255,59,78,0.4)", color: "#FF3B4E", fontSize: 11, fontWeight: 700, fontFamily: font, textAlign: "center" as const, letterSpacing: 0.4, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <ShuffleIcon size={12} /> The host has scrambled your keyboard this question
        </div>
      )}
      <div className="qi-player-keypad__value" aria-live="polite" style={{
        padding: isCompact ? "10px 14px" : "14px 16px", borderRadius: 12,
        background: "rgba(255,255,255,0.06)", border: "1.5px solid " + purple,
        minHeight: isCompact ? 52 : 66, display: "flex", alignItems: "center",
        fontSize: isCompact ? 26 : 32, fontWeight: 800, fontFamily: font, color: "#fff", letterSpacing: 1,
        wordBreak: "break-word" as const,
      }}>
        {value || <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 17, fontWeight: 600 }}>{mode === "number" ? "Tap numbers to answer…" : "Tap letters to answer…"}</span>}
      </div>

      {mode === "number" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
          {numbers.map(n => (
            <button key={n} type="button" className="qi-player-keypad__key" onClick={() => addChar(n)} aria-label={`Enter ${n}`}
              style={{ ...keyStyle, gridColumn: n === "0" ? "2" : undefined, background: pressedKey === n ? purple : keyStyle.background, transform: pressedKey === n ? "scale(0.92)" : "scale(1)", transition: "all 0.1s" }}>
              {n}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 5 }}>
          {rows.map((row, i) => (
            <div key={i} style={{ display: "flex", gap: 5, justifyContent: "center" }}>
              {row.map(letter => (
                <button key={letter} type="button" className="qi-player-keypad__key" onClick={() => addChar(letter)} aria-label={`Enter ${letter}`}
                  style={{ ...keyStyle, background: pressedKey === letter ? purple : keyStyle.background, transform: pressedKey === letter ? "scale(0.92)" : "scale(1)", transition: "all 0.1s" }}>
                  {letter}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {mode === "text" && (
        <button type="button" className="qi-player-keypad__space" onClick={() => addChar(" ")}
          style={{
            width: "100%", padding: "clamp(8px, 1.6vh, 16px) 0", borderRadius: 12,
            background: pressedKey === " " ? purple : "rgba(190,38,193,0.18)",
            border: "1.5px solid " + purple,
            color: "#fff", fontSize: 16, fontWeight: 800 as const, fontFamily: font, letterSpacing: 4,
            cursor: "pointer", touchAction: "manipulation" as const, WebkitTapHighlightColor: "transparent",
            transform: pressedKey === " " ? "scale(0.97)" : "scale(1)", transition: "all 0.1s",
          }}>
          {"\u2423"} SPACE
        </button>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button type="button" className="qi-player-keypad__delete" onClick={backspace} disabled={!value}
          style={{ flex: 1, padding: isCompact ? "clamp(10px, 2.2vh, 22px)" : "22px", borderRadius: 10, background: "rgba(255,255,255,0.1)", border: "1.5px solid rgba(255,255,255,0.28)", color: value ? "#fff" : "rgba(255,255,255,0.35)", fontSize: 17, fontWeight: 800 as const, fontFamily: font, cursor: value ? "pointer" : "default", touchAction: "manipulation" as const, WebkitTapHighlightColor: "transparent" }}>
          {"\u232B"} DELETE
        </button>
        <button type="button" className="qi-player-keypad__submit" onClick={() => value.trim() && onSubmit(value.trim())} disabled={!value.trim()}
          style={{ flex: 2, padding: isCompact ? "clamp(12px, 2.6vh, 26px)" : "26px", borderRadius: 12, background: value.trim() ? purple : "#150A2E", color: value.trim() ? "#fff" : "rgba(255,255,255,0.3)", border: value.trim() ? "1px solid #D94FDC" : "1px solid #2E1A52", fontSize: 22, fontWeight: 800, fontFamily: font, letterSpacing: 2, boxShadow: value.trim() ? "0 0 20px rgba(190,38,193,0.35)" : "none", cursor: value.trim() ? "pointer" : "default", touchAction: "manipulation" as const, WebkitTapHighlightColor: "transparent" }}>
          LOCK IT IN
        </button>
      </div>
    </div>
  );
}
