"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { SpinWheel, buildTeamSegments } from "@/components/SpinWheel";

type Question = {
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_answer: string;
  explanation?: string;
};
type Score = { team_name: string; total_points: number; };
type Phase = "waiting" | "round_start" | "question" | "answer" | "celebration" | "round_end" | "scoreboard" | "quiz_end" | "hard_deck" | "intermission";

function playSound(file: string, volume = 1.0) {
  try { const a = new Audio("/sounds/" + file); a.volume = volume; a.play().catch(() => {}); return a; } catch { return null; }
}

function DisplayScreenInner() {
  const searchParams = useSearchParams();
  const autoConnectedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [sessionPin, setSessionPin] = useState("");
  const [fastestTeam, setFastestTeam] = useState<string|null>(null);
  const [fastestSong, setFastestSong] = useState<string|null>(null);
  const [hardDeckTeam, setHardDeckTeam] = useState<string|null>(null);
  const [hardDeckCards, setHardDeckCards] = useState<{ rank: number; suit: string }[]>([]);
  const [hardDeckStatus, setHardDeckStatus] = useState<string>("idle");
  const [hardDeckPotential, setHardDeckPotential] = useState(0);
  const [hardDeckWheelTarget, setHardDeckWheelTarget] = useState<number|null>(null);
  const [teams, setTeams] = useState<{ team_name: string }[]>([]);
  const [flash, setFlash] = useState(false);
  const [roundName, setRoundName] = useState("");
  const [roundNumber, setRoundNumber] = useState(1);
  const [scoreboardData, setScoreboardData] = useState<Score[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [quizEndScores, setQuizEndScores] = useState<Score[]>([]);
  const [trophyVisible, setTrophyVisible] = useState(false);
  const [intermissionOffers, setIntermissionOffers] = useState("");
  const [intermissionWhatsapp, setIntermissionWhatsapp] = useState("");
  const [intermissionOtherQuizzes, setIntermissionOtherQuizzes] = useState("");
  const victorySongRef = useRef<HTMLAudioElement|null>(null);
  const clappingRef = useRef<HTMLAudioElement|null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const flashRef = useRef<ReturnType<typeof setInterval>|null>(null);

  const font = "'Bruno Ace SC', sans-serif";
  const purple = "#BE26C1";
  const bg = "#080810";

  // Spacebar for quiz_end reveal
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      e.preventDefault();
      if (phase === "quiz_end" && !trophyVisible) {
        handleRevealNext();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [phase, revealedCount, quizEndScores, trophyVisible]);

  // Track picture sub-phase: "image_only" -> "question_visible"
  const [pictureSubPhase, setPictureSubPhase] = useState<"image_only"|"question_visible">("image_only");
  const [answeredTeams, setAnsweredTeams] = useState<string[]>([]);
  const [showAnsweredTeams, setShowAnsweredTeams] = useState(false);

  function handleRevealNext() {
    const sorted = [...quizEndScores].sort((a,b) => a.total_points - b.total_points);
    const nextCount = revealedCount + 1;
    setRevealedCount(nextCount);
    const isFirst = nextCount === sorted.length;
    playSound("crowd-cheer.mp3", 0.7);
    if (isFirst) {
      setTimeout(() => playSound("airhorn.mp3", 1.0), 800);
      const winner = sorted[sorted.length - 1];
      if (winner) {
        // find victory song - stored in quizEndScores if we add it, for now just cheer
      }
      setTimeout(() => setTrophyVisible(true), 3000);
    }
  }

  function stopClapping() {
    if (clappingRef.current) { clappingRef.current.pause(); clappingRef.current.currentTime = 0; clappingRef.current = null; }
  }

  function applySession(data: Record<string, unknown>) {
    const newPhase = (data.phase as Phase) || "waiting";
    setPhase(newPhase);
    setQuestion((data.current_question as Question) || null);
    setQuestionIndex((data.current_question_index as number) ?? 0);
    setRoundName((data.round_name as string) || "");
    setRoundNumber((data.round_number as number) || 1);
    const ft = (data.fastest_team as string) || null;
    const fs = (data.fastest_song as string) || null;
    setFastestTeam(ft);
    setFastestSong(fs);
    setHardDeckTeam((data.hard_deck_team as string) || null);
    setHardDeckCards((data.hard_deck_cards as { rank: number; suit: string }[]) || []);
    setHardDeckStatus((data.hard_deck_status as string) || "idle");
    setHardDeckPotential((data.hard_deck_potential as number) || 0);
    setHardDeckWheelTarget((data.hard_deck_wheel_target as number) ?? null);
    setIntermissionOffers((data.intermission_offers as string) || "");
    setIntermissionWhatsapp((data.intermission_whatsapp as string) || "");
    setIntermissionOtherQuizzes((data.intermission_other_quizzes as string) || "");

    if (newPhase === "scoreboard") {
      setScoreboardData((data.scoreboard_data as Score[]) || []);
    }

    // Reset picture sub-phase when new question arrives
    if (newPhase === "question") {
      const q = data.current_question as {question_type?: string} | null;
      if (q?.question_type === "picture") {
        setPictureSubPhase("image_only");
      }
      setShowAnsweredTeams(false);
      setAnsweredTeams([]);
    }

    // Show answered teams after timer ends
    if (newPhase === "answer") {
      const teams = (data.answered_teams as string[]) || [];
      setAnsweredTeams(teams);
      setShowAnsweredTeams(true);
    }

    // Picture sub-phase: advance from image_only to question_visible
    if ((data as any).picture_sub_phase === "question_visible") {
      setPictureSubPhase("question_visible");
    }

    if (newPhase === "quiz_end") {
      const scores = (data.scoreboard_data as Score[]) || [];
      setQuizEndScores(scores);
      setRevealedCount(0);
      setTrophyVisible(false);
      stopClapping();
      const clap = new Audio("/sounds/clapping-scores.mp3");
      clap.volume = 0.5;
      clap.loop = true;
      clap.play().catch(() => {});
      clappingRef.current = clap;
    }

    if (newPhase === "celebration" && ft && fs) {
      if (victorySongRef.current) { victorySongRef.current.pause(); victorySongRef.current = null; }
      const audio = new Audio("/sounds/" + encodeURIComponent(fs) + ".mp3");
      audio.volume = 0.8;
      audio.play().catch(() => {});
      victorySongRef.current = audio;
      if (flashRef.current) clearInterval(flashRef.current);
      let f = false;
      flashRef.current = setInterval(() => { f = !f; setFlash(f); }, 500);
      setTimeout(() => { if (flashRef.current) clearInterval(flashRef.current); }, 15000);
    } else {
      setFlash(false);
    }

    if (data.timer_started_at && data.timer_duration) {
      const started = new Date(data.timer_started_at as string).getTime();
      const duration = data.timer_duration as number;
      const elapsed = Math.floor((Date.now() - started) / 1000);
      const remaining = Math.max(0, duration - elapsed);
      startCountdown(remaining);
    }
  }

  function startCountdown(seconds: number) {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(seconds);
    if (seconds <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function connect() {
    if (pinInput.length !== 4) return;
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("sessions").select("*").eq("pin", pinInput).single();
    if (!data) { alert("Session not found"); return; }
    setSessionPin(pinInput);
    setConnected(true);
    applySession(data);
    const { data: teamData } = await supabase.from("teams").select("*").eq("session_pin", pinInput).order("created_at", { ascending: true });
    if (teamData) setTeams(teamData);
    supabase.channel("display-" + pinInput)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: "pin=eq." + pinInput }, (payload) => {
        applySession(payload.new as Record<string, unknown>);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "teams", filter: "session_pin=eq." + pinInput }, (payload) => {
        setTeams(prev => [...prev, payload.new as { team_name: string }]);
      })
      .subscribe();
  }

  useEffect(() => {
    const pinFromUrl = searchParams.get("pin");
    if (pinFromUrl && pinFromUrl.length === 4 && !autoConnectedRef.current) {
      autoConnectedRef.current = true;
      setPinInput(pinFromUrl);
      const supabase = createSupabaseBrowserClient();
      supabase.from("sessions").select("*").eq("pin", pinFromUrl).single().then(({ data }) => {
        if (!data) return;
        setSessionPin(pinFromUrl);
        setConnected(true);
        applySession(data);
        supabase.from("teams").select("*").eq("session_pin", pinFromUrl).order("created_at", { ascending: true }).then(({ data: teamData }) => {
          if (teamData) setTeams(teamData);
        });
        supabase.channel("display-" + pinFromUrl)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: "pin=eq." + pinFromUrl }, (payload) => {
            applySession(payload.new as Record<string, unknown>);
          })
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "teams", filter: "session_pin=eq." + pinFromUrl }, (payload) => {
            setTeams(prev => [...prev, payload.new as { team_name: string }]);
          })
          .subscribe();
      });
    }
  }, [searchParams]);
  if (!connected) {
    return (
      <div style={{ minHeight:"100vh", background:bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:font }}>
        <div style={{ background:"rgba(45,10,94,0.7)", border:"2px solid "+purple, borderRadius:20, padding:48, textAlign:"center", width:380 }}>
          <div style={{ fontSize:30, fontWeight:700, color:purple, letterSpacing:4, marginBottom:8 }}>Display Screen</div>
          <div style={{ fontSize:18, color:"rgba(255,255,255,0.5)", marginBottom:28 }}>Enter session PIN to connect</div>
          <input value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g,"").slice(0,4))}
            onKeyDown={e => e.key==="Enter" && connect()} placeholder="PIN" maxLength={4}
            style={{ width:"100%", padding:"16px", borderRadius:12, background:"rgba(255,255,255,0.1)", color:"#fff", border:"2px solid rgba(190,38,193,0.6)", fontSize:40, fontFamily:"monospace", textAlign:"center", letterSpacing:12, outline:"none", marginBottom:16, boxSizing:"border-box" }} />
          <button onClick={connect} disabled={pinInput.length!==4}
            style={{ width:"100%", padding:14, borderRadius:12, background:pinInput.length===4?purple:"#333", color:"#fff", border:"none", fontSize:20, letterSpacing:3, cursor:pinInput.length===4?"pointer":"not-allowed", fontFamily:font }}>
            Connect
          </button>
        </div>
      </div>
    );
  }

  // WAITING / HOLDING SCREEN
  // THE HARD DECK
  if (phase === "hard_deck") {
    const rankLabels: Record<number,string> = { 1:"A", 11:"J", 12:"Q", 13:"K" };
    const rankLabel = (r: number) => rankLabels[r] || String(r);
    return (
      <div style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:font, gap:32 }}>
        <div style={{ fontSize:60, fontWeight:800, color:purple, letterSpacing:6, textShadow:"0 0 40px rgba(190,38,193,0.6)" }}>THE HARD DECK</div>
        {hardDeckStatus === "wheel" && teams.length > 0 && hardDeckWheelTarget !== null && (
          <SpinWheel
            segments={buildTeamSegments(teams.map(t => t.team_name))}
            onResult={() => {}}
            size={420}
            forceResultIndex={hardDeckWheelTarget}
            autoSpin={true}
          />
        )}
        {hardDeckTeam && (
          <div style={{ fontSize:38, color:"#fff", fontWeight:700, letterSpacing:2 }}>{hardDeckTeam}</div>
        )}
        {hardDeckCards.length > 0 && (
          <div style={{ display:"flex", gap:24 }}>
            {hardDeckCards.map((c, i) => (
              <div key={i} style={{ width:140, height:200, borderRadius:18, background:"#fff", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontSize:48, fontWeight:900, color:(c.suit==="♥"||c.suit==="♦")?"#dc2626":"#111", boxShadow:"0 8px 30px rgba(0,0,0,0.5)" }}>
                <div>{rankLabel(c.rank)}</div>
                <div style={{ fontSize:60 }}>{c.suit}</div>
              </div>
            ))}
          </div>
        )}
        {hardDeckPotential > 0 && (hardDeckStatus === "decision" || hardDeckStatus === "won") && (
          <div style={{ fontSize:32, color:"#facc15", fontWeight:700 }}>{hardDeckPotential} POINTS</div>
        )}
        {hardDeckStatus === "decision" && (
          <div style={{ fontSize:22, color:"rgba(255,255,255,0.6)" }}>Stick or Gamble?</div>
        )}
        {hardDeckStatus === "awaiting_guess" && hardDeckCards.length > 0 && (
          <div style={{ fontSize:22, color:"rgba(255,255,255,0.6)" }}>Higher or Lower?</div>
        )}
        {hardDeckStatus === "won" && (
          <div style={{ fontSize:44, color:"#22c55e", fontWeight:800 }}>WINNER! 🎉</div>
        )}
        {hardDeckStatus === "lost" && (
          <div style={{ fontSize:44, color:"#ef4444", fontWeight:800 }}>BUSTED!</div>
        )}
      </div>
    );
  }

  if (phase === "waiting" || phase === "round_start" || phase === "round_end") {
    return (
      <div style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:font }}>
        <img src="/me-logo.jpg" alt="ME" style={{ width:80, height:80, borderRadius:"50%", marginBottom:24, border:"3px solid "+purple }} />
        <div style={{ fontSize:65, fontWeight:800, color:purple, letterSpacing:6, marginBottom:8, textShadow:"0 0 40px rgba(190,38,193,0.6)" }}>Quiz-It</div>
        <div style={{ fontSize:20, color:"rgba(255,255,255,0.4)", letterSpacing:3, marginBottom:48 }}>powered by Mac Entertainment</div>
        <div style={{ padding:"32px 64px", borderRadius:20, background:"rgba(255,255,255,0.05)", border:"2px solid rgba(190,38,193,0.4)", textAlign:"center" }}>
          <div style={{ fontSize:22, color:"rgba(255,255,255,0.5)", letterSpacing:4, marginBottom:12 }}>JOIN AT</div>
          <div style={{ fontSize:35, color:"#fff", fontWeight:700, letterSpacing:2, marginBottom:24 }}>quiz-it-six.vercel.app/join</div>
          <div style={{ fontSize:20, color:"rgba(255,255,255,0.4)", letterSpacing:3, marginBottom:12 }}>ENTER PIN</div>
          <div style={{ fontSize:150, fontWeight:900, color:"#fff", letterSpacing:24, fontFamily:"monospace", lineHeight:1, textShadow:"0 0 60px rgba(190,38,193,0.8)" }}>{sessionPin}</div>
        </div>
      </div>
    );
  }

  // INTERMISSION
  if (phase === "intermission") {
    const hasContent = intermissionOffers || intermissionWhatsapp || intermissionOtherQuizzes;
    return (
      <div style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:font, padding:48 }}>
        <div style={{ fontSize:42, fontWeight:800, color:purple, letterSpacing:5, marginBottom:8 }}>INTERMISSION</div>
        <div style={{ fontSize:18, color:"rgba(255,255,255,0.4)", letterSpacing:2, marginBottom:40 }}>Next round starting soon...</div>
        {!hasContent ? (
          <img src="/me-logo.jpg" alt="ME" style={{ width:100, height:100, borderRadius:"50%", border:"3px solid "+purple }} />
        ) : (
          <div style={{ display:"flex", gap:48, alignItems:"flex-start", maxWidth:"90vw" }}>
            <div style={{ display:"flex", flexDirection:"column", gap:24, maxWidth:500 }}>
              {intermissionOffers && (
                <div style={{ padding:"24px 28px", borderRadius:16, background:"rgba(255,255,255,0.05)", border:"2px solid rgba(190,38,193,0.4)" }}>
                  <div style={{ fontSize:14, color:purple, letterSpacing:3, marginBottom:10 }}>TONIGHT'S OFFERS</div>
                  <div style={{ fontSize:24, color:"#fff", lineHeight:1.4 }}>{intermissionOffers}</div>
                </div>
              )}
              {intermissionOtherQuizzes && (
                <div style={{ padding:"24px 28px", borderRadius:16, background:"rgba(255,255,255,0.05)", border:"2px solid rgba(190,38,193,0.4)" }}>
                  <div style={{ fontSize:14, color:purple, letterSpacing:3, marginBottom:10 }}>MORE QUIZ NIGHTS</div>
                  <div style={{ fontSize:22, color:"#fff", lineHeight:1.4 }}>{intermissionOtherQuizzes}</div>
                </div>
              )}
            </div>
            {intermissionWhatsapp && (
              <div style={{ padding:"24px 28px", borderRadius:16, background:"rgba(255,255,255,0.05)", border:"2px solid rgba(190,38,193,0.4)", textAlign:"center" }}>
                <div style={{ fontSize:14, color:purple, letterSpacing:3, marginBottom:14 }}>JOIN OUR WHATSAPP</div>
                <img src={"https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(intermissionWhatsapp)} alt="WhatsApp QR" style={{ width:220, height:220, borderRadius:12, background:"#fff", padding:8 }} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  // SCOREBOARD
  if (phase === "scoreboard") {
    const sorted = [...scoreboardData].sort((a,b) => b.total_points - a.total_points);
    return (
      <div style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", padding:"48px 80px", fontFamily:font, color:"#fff" }}>
        <div style={{ fontSize:45, fontWeight:800, color:purple, letterSpacing:4, marginBottom:40, textAlign:"center", textShadow:"0 0 30px rgba(190,38,193,0.5)" }}>SCOREBOARD</div>
        {sorted.map((s,i) => (
          <div key={s.team_name} style={{ display:"flex", alignItems:"center", gap:20, padding:"16px 24px", borderRadius:16, background:i===0?"rgba(255,215,0,0.1)":i===1?"rgba(192,192,192,0.08)":i===2?"rgba(205,127,50,0.08)":"rgba(255,255,255,0.04)", border:"2px solid "+(i===0?"rgba(255,215,0,0.4)":i===1?"rgba(192,192,192,0.3)":i===2?"rgba(205,127,50,0.3)":"rgba(255,255,255,0.08)"), marginBottom:12 }}>
            <span style={{ fontSize:40, fontWeight:900, color:i===0?"gold":i===1?"silver":i===2?"#cd7f32":"rgba(255,255,255,0.3)", minWidth:48 }}>{i+1}</span>
            <span style={{ fontSize:35, fontWeight:700, flex:1 }}>{s.team_name}</span>
            <span style={{ fontSize:45, fontWeight:900, color:purple }}>{s.total_points}</span>
          </div>
        ))}
        <div style={{ marginTop:32, textAlign:"center", fontSize:18, color:"rgba(255,255,255,0.2)", letterSpacing:3 }}>Quiz-It powered by Mac Entertainment</div>
      </div>
    );
  }

  // QUIZ END — LEADERBOARD REVEAL
  if (phase === "quiz_end") {
    const sorted = [...quizEndScores].sort((a,b) => a.total_points - b.total_points);
    const revealed = sorted.slice(0, revealedCount);
    const top3 = [...quizEndScores].sort((a,b) => b.total_points - a.total_points).slice(0,3);

    if (trophyVisible) {
      return (
        <div style={{ minHeight:"100vh", background:"linear-gradient(1deg, #0a0020 0%, #1a003a 50%, #0a0020 100%)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:font, overflow:"hidden", position:"relative" }}>
          {/* Stars background */}
          <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at center, rgba(190,38,193,0.15) 0%, transparent 70%)" }} />

          <div style={{ fontSize:22, color:"rgba(255,255,255,0.4)", letterSpacing:6, marginBottom:48, zIndex:1 }}>FINAL RESULTS</div>

          {/* Trophy podium */}
          <div style={{ display:"flex", alignItems:"flex-end", gap:24, marginBottom:48, zIndex:1 }}>
            {/* 2nd place */}
            {top3[1] && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", animation:"slideUp 0.8s ease-out 0.3s both" }}>
                <div style={{ fontSize:60, marginBottom:8 }}>🥈</div>
                <div style={{ padding:"16px 24px", borderRadius:16, background:"linear-gradient(180deg, rgba(1,192,192,0.2) 0%, rgba(192,192,192,0.05) 100%)", border:"2px solid rgba(192,192,192,0.5)", textAlign:"center", minWidth:180 }}>
                  <div style={{ fontSize:18, color:"silver", letterSpacing:3, marginBottom:8 }}>2ND PLACE</div>
                  <div style={{ fontSize:28, fontWeight:800, color:"#fff", marginBottom:4 }}>{top3[1].team_name}</div>
                  <div style={{ fontSize:35, fontWeight:900, color:"silver" }}>{top3[1].total_points}</div>
                </div>
                <div style={{ width:"100%", height:80, background:"linear-gradient(180deg, rgba(192,192,192,0.3) 0%, rgba(192,192,192,0.1) 100%)", borderRadius:"8px 8px 0 0", border:"1px solid rgba(192,192,192,0.3)", borderBottom:"none" }} />
              </div>
            )}
            {/* 1st place */}
            {top3[0] && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", animation:"slideUp 0.8s ease-out 0s both" }}>
                <div style={{ fontSize:80, marginBottom:8, filter:"drop-shadow(0 0 20px gold)" }}>🥇</div>
                <div style={{ padding:"20px 28px", borderRadius:16, background:"linear-gradient(180deg, rgba(255,215,0,0.25) 0%, rgba(255,215,0,0.05) 100%)", border:"2px solid rgba(255,215,0,0.7)", textAlign:"center", minWidth:220, boxShadow:"0 0 40px rgba(255,215,0,0.3)" }}>
                  <div style={{ fontSize:18, color:"gold", letterSpacing:3, marginBottom:8 }}>1ST PLACE</div>
                  <div style={{ fontSize:32, fontWeight:800, color:"#fff", marginBottom:4 }}>{top3[0].team_name}</div>
                  <div style={{ fontSize:45, fontWeight:900, color:"gold" }}>{top3[0].total_points}</div>
                </div>
                <div style={{ width:"100%", height:120, background:"linear-gradient(180deg, rgba(255,215,0,0.4) 0%, rgba(255,215,0,0.1) 100%)", borderRadius:"8px 8px 0 0", border:"1px solid rgba(255,215,0,0.4)", borderBottom:"none" }} />
              </div>
            )}
            {/* 3rd place */}
            {top3[2] && (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", animation:"slideUp 0.8s ease-out 0.5s both" }}>
                <div style={{ fontSize:60, marginBottom:8 }}>🥉</div>
                <div style={{ padding:"16px 24px", borderRadius:16, background:"linear-gradient(180deg, rgba(205,127,50,0.2) 0%, rgba(205,127,50,0.05) 100%)", border:"2px solid rgba(205,127,50,0.5)", textAlign:"center", minWidth:180 }}>
                  <div style={{ fontSize:18, color:"#cd7f32", letterSpacing:3, marginBottom:8 }}>3RD PLACE</div>
                  <div style={{ fontSize:28, fontWeight:800, color:"#fff", marginBottom:4 }}>{top3[2].team_name}</div>
                  <div style={{ fontSize:35, fontWeight:900, color:"#cd7f32" }}>{top3[2].total_points}</div>
                </div>
                <div style={{ width:"100%", height:50, background:"linear-gradient(180deg, rgba(205,127,50,0.3) 0%, rgba(205,127,50,0.1) 100%)", borderRadius:"8px 8px 0 0", border:"1px solid rgba(205,127,50,0.3)", borderBottom:"none" }} />
              </div>
            )}
          </div>

          {/* Quiz-It logo */}
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", zIndex:1 }}>
            <img src="/me-logo.jpg" alt="ME" style={{ width:48, height:48, borderRadius:"50%", border:"2px solid "+purple, marginBottom:8 }} />
            <div style={{ fontSize:35, fontWeight:800, color:purple, letterSpacing:4, textShadow:"0 0 20px rgba(190,38,193,0.6)" }}>Quiz-It</div>
            <div style={{ fontSize:15, color:"rgba(255,255,255,0.3)", letterSpacing:3, marginTop:4 }}>powered by Mac Entertainment by Sonya Mac</div>
          </div>

          <style>{`
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(60px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      );
    }

    // Reveal in progress
    return (
      <div style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:font, padding:"48px 80px" }}>
        <div style={{ fontSize:22, color:"rgba(255,255,255,0.4)", letterSpacing:6, marginBottom:48 }}>FINAL LEADERBOARD</div>
        <div style={{ width:"100%", maxWidth:700 }}>
          {revealed.map((s, i) => {
            const pos = sorted.length - i;
            const isTop = pos <= 3;
            const medal = pos===1?"gold":pos===2?"silver":pos===3?"#cd7f32":null;
            return (
              <div key={s.team_name} style={{ display:"flex", alignItems:"center", gap:20, padding:"20px 28px", borderRadius:16,
                background:medal?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.04)",
                border:"2px solid "+(medal||"rgba(255,255,255,0.1)"),
                marginBottom:12, animation:"fadeSlide 0.5s ease-out both" }}>
                <span style={{ fontSize:35, fontWeight:900, color:medal||"rgba(255,255,255,0.3)", minWidth:40 }}>{pos}</span>
                <span style={{ fontSize:32, fontWeight:700, flex:1, color:"#fff" }}>{s.team_name}</span>
                <span style={{ fontSize:40, fontWeight:900, color:medal||purple }}>{s.total_points}</span>
              </div>
            );
          })}
          {revealedCount === 0 && (
            <div style={{ textAlign:"center", color:"rgba(255,255,255,0.2)", fontSize:22, letterSpacing:3 }}>Press SPACE to reveal results...</div>
          )}
        </div>
        <div style={{ marginTop:48, fontSize:15, color:"rgba(255,255,255,0.2)", letterSpacing:3 }}>Quiz-It powered by Mac Entertainment</div>
        <style>{`
          @keyframes fadeSlide {
            from { opacity: 0; transform: translateX(-30px); }
            to { opacity: 1; transform: translateX(0); }
          }
        `}</style>
      </div>
    );
  }

  // CELEBRATION
  if (phase === "celebration") {
    return (
      <div style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:font }}>
        {fastestTeam ? (
          <div style={{ fontSize:"clamp(80px,12vw,180px)", fontWeight:900, letterSpacing:4, textAlign:"center", padding:"0 60px", color:flash?"#fff":purple, textShadow:flash?"0 0 80px rgba(190,38,193,1), 0 0 160px rgba(190,38,193,0.6)":"0 0 40px rgba(190,38,193,0.3)", transition:"color 0.3s, text-shadow 0.3s" }}>{fastestTeam}</div>
        ) : (
          <div style={{ fontSize:60, color:"rgba(255,255,255,0.3)", fontFamily:font }}>No correct answers</div>
        )}
        {fastestSong && <div style={{ marginTop:32, fontSize:25, color:"rgba(255,255,255,0.25)", letterSpacing:3, fontFamily:font }}>{fastestSong.replace(/\s*SQS\s*$/i,"").replace(/[-_]+$/,"").replace(/[-_]/g," ").trim()}</div>}
      </div>
    );
  }

  // ANSWER REVEAL
  if (phase === "answer" && question) {
    const options = [{ key:"A", text:question.option_a },{ key:"B", text:question.option_b },{ key:"C", text:question.option_c },{ key:"D", text:question.option_d }].filter(o => o.text);
    const isMulti = question.question_type === "multiple_choice";
    const correctText = isMulti ? (options.find(o => o.key.toLowerCase()===question.correct_answer.toLowerCase())?.text || question.correct_answer) : question.correct_answer;
    return (
      <div style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", padding:"48px 80px", fontFamily:font, color:"#fff" }}>
        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:32 }}>
          <div style={{ fontSize:16, letterSpacing:4, color:"rgba(255,255,255,0.3)" }}>Q{questionIndex+1}</div>
          <div style={{ padding:"4px 16px", borderRadius:999, background:"rgba(34,197,94,0.2)", border:"1px solid rgba(34,197,94,0.5)", fontSize:16, color:"#22c55e", letterSpacing:2 }}>ANSWER REVEALED</div>
          <div style={{ flex:1 }} />
          <div style={{ fontSize:18, color:"rgba(255,255,255,0.3)", letterSpacing:2 }}>Quiz-It</div>
        </div>
        <div style={{ fontSize:50, fontWeight:700, lineHeight:1.35, marginBottom:40, maxWidth:"85%" }}>{question.question_text.replace(/^Play this track:\s*/i, "").replace(/^Show teams this image:\s*/i, "")}</div>
        {isMulti && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:32 }}>
            {options.map(opt => {
              const isCorrect = opt.key.toLowerCase()===question.correct_answer.toLowerCase();
              return (
                <div key={opt.key} style={{ padding:"20px 28px", borderRadius:16, background:isCorrect?"rgba(34,197,94,0.2)":"rgba(255,255,255,0.05)", border:"2px solid "+(isCorrect?"rgba(34,197,94,0.7)":"rgba(255,255,255,0.1)"), fontSize:30, display:"flex", alignItems:"center", gap:14 }}>
                  <span style={{ color:purple, fontWeight:800, fontSize:28 }}>{opt.key}.</span>
                  <span style={{ color:isCorrect?"#22c55e":"#fff", fontWeight:isCorrect?700:400 }}>{opt.text}</span>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ padding:"24px 32px", borderRadius:16, background:"rgba(34,197,94,0.15)", border:"2px solid rgba(34,197,94,0.5)", maxWidth:600 }}>
          <div style={{ fontSize:16, color:"rgba(34,197,94,0.7)", letterSpacing:3, marginBottom:8 }}>CORRECT ANSWER</div>
          <div style={{ fontSize:45, fontWeight:800, color:"#22c55e" }}>{correctText}</div>
          {question.explanation && <div style={{ fontSize:20, color:"rgba(255,255,255,0.5)", marginTop:10 }}>{question.explanation}</div>}
        </div>
      </div>
    );
  }

  // QUESTION LIVE
  if (phase === "question" && question) {
    const options = [{ key:"A", text:question.option_a },{ key:"B", text:question.option_b },{ key:"C", text:question.option_c },{ key:"D", text:question.option_d }].filter(o => o.text);
    const isMulti = question.question_type === "multiple_choice";
    const isPicture = question.question_type === "picture";
      const isMultiTap = question.question_type === "multi_tap";
      const multiTapOptions = [{ key:"A", text:question.option_a },{ key:"B", text:question.option_b },{ key:"C", text:question.option_c },{ key:"D", text:question.option_d },{ key:"E", text:(question as any).option_e },{ key:"F", text:(question as any).option_f }].filter(o => o.text);
    const imageUrl = isPicture ? question.option_b : null;

    // PICTURE ROUND - image only (first space)
    if (isPicture && pictureSubPhase === "image_only" && imageUrl) {
      return (
        <div style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:font, position:"relative" }}>
          <div style={{ position:"absolute", top:20, right:30, fontSize:18, color:"rgba(255,255,255,0.3)", letterSpacing:2 }}>Q{questionIndex+1} - Quiz-It</div>
          <img src={imageUrl} alt="Quiz image" style={{ maxWidth:"90vw", maxHeight:"85vh", borderRadius:16, objectFit:"contain", boxShadow:"0 0 60px rgba(190,38,193,0.3)" }} />
          <div style={{ position:"absolute", bottom:24, left:0, right:0, textAlign:"center", fontSize:16, color:"rgba(255,255,255,0.2)", letterSpacing:3 }}>PICTURE ROUND</div>
        </div>
      );
    }

    // PICTURE ROUND - image + question (second space)
    if (isPicture && pictureSubPhase === "question_visible") {
      return (
        <div style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", fontFamily:font, color:"#fff" }}>
          <div style={{ display:"flex", alignItems:"center", gap:16, padding:"20px 48px", borderBottom:"1px solid rgba(190,38,193,0.2)" }}>
            <div style={{ fontSize:16, letterSpacing:4, color:"rgba(255,255,255,0.3)" }}>Q{questionIndex+1}</div>
            <div style={{ padding:"4px 16px", borderRadius:999, background:"rgba(190,38,193,0.2)", border:"1px solid rgba(190,38,193,0.4)", fontSize:16, color:purple, letterSpacing:2 }}>PICTURE ROUND</div>
            <div style={{ flex:1 }} />
            {timeLeft !== null && timeLeft > 0 && (
              <div style={{ width:56, height:56, borderRadius:"50%", background:timeLeft<=3?"rgba(239,68,68,0.3)":"rgba(190,38,193,0.2)", border:"3px solid "+(timeLeft<=3?"#ef4444":purple), display:"flex", alignItems:"center", justifyContent:"center", fontSize:30, fontWeight:800, color:timeLeft<=3?"#ef4444":purple }}>{timeLeft}</div>
            )}
            <div style={{ fontSize:18, color:"rgba(255,255,255,0.3)", letterSpacing:2 }}>Quiz-It</div>
          </div>
          <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 1fr", gap:0 }}>
            {imageUrl && (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:32, borderRight:"1px solid rgba(190,38,193,0.2)" }}>
                <img src={imageUrl} alt="Quiz image" style={{ maxWidth:"100%", maxHeight:"70vh", borderRadius:12, objectFit:"contain" }} />
              </div>
            )}
            <div style={{ display:"flex", flexDirection:"column", justifyContent:"center", padding:48 }}>
              <div style={{ fontSize:45, fontWeight:700, lineHeight:1.4, marginBottom:24 }}>{question.question_text.replace(/^Show teams this image:\s*/i, "")}</div>
              <div style={{ padding:"16px 20px", borderRadius:12, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", fontSize:22, color:"rgba(255,255,255,0.4)", fontStyle:"italic" }}>
                Type your answer on your phone
              </div>
            </div>
          </div>
        </div>
      );
    }

    // STANDARD QUESTION
    return (
      <div style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", padding:"48px 80px", fontFamily:font, color:"#fff" }}>
        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:32 }}>
          <div style={{ fontSize:16, letterSpacing:4, color:"rgba(255,255,255,0.3)" }}>Q{questionIndex+1}</div>
          <div style={{ padding:"4px 16px", borderRadius:999, background:"rgba(190,38,193,0.2)", border:"1px solid rgba(190,38,193,0.4)", fontSize:16, color:purple, letterSpacing:2 }}>LIVE</div>
          <div style={{ flex:1 }} />
          {timeLeft !== null && timeLeft > 0 && (
            <div style={{ width:64, height:64, borderRadius:"50%", background:timeLeft<=3?"rgba(239,68,68,0.3)":"rgba(190,38,193,0.2)", border:"3px solid "+(timeLeft<=3?"#ef4444":purple), display:"flex", alignItems:"center", justifyContent:"center", fontSize:35, fontWeight:800, color:timeLeft<=3?"#ef4444":purple }}>{timeLeft}</div>
          )}
          <div style={{ fontSize:18, color:"rgba(255,255,255,0.3)", letterSpacing:2 }}>Quiz-It</div>
        </div>
        <div style={{ fontSize:"clamp(28px,4.2vw,55px)", fontWeight:700, lineHeight:1.35, marginBottom:40, maxWidth:"85%" }}>{question.question_text.replace(/^Play this track:\s*/i, "").replace(/^Show teams this image:\s*/i, "")}</div>
        {isMulti && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            {options.map(opt => (
              <div key={opt.key} style={{ padding:"20px 28px", borderRadius:16, background:"rgba(255,255,255,0.06)", border:"2px solid rgba(190,38,193,0.25)", fontSize:30, display:"flex", alignItems:"center", gap:14 }}>
                <span style={{ color:purple, fontWeight:800, fontSize:28 }}>{opt.key}.</span>
                <span>{opt.text}</span>
              </div>
            ))}
          </div>
        )}
        {isMultiTap && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            {multiTapOptions.map(opt => (
              <div key={opt.key} style={{ padding:"20px 28px", borderRadius:16, background:"rgba(255,255,255,0.06)", border:"2px solid rgba(190,38,193,0.25)", fontSize:26, display:"flex", alignItems:"center", gap:14 }}>
                <span style={{ color:purple, fontWeight:800, fontSize:24 }}>{opt.key}.</span>
                <span>{opt.text}</span>
              </div>
            ))}
          </div>
        )}
        {!isMulti && !isMultiTap && (
          <div style={{ padding:"20px 28px", borderRadius:16, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", fontSize:25, color:"rgba(255,255,255,0.4)", fontStyle:"italic" }}>
            Type your answer on your phone
          </div>
        )}
      </div>
    );
  }

  return null;
}

export default function DisplayScreen() {
  return (
    <Suspense fallback={<div style={{ minHeight:"100vh", background:"#0d0225" }} />}>
      <DisplayScreenInner />
    </Suspense>
  );
}
