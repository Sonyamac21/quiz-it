"use client";
import { useState } from "react";
import { PairsDisplayBoard, PairsHostView, PairsPlayerBoard } from "@/components/PairsRound";
import { PairRecord, PairsProgress } from "@/lib/quiz/pairs";

function picture(label: string) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#331852"/><circle cx="200" cy="135" r="70" fill="#a22dad"/><text x="200" y="145" text-anchor="middle" font-size="32" fill="white">${label}</text></svg>`)}`;
}
const pairs: PairRecord[] = [["Lock", "Key"], ["Kettle", "Cup"], ["Needle", "Thread"]].map(([a,b], i) => ({ pair_id: `p${i}`, a: { label: a, image_url: picture(a) }, b: { label: b, image_url: picture(b) } }));

export default function Rehearsal() {
  const [view, setView] = useState("host");
  const [count, setCount] = useState(50);
  const [progress, setProgress] = useState<PairsProgress>({});
  const [status, setStatus] = useState("live");
  const teams = Array.from({ length: count }, (_, i) => `Team ${i + 1}`);
  const rows = teams.map((name,i) => ({ name, solved_pair_ids: progress[name]?.solved_pair_ids || pairs.slice(0,i % 4).map(p=>p.pair_id), mistakes: i % 3 }));
  return <>
    <nav style={{ position: "fixed", bottom: 0, left: 0, zIndex: 10000, background: "#fff", color: "#000", padding: 4 }}>{["host","display","phone"].map(name => <button key={name} onClick={()=>setView(name)}>{name}</button>)}<button onClick={()=>setCount(count===50?3:50)}>{count} teams</button></nav>
    {view === "host" && <PairsHostView pairs={pairs} rows={rows} scoreboard={teams.map((team_name,i)=>({team_name,total_points: i===0?-5:100+i}))} fastestTeam="Team 4" status={status} questionIndex={0} questionCount={5} error="" onNext={()=>setStatus(status==="live"?"complete":"live")} />}
    {view === "display" && <div style={{height:"100dvh"}}><PairsDisplayBoard pairs={pairs} progress={Object.fromEntries(rows.map(row=>[row.name,row]))} teamNames={teams} /></div>}
    {view === "phone" && <div style={{width:"100%",maxWidth:390,height:"100dvh",margin:"auto"}}><PairsPlayerBoard pairs={pairs} progress={progress} teamName="Team 1" points={-5+(progress["Team 1"]?.solved_pair_ids.length||0)} onSelect={async()=>{}} onAttempt={async(a,b)=>{
      const correct = a.pair_id===b.pair_id;
      setProgress(p=>({ ...p, "Team 1": { solved_pair_ids: correct ? [...new Set([...(p["Team 1"]?.solved_pair_ids||[]), a.pair_id])] : p["Team 1"]?.solved_pair_ids||[], mistakes: (p["Team 1"]?.mistakes||0)+(correct?0:1) } }));
      return {correct,reason:correct?"ok":"wrong-pair"};
    }} /></div>}
  </>;
}
