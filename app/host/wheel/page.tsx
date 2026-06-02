"use client";
import { SpinWheel } from "@/components/SpinWheel";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function WheelPage() {
  const [history, setHistory] = useState<{label: string; team: string; color: string}[]>([]);
  const [team, setTeam] = useState("");

  function handleResult(seg: {label: string; value: number; type: string; color: string}) {
    if (!team.trim()) return;
    setHistory(prev => [{label: seg.label, team, color: seg.color}, ...prev].slice(0, 10));
  }

  return (
    <>
    <img id="me-logo" src="/me-logo.jpg" alt="" style={{display:"none"}} />
    <div style={{ minHeight:"100vh", background:"#000", color:"#fff", padding:"24px", fontFamily:"sans-serif" }}>
      <h1 style={{ color:"#BE26C1", fontSize:28, marginBottom:8 }}>Wheel of Fortune</h1>
      <div style={{ marginBottom:20 }}>
        <label style={{ fontSize:13, color:"#aaa", display:"block", marginBottom:6 }}>Which team is spinning?</label>
        <input value={team} onChange={e => setTeam(e.target.value)} placeholder="Enter team name..." style={{ padding:"8px 12px", borderRadius:8, background:"#222", color:"#fff", border:"1px solid #444", fontSize:15, width:280 }} />
      </div>
      <SpinWheel onResult={handleResult} />
      {history.length > 0 && (
        <div style={{ marginTop:32 }}>
          <h2 style={{ color:"#BE26C1", fontSize:18, marginBottom:12 }}>Recent Spins</h2>
          {history.map((h, i) => (
            <div key={i} style={{ background:"#111", border:"1px solid #333", borderRadius:8, padding:"10px 16px", marginBottom:8, display:"flex", justifyContent:"space-between" }}>
              <span style={{ color:"#fff" }}>{h.team}</span>
              <span style={{ color:h.color, fontWeight:700 }}>{h.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}
