"use client";
import { SpinWheel } from "@/components/SpinWheel";
import { QuizItHeader } from "@/components/quiz-it-header";
import { WheelCelebration } from "@/components/WheelCelebration";
import { useState } from "react";

export default function WheelPage() {
  const [team, setTeam] = useState("");
  const [victorySong, setVictorySong] = useState("");
  const [celebration, setCelebration] = useState<{type:"positive"|"negative"; label:string} | null>(null);

  function handleResult(seg: { label: string; type: string }) {
    const celebType = (seg.type === "place" || seg.type === "bonus") ? "positive" : "negative";
    setCelebration({ type: celebType, label: seg.label });
  }

  return (
    <div style={{ minHeight:"100vh", background:"radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118", color:"#fff", display:"flex", flexDirection:"column" }}>
      <QuizItHeader variant="host" />
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", padding:"24px 16px" }}>
        <div style={{ marginBottom:20, width:"100%", maxWidth:520, display:"flex", gap:12 }}>
          <div style={{ flex:1 }}>
            <label style={{ fontFamily:"'Inter',sans-serif", fontSize:10.5, fontWeight:600, letterSpacing:"0.16em", color:"#6B5A8E", display:"block", marginBottom:7, textTransform:"uppercase" }}>Team Name</label>
            <input value={team} onChange={e => setTeam(e.target.value)} placeholder="Enter team name..." style={{ padding:"11px 14px", borderRadius:14, background:"#150A2E", color:"#fff", border:"1px solid #2E1A52", fontSize:13, fontWeight:600, width:"100%", outline:"none", fontFamily:"'Inter',sans-serif" }} />
          </div>
          <div style={{ flex:1 }}>
            <label style={{ fontFamily:"'Inter',sans-serif", fontSize:10.5, fontWeight:600, letterSpacing:"0.16em", color:"#6B5A8E", display:"block", marginBottom:7, textTransform:"uppercase" }}>Victory Song</label>
            <input value={victorySong} onChange={e => setVictorySong(e.target.value)} placeholder="Song filename..." style={{ padding:"11px 14px", borderRadius:14, background:"#150A2E", color:"#fff", border:"1px solid #2E1A52", fontSize:13, fontWeight:600, width:"100%", outline:"none", fontFamily:"'Inter',sans-serif" }} />
          </div>
        </div>
        <SpinWheel onResult={handleResult} size={420} teamName={team} />
      </div>
      <div style={{ textAlign:"center", padding:"12px", fontFamily:"'Inter',sans-serif", fontSize:11, letterSpacing:"0.05em", color:"#6B5A8E" }}>
        <span style={{ color:"#BE26C1" }}>Quiz-</span>It · Mac Entertainment · by Sonya Mac
      </div>
      {celebration && (
        <WheelCelebration
          teamName={team}
          victorySong={victorySong}
          type={celebration.type}
          resultLabel={celebration.label}
          onDone={() => setCelebration(null)}
        />
      )}
    </div>
  );
}
