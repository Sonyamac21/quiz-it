"use client";
import { useState } from "react";

const ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M"],
];
const NUMBERS = ["1","2","3","4","5","6","7","8","9","0"];

export function AnswerKeypad({ onSubmit, mode = "text" }: { onSubmit: (val: string) => void; mode?: "text" | "number" }) {
  const [value, setValue] = useState("");
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const purple = "#BE26C1";
  const font = "'Bruno Ace SC', sans-serif";

  const keyStyle = {
    flex: 1,
    minWidth: 0,
    padding: "16px 0",
    borderRadius: 8,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "#fff",
    fontSize: 18,
    fontFamily: font,
    cursor: "pointer",
  };

  const addChar = (c: string) => {
    setValue(prev => prev + c);
    setPressedKey(c);
    setTimeout(() => setPressedKey(prev => prev === c ? null : prev), 150);
  };
  const backspace = () => setValue(prev => prev.slice(0, -1));

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
      <div style={{
        padding: "14px 16px", borderRadius: 12,
        background: "rgba(255,255,255,0.06)", border: "1.5px solid " + purple,
        minHeight: 50, display: "flex", alignItems: "center",
        fontSize: 20, fontFamily: font, color: "#fff", letterSpacing: 2,
        wordBreak: "break-word" as const,
      }}>
        {value || <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Tap letters to answer...</span>}
      </div>

      {mode === "number" ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          {NUMBERS.map(n => (
            <button key={n} type="button" onClick={() => addChar(n)} style={{ ...keyStyle, flexBasis: "18%", background: pressedKey === n ? purple : keyStyle.background, transform: pressedKey === n ? "scale(0.92)" : "scale(1)", transition: "all 0.1s" }}>{n}</button>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
          {ROWS.map((row, i) => (
            <div key={i} style={{ display: "flex", gap: 6, justifyContent: "center" }}>
              {row.map(letter => (
                <button key={letter} type="button" onClick={() => addChar(letter)} style={{ ...keyStyle, background: pressedKey === letter ? purple : keyStyle.background, transform: pressedKey === letter ? "scale(0.92)" : "scale(1)", transition: "all 0.1s" }}>{letter}</button>
              ))}
            </div>
          ))}
        </div>
      )}

        {mode === "text" && (
          <button type="button" onClick={() => addChar(" ")}
            style={{ width: "100%", padding: "14px 0", borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 14, fontFamily: font, letterSpacing: 3, cursor: "pointer" }}>
            SPACE
          </button>
        )}

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button type="button" onClick={backspace} disabled={!value}
          style={{ flex: 1, padding: "16px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: value ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 16, fontFamily: font, cursor: value ? "pointer" : "default" }}>
          ⌫ DELETE
        </button>
        <button type="button" onClick={() => value.trim() && onSubmit(value.trim())} disabled={!value.trim()}
          style={{ flex: 2, padding: "16px", borderRadius: 10, background: value.trim() ? purple : "#1a1a2e", color: value.trim() ? "#fff" : "rgba(255,255,255,0.3)", border: "none", fontSize: 17, fontFamily: font, letterSpacing: 2, cursor: value.trim() ? "pointer" : "default" }}>
          SUBMIT
        </button>
      </div>
    </div>
  );
}
