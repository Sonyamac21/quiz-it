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
  const purple = "#BE26C1";
  const font = "'Bruno Ace SC', sans-serif";

  const keyStyle = {
    flex: 1,
    minWidth: 0,
    padding: "10px 0",
    borderRadius: 8,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "#fff",
    fontSize: 15,
    fontFamily: font,
    cursor: "pointer",
  };

  const addChar = (c: string) => setValue(prev => prev + c);
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
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
          {NUMBERS.map(n => (
            <button key={n} type="button" onClick={() => addChar(n)} style={{ ...keyStyle, flexBasis: "18%" }}>{n}</button>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
          {ROWS.map((row, i) => (
            <div key={i} style={{ display: "flex", gap: 4, justifyContent: "center" }}>
              {row.map(letter => (
                <button key={letter} type="button" onClick={() => addChar(letter)} style={keyStyle}>{letter}</button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button type="button" onClick={backspace} disabled={!value}
          style={{ flex: 1, padding: "12px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: value ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 14, fontFamily: font, cursor: value ? "pointer" : "default" }}>
          ⌫ DELETE
        </button>
        <button type="button" onClick={() => value.trim() && onSubmit(value.trim())} disabled={!value.trim()}
          style={{ flex: 2, padding: "12px", borderRadius: 10, background: value.trim() ? purple : "#1a1a2e", color: value.trim() ? "#fff" : "rgba(255,255,255,0.3)", border: "none", fontSize: 15, fontFamily: font, letterSpacing: 2, cursor: value.trim() ? "pointer" : "default" }}>
          SUBMIT
        </buon>
      </div>
    </div>
  );
}
