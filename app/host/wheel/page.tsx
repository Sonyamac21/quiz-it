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
    <div style={{ minHeight:"100vh", background:"#080810", color:"#fff", display:"flex", flexDirection:"column" }}>
      <QuizItHeader variant="host" />
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", padding:"24px 16px" }}>
        <div style={{ marginBottom:20, width:"100%", maxWidth:520, display:"flex", gap:12 }}>
          <div style={{ flex:1 }}>
            <label style={{ fontFamily:"'Bruno Ace SC',sans-serif", fontSize:10, letterSpacing:3, color:"rgba(190,38,193,0.6)", display:"block", marginBottom:6 }}>Team Name</label>
            <input value={team} onChange={e => setTeam(e.target.value)} placeholder="Enter team name..." style={{ padding:"10px 16px", borderRadius:10, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.4)", fontSize:15, width:"100%", outline:"none", fontFamily:"'Bruno Ace SC',sans-serif" }} />
          </div>
          <div style={{ flex:1 }}>
            <label style={{ fontFamily:"'Bruno Ace SC',sans-serif", fontSize:10, letterSpacing:3, color:"rgba(190,38,193,0.6)", display:"block", marginBottom:6 }}>Victory Song</label>
            <input value={victorySong} onChange={e => setVictorySong(e.target.value)} placeholder="Song filename..." style={{ padding:"10px 16px", borderRadius:10, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.4)", fontSize:15, width:"100%", outline:"none", fontFamily:"'Bruno Ace SC',sans-serif" }} />
          </div>
        </div>
        <SpinWheel onResult={handleResult} size={420} teamName={team} />
      </div>
      <div style={{ textAlign:"center", padding:"12px", fontFamily:"'Bruno Ace SC',sans-serif", fontSize:8, letterSpacing:2, color:"rgba(190,38,193,0.25)" }}>
        Quiz-It · Mac Entertainment · by Sonya Mac
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
