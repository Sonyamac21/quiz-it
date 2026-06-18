"use client";
import { useState } from "react";
import SlotMachine from "@/components/SlotMachine";

type Props = {
  teamName: string;
  victorySong?: string | null;
  onClose: () => void;
};

export function SpinToWinPanel({ teamName, victorySong, onClose }: Props) {
  const [open, setOpen] = useState(true);

  if (!open) return null;

  function handleClose() {
    setOpen(false);
    onClose();
  }

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(5,2,10,0.97)", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <SlotMachine initialTeamName={teamName} initialVictorySong={victorySong || undefined} />
      <button onClick={handleClose} style={{ marginTop: 16, padding: "6px 14px", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer" }}>Close</button>
    </div>
  );
}
