"use client";
import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Question = {
  id?: string;
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_answer: string;
  explanation?: string;
  difficulty: string;
  round_type: string;
};
type Round = { id: string; name: string; questions: Question[]; };
type Team = { id: string; team_name: string; victory_song: string; session_pin: string; };
type Answer = { session_pin: string; id: string; team_name: string; question_index: number; answer_text: string; submitted_at: string; };
type UnoCard = { id: string; team_name: string; card_type: string; played_at: string; };
type Score = { team_name: string; total_points: number; round_points: number; };

const typeColor: Record<string,string> = { multiple_choice:"#a78bfa", text_answer:"#34d399", number:"#fbbf24", sequence:"#f472b6", picture:"#38bdf8", audio:"#fb923c" };
const typeLabel: Record<string,string> = { multiple_choice:"Multiple Choice", text_answer:"Text Answer", number:"Number", sequence:"Sequence", picture:"Picture Round", audio:"Name That Tune" };
const cardColor: Record<string,string> = { block:"#60a5fa", reverse:"#f87171", x2:"#facc15" };
const cardLabel: Record<string,string> = { block:"Block", reverse:"Reverse", x2:"x2" };

type HostPhase = "waiting" | "round_start" | "preview" | "question" | "timer" | "answer" | "celebration" | "round_end" | "quiz_end";

function playSound(file: string, volume = 1.0) {
  try {
    const a = new Audio("/sounds/" + file);
    a.volume = volume;
    a.play().catch(() => {});
    return a;
  } catch { return null; }
}

function QuizControllerInner() {
  const searchParams = useSearchParams();
  const [sessionPin, setSessionPin] = useState("");
  const [sessionId, setSessionId] = useState<string|null>(null);
  const [connected, setConnected] = useState(false);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedRound, setSelectedRound] = useState<Round|null>(null);
  const [qIdx, setQIdx] = useState(0);
  const [hostPhase, setHostPhase] = useState<HostPhase>("waiting");
  const [teams, setTeams] = useState<Team[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [unoCards, setUnoCards] = useState<UnoCard[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [pointsPerQ, setPointsPerQ] = useState(10);
  const [timeBonus, setTimeBonus] = useState(5);
  const [timerDuration, setTimerDuration] = useState(10);
  const [dangerZone, setDangerZone] = useState(false);
  const [dangerPenalty, setDangerPenalty] = useState(5);
  const [roundSettingsOpen, setRoundSettingsOpen] = useState(false);
  const [adjustTeam, setAdjustTeam] = useState<string|null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [timeLeft, setTimeLeft] = useState(10);
  const [fastestTeam, setFastestTeam] = useState<string|null>(null);
  const [fastestSong, setFastestSong] = useState<string|null>(null);
  const [roundNumber, setRoundNumber] = useState(1);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const tickAudioRef = useRef<AudioContext|null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const victorySongRef = useRef<HTMLAudioElement|null>(null);
  const advancingRef = useRef(false);
  const roundQuestionsRef = useRef<Question[]>([]);

  const currentQ = selectedRound?.questions[qIdx] || null;
  const isLastQ = selectedRound ? qIdx >= selectedRound.questions.length - 1 : false;
  const [picSubPhase, setPicSubPhase] = useState<"image_only"|"question_visible">("image_only");

  useEffect(() => { loadRounds(); }, []);
  useEffect(() => {
    if (selectedRound) roundQuestionsRef.current = [...selectedRound.questions];
  }, [selectedRound]);
  useEffect(() => {
    const pinFromUrl = searchParams.get("pin");
    if (pinFromUrl && pinFromUrl.length === 4 && !connected) {
      setPinInput(pinFromUrl);
      setTimeout(() => connectWithPin(pinFromUrl), 500);
    }
  }, [searchParams]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      handleSpacebar();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [hostPhase, selectedRound, qIdx, connected, answers, teams, currentQ, sessionId, sessionPin, pointsPerQ, timeBonus, timerDuration, dangerZone, dangerPenalty, timeLeft, isLastQ]);

  function handleSpacebar() {
    if (!connected || !selectedRound) return;
    if (advancingRef.current) return;
    advancingRef.current = true;
    setTimeout(() => { advancingRef.current = false; }, 400);

    if (hostPhase === "waiting") { doStartRound(); }
    else if (hostPhase === "round_start") { doPreviewQuestion(qIdx); }
    else if (hostPhase === "preview") { doSendQuestion(); }
    else if (hostPhase === "question") {
      if (currentQ?.question_type === "picture" && picSubPhase === "image_only") {
        doRevealPictureQuestion();
        setPicSubPhase("question_visible");
      } else {
        doStartTimer();
      }
    }
    else if (hostPhase === "timer") { doRevealAnswer(); }
    else if (hostPhase === "answer") { doCelebrate(); }
    else if (hostPhase === "celebration") {
      if (isLastQ) { doEndRound(); }
      else { doPreviewQuestion(qIdx + 1); }
    }
    else if (hostPhase === "round_end") { doStartRound(); }
  }

  async function loadRounds() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("rounds").select("id, name, questions").order("created_at", { ascending: false });
    if (data) setRounds(data);
  }

  async function connectWithPin(p: string) {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("sessions").select("*").eq("pin", p.trim()).single();
    if (!data) return;
    setSessionPin(p.trim());
    setSessionId(data.id);
    setConnected(true);
    loadTeams(p.trim());
    loadAnswers(p.trim(), 0);
    loadUnoCards(p.trim());
    loadScores(p.trim());
    subscribeToUpdates(p.trim());
  }

  async function connectToSession() {
    if (!pinInput.trim()) return;
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("sessions").select("*").eq("pin", pinInput.trim()).single();
    if (!data) { alert("Session not found!"); return; }
    setSessionPin(pinInput.trim());
    setSessionId(data.id);
    setConnected(true);
    loadTeams(pinInput.trim());
    loadAnswers(pinInput.trim(), 0);
    loadUnoCards(pinInput.trim());
    loadScores(pinInput.trim());
    subscribeToUpdates(pinInput.trim());
  }

  async function loadTeams(pin: string) {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("teams").select("*").eq("session_pin", pin).order("created_at", { ascending: true });
    if (data) setTeams(data);
  }

  async function loadAnswers(pin: string, idx: number) {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("answers").select("*").eq("session_pin", pin).eq("question_index", idx).order("submitted_at", { ascending: true });
    if (data) setAnswers(data);
  }

  async function loadUnoCards(pin?: string) {
    const supabase = createSupabaseBrowserClient();
    let q = supabase.from("uno_cards").select("*").order("played_at", { ascending: false });
    if (pin) q = (q as any).eq("session_pin", pin);
    const { data } = await q;
    if (data) setUnoCards(data);
  }

  async function loadScores(pin: string) {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("scores").select("team_name, total_points, round_points").eq("session_pin", pin).order("total_points", { ascending: false });
    if (data) setScores(data);
  }

  async function ensureScores(pin: string, teamList: Team[]) {
    const supabase = createSupabaseBrowserClient();
    for (const team of teamList) {
      await supabase.from("scores").upsert({ session_pin: pin, team_name: team.team_name, total_points: 0, round_points: 0 }, { onConflict: "session_pin,team_name", ignoreDuplicates: true });
    }
    loadScores(pin);
  }

  function normalise(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/^(the|a|an) /i, "").trim();
  }

  function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({length: m+1}, (_,i) => Array.from({length: n+1}, (_,j) => i===0?j:j===0?i:0));
    for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
      dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
    return dp[m][n];
  }

  function isFuzzyMatch(answer: string, correct: string): boolean {
    const a = normalise(answer);
    const b = normalise(correct);
    if (a === b) return true;
    if (a === "" || b === "") return false;
    // Partial match: answer is contained in correct or vice versa
    if (b.includes(a) && a.length >= 3) return true;
    if (a.includes(b) && b.length >= 3) return true;
    // Check each word of correct answer against answer
    const bWords = b.split(" ");
    if (bWords.length > 1) {
      for (const word of bWords) {
        if (word.length >= 4 && a === word) return true;
      }
    }
    const maxDist = Math.max(1, Math.floor(b.length * 0.3));
    return levenshtein(a, b) <= maxDist;
  }

  function getCorrectAnswerText(q: Question): string {
    if (q.question_type === "multiple_choice") {
      const map: Record<string, string|null> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d };
      return map[q.correct_answer.toLowerCase()] || q.correct_answer;
    }
    return q.correct_answer;
  }

  async function autoScore(teamList: Team[], q: Question, currentAnswers: Answer[]) {
    if (!sessionPin) return;
    const correctText = getCorrectAnswerText(q);
    const supabase = createSupabaseBrowserClient();
    for (const team of teamList) {
      const ans = currentAnswers.find(a => a.team_name === team.team_name);
      if (!ans) continue;
      const isCorrect = isFuzzyMatch(ans.answer_text, correctText);
      const isWrong = !isCorrect && ans.answer_text.trim() !== "";
      if (!isCorrect && !(isWrong && dangerZone)) continue;
      const answerTime = new Date(ans.submitted_at).getTime();
      const timerStartMs = Date.now() - (timerDuration - timeLeft) * 1000;
      const elapsed = Math.max(0, (answerTime - timerStartMs) / 1000);
      const secsRemaining = Math.max(0, timerDuration - elapsed);
      const timeBonusPts = isCorrect ? Math.round((secsRemaining / timerDuration) * timeBonus) : 0;
      const basePts = isCorrect ? pointsPerQ : 0;
      const penalty = isWrong && dangerZone ? -dangerPenalty : 0;
      const delta = basePts + timeBonusPts + penalty;
      if (delta === 0) continue;
      const { data: existing } = await supabase.from("scores").select("total_points, round_points").eq("session_pin", sessionPin).eq("team_name", team.team_name).single();
      const currentTotal = existing?.total_points ?? 0;
      const currentRound = existing?.round_points ?? 0;
      await supabase.from("scores").upsert({ session_pin: sessionPin, team_name: team.team_name, total_points: currentTotal + delta, round_points: currentRound + delta, updated_at: new Date().toISOString() }, { onConflict: "session_pin,team_name" });
    }
    loadScores(sessionPin);
  }

  async function adjustScore(teamName: string, delta: number) {
    if (!sessionPin || isNaN(delta) || delta === 0) return;
    const supabase = createSupabaseBrowserClient();
    const { data: existing } = await supabase.from("scores").select("total_points, round_points").eq("session_pin", sessionPin).eq("team_name", teamName).single();
    const currentTotal = existing?.total_points ?? 0;
    const currentRound = existing?.round_points ?? 0;
    await supabase.from("scores").upsert({ session_pin: sessionPin, team_name: teamName, total_points: currentTotal + delta, round_points: currentRound + delta, updated_at: new Date().toISOString() }, { onConflict: "session_pin,team_name" });
    loadScores(sessionPin);
    setAdjustTeam(null);
    setAdjustAmount("");
  }

  async function resetRoundPoints() {
    if (!sessionPin) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("scores").update({ round_points: 0 }).eq("session_pin", sessionPin);
    loadScores(sessionPin);
  }

  async function pushScoreboardToScreen() {
    if (!sessionId) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ phase: "scoreboard", scoreboard_data: scores, show_scoreboard: true }).eq("id", sessionId);
    setShowScoreboard(true);
  }

  async function hideScoreboard() {
    if (!sessionId) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ phase: "waiting", show_scoreboard: false }).eq("id", sessionId);
    setShowScoreboard(false);
  }

  async function pushScoreboardToHandsets() {
    if (!sessionId) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ show_scoreboard: true, scoreboard_data: scores }).eq("id", sessionId);
    setTimeout(async () => {
      await supabase.from("sessions").update({ show_scoreboard: false }).eq("id", sessionId);
    }, 30000);
  }

  async function doEndOfQuiz() {
    if (!sessionId) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ phase: "quiz_end", scoreboard_data: scores }).eq("id", sessionId);
    setHostPhase("quiz_end");
  }

  function subscribeToUpdates(pin: string) {
    const supabase = createSupabaseBrowserClient();
    supabase.channel("quiz-host-" + pin)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "answers" }, (payload) => {
        const a = payload.new as Answer;
        if (a.session_pin === pin) setAnswers(prev => [...prev, a]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "teams" }, (payload) => {
        const t = payload.new as Team;
        if (t.session_pin === pin) setTeams(prev => [...prev, t]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "uno_cards" }, (payload) => {
        setUnoCards(prev => [payload.new as UnoCard, ...prev]);
      })
      .subscribe();
  }

  function stopTickAudio() {
    if (tickIntervalRef.current) { clearInterval(tickIntervalRef.current); tickIntervalRef.current = null; }
    if (tickAudioRef.current) { try { tickAudioRef.current.close(); } catch {} tickAudioRef.current = null; }
  }

  function startTickAudio(duration: number) {
    try {
      const ctx = new AudioContext();
      tickAudioRef.current = ctx;
      let tick = 0;
      tickIntervalRef.current = setInterval(() => {
        tick++;
        if (tick > duration) { stopTickAudio(); return; }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        const progress = tick / duration;
        osc.frequency.value = progress > 0.7 ? 880 : 440;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.08);
      }, 1000);
    } catch {}
  }

  function stopVictorySong() {
    if (victorySongRef.current) { victorySongRef.current.pause(); victorySongRef.current.currentTime = 0; victorySongRef.current = null; }
  }

  function playVictorySong(songFile: string) {
    stopVictorySong();
    const audio = new Audio("/sounds/" + encodeURIComponent(songFile) + ".mp3");
    audio.volume = 0.8;
    audio.play().catch(() => {});
    victorySongRef.current = audio;
  }

  // PHASE ACTIONS
  async function doStartRound() {
    if (!selectedRound || !sessionId) return;
    stopVictorySong();
    stopTickAudio();
    setQIdx(0);
    setAnswers([]);
    setFastestTeam(null);
    setFastestSong(null);
    setTimeLeft(timerDuration);
    setHostPhase("round_start");
    playSound("round-start.mp3");
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ phase: "round_start", round_name: selectedRound.name, round_number: roundNumber }).eq("id", sessionId);
  }

  async function doPreviewQuestion(idx: number) {
    if (!selectedRound) return;
    setQIdx(idx);
    setAnswers([]);
    setFastestTeam(null);
    setFastestSong(null);
    setTimeLeft(timerDuration);
    setHostPhase("preview");
    setPicSubPhase("image_only");
    // Display screen stays on holding/waiting — no Supabase push here
    if (sessionPin) loadAnswers(sessionPin, idx);
  }

  async function doSendQuestion() {
    if (!selectedRound || !sessionId) { alert("doSendQuestion: no sessionId! " + sessionId); return; }
    const q = selectedRound.questions[qIdx];
    setHostPhase("question");
    const isPicture = q.question_type === "picture";
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("sessions").update({ phase: "question", current_question: q, current_question_index: qIdx, fastest_team: null, fastest_song: null, picture_sub_phase: isPicture ? "image_only" : null }).eq("id", sessionId);
    if (error) alert("Supabase error: " + JSON.stringify(error));
    else alert("doSendQuestion OK - sessionId: " + sessionId);
  }

  async function doRevealPictureQuestion() {
    if (!sessionId || !currentQ) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ picture_sub_phase: "question_visible" }).eq("id", sessionId);
  }

  async function doStartTimer() {
    if (!sessionId) return;
    stopTickAudio();
    setHostPhase("timer");
    setTimeLeft(timerDuration);
    const supabase = createSupabaseBrowserClient();
    const now = new Date().toISOString();
    await supabase.from("sessions").update({ timer_started_at: now, timer_duration: timerDuration }).eq("id", sessionId);
    startTickAudio(timerDuration);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); stopTickAudio(); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function doRevealAnswer() {
    if (!currentQ || !sessionId) return;
    if (timerRef.current) clearInterval(timerRef.current);
    stopTickAudio();
    setHostPhase("answer");
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ phase: "answer" }).eq("id", sessionId);
    await autoScore(teams, currentQ, answers);
  }

  async function doCelebrate() {
    if (!sessionId) return;
    const correctAnswers = answers.filter(a =>
      currentQ && isFuzzyMatch(a.answer_text, getCorrectAnswerText(currentQ))
    ).sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
    const fastest = correctAnswers[0] || null;
    const fastestTeamName = fastest?.team_name || null;
    const team = teams.find(t => t.team_name === fastestTeamName);
    const song = team?.victory_song || null;
    setFastestTeam(fastestTeamName);
    setFastestSong(song);
    setHostPhase("celebration");
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ phase: "celebration", fastest_team: fastestTeamName, fastest_song: song }).eq("id", sessionId);
    if (song) playVictorySong(song);
  }

  async function doEndRound() {
    if (!sessionId) return;
    stopVictorySong();
    stopTickAudio();
    setHostPhase("round_end");
    playSound("round-end.mp3");
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ phase: "round_end" }).eq("id", sessionId);
    setRoundNumber(prev => prev + 1);
  }

  async function doDumpQuestion() {
    if (!selectedRound || !sessionId) return;
    const updated = { ...selectedRound, questions: selectedRound.questions.filter((_, i) => i !== qIdx) };
    setSelectedRound(updated);
    const supabase = createSupabaseBrowserClient();
    await supabase.from("rounds").update({ questions: updated.questions }).eq("id", selectedRound.id);
    if (updated.questions.length === 0) {
      doEndRound();
      return;
    }
    const nextIdx = Math.min(qIdx, updated.questions.length - 1);
    setQIdx(nextIdx);
    setAnswers([]);
    setHostPhase("preview");
    if (sessionPin) loadAnswers(sessionPin, nextIdx);
  }

  const teamHasAnswered = (teamName: string) => answers.some(a => a.team_name === teamName);
  const teamAnswer = (teamName: string) => answers.find(a => a.team_name === teamName)?.answer_text || "";

  const spacebarHint =
    hostPhase === "waiting" ? "SPACE: Start Round" :
    hostPhase === "round_start" ? "SPACE: Preview First Question" :
    hostPhase === "preview" ? "SPACE: Send Question Live" :
    hostPhase === "question" && currentQ?.question_type === "picture" && picSubPhase === "image_only" ? "SPACE: Reveal Question Text" :
    hostPhase === "question" ? "SPACE: Start Timer" :
    hostPhase === "timer" ? "SPACE: Reveal Answer" :
    hostPhase === "answer" ? "SPACE: Celebrate Fastest Team" :
    hostPhase === "celebration" ? (isLastQ ? "SPACE: End Round" : "SPACE: Preview Next Question") :
    hostPhase === "round_end" ? "SPACE: Start Next Round" :
    hostPhase === "quiz_end" ? "Leaderboard reveal active" : "";

  if (!connected) {
    return (
      <div style={{ minHeight:"100vh", background:"linear-gradient(160deg, #1a0535 0%, #0d0225 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"sans-serif" }}>
        <div style={{ background:"rgba(45,10,94,0.7)", border:"2px solid #BE26C1", borderRadius:20, padding:48, textAlign:"center", width:400 }}>
          <div style={{ fontSize:28, fontWeight:700, color:"#BE26C1", letterSpacing:4, marginBottom:8 }}>Quiz Controller</div>
          <div style={{ fontSize:15, color:"rgba(255,255,255,0.7)", marginBottom:32 }}>Enter the session PIN to connect</div>
          <input value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g,"").slice(0,4))}
            onKeyDown={e => e.key==="Enter" && connectToSession()} placeholder="PIN" maxLength={4}
            style={{ width:"100%", padding:"16px", borderRadius:12, background:"rgba(255,255,255,0.1)", color:"#fff", border:"2px solid rgba(190,38,193,0.6)", fontSize:32, fontFamily:"monospace", textAlign:"center", letterSpacing:12, outline:"none", marginBottom:16, boxSizing:"border-box" as const }} />
          <button onClick={connectToSession} disabled={pinInput.length!==4}
            style={{ width:"100%", padding:16, borderRadius:12, background:pinInput.length===4?"#BE26C1":"#333", color:"#fff", border:"none", fontSize:18, letterSpacing:4, cursor:pinInput.length===4?"pointer":"not-allowed" }}>
            Connect
          </button>
        </div>
      </div>
    );
  }

  const phaseColor = hostPhase==="question"||hostPhase==="timer"?"#22c55e":hostPhase==="answer"?"#fbbf24":hostPhase==="celebration"?"#BE26C1":hostPhase==="preview"?"#38bdf8":hostPhase==="round_start"?"#fb923c":hostPhase==="round_end"?"#f87171":"#aaa";
  const phaseBg = hostPhase==="question"||hostPhase==="timer"?"rgba(34,197,94,0.2)":hostPhase==="answer"?"rgba(251,191,36,0.2)":hostPhase==="celebration"?"rgba(190,38,193,0.2)":hostPhase==="preview"?"rgba(56,189,248,0.2)":hostPhase==="round_start"?"rgba(251,146,60,0.2)":hostPhase==="round_end"?"rgba(248,113,113,0.2)":"rgba(255,255,255,0.1)";

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg, #1a0535 0%, #0d0225 100%)", fontFamily:"sans-serif", color:"#fff", display:"flex", flexDirection:"column" as const }}>
      {/* HEADER */}
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 20px", borderBottom:"1px solid rgba(190,38,193,0.3)", background:"rgba(45,10,94,0.5)", flexWrap:"wrap" as const }}>
        <div style={{ fontSize:16, fontWeight:700, color:"#BE26C1", letterSpacing:3 }}>Quiz Controller</div>
        <div style={{ padding:"3px 10px", borderRadius:999, background:"rgba(190,38,193,0.2)", border:"1px solid rgba(190,38,193,0.4)", fontSize:12, color:"#BE26C1" }}>PIN: {sessionPin}</div>
        <div style={{ padding:"3px 10px", borderRadius:999, fontSize:12, fontWeight:700, background:phaseBg, color:phaseColor, border:"1px solid rgba(255,255,255,0.15)" }}>
          {hostPhase.toUpperCase().replace("_"," ")}{hostPhase==="timer" ? " "+timeLeft+"s" : ""}
        </div>
        {selectedRound && (
          <div style={{ padding:"3px 12px", borderRadius:999, background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.2)", fontSize:13, fontWeight:800, color:"#fff", letterSpacing:1 }}>
            Q {qIdx+1} <span style={{ color:"rgba(255,255,255,0.4)", fontWeight:400 }}>of {selectedRound.questions.length}</span>
          </div>
        )}
        <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)", letterSpacing:1, flex:1, textAlign:"center" as const }}>{spacebarHint}</div>
        <select value={selectedRound?.id||""} onChange={e => { const r = rounds.find(x=>x.id===e.target.value); setSelectedRound(r||null); setQIdx(0); setAnswers([]); setHostPhase("waiting"); roundQuestionsRef.current = r ? [...r.questions] : []; }}
          style={{ padding:"5px 10px", borderRadius:8, background:"rgba(255,255,255,0.1)", color:"#fff", border:"1px solid rgba(190,38,193,0.4)", fontSize:12, cursor:"pointer" }}>
          <option value="">Select round...</option>
          {rounds.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <a href="/host/spin" target="_blank" style={{ padding:"5px 12px", borderRadius:8, background:"rgba(190,38,193,0.3)", border:"1px solid #BE26C1", color:"#fff", textDecoration:"none", fontSize:11 }}>Spin</a>
        <a href="/host/display" target="_blank" style={{ padding:"5px 12px", borderRadius:8, background:"#BE26C1", color:"#fff", textDecoration:"none", fontSize:11 }}>Display</a>
      </div>

      {/* SCOREBOARD BUTTONS BAR */}
      <div style={{ display:"flex", gap:8, padding:"8px 20px", borderBottom:"1px solid rgba(190,38,193,0.15)", background:"rgba(20,5,50,0.4)", alignItems:"center", flexWrap:"wrap" as const }}>
        <span style={{ fontSize:11, color:"rgba(255,255,255,0.3)", letterSpacing:2, marginRight:4 }}>SCOREBOARD:</span>
        <button onClick={pushScoreboardToHandsets} style={{ padding:"5px 14px", borderRadius:6, background:"rgba(56,189,248,0.2)", border:"1px solid rgba(56,189,248,0.5)", color:"#38bdf8", fontSize:11, cursor:"pointer" }}>Send to Handsets</button>
        <button onClick={showScoreboard ? hideScoreboard : pushScoreboardToScreen} style={{ padding:"5px 14px", borderRadius:6, background:showScoreboard?"rgba(34,197,94,0.3)":"rgba(190,38,193,0.3)", border:"1px solid "+(showScoreboard?"#22c55e":"#BE26C1"), color:showScoreboard?"#22c55e":"#fff", fontSize:11, cursor:"pointer" }}>{showScoreboard ? "Hide from Screen" : "Show on Screen"}</button>
        <button onClick={doEndOfQuiz} style={{ padding:"5px 14px", borderRadius:6, background:"rgba(251,191,36,0.2)", border:"1px solid rgba(251,191,36,0.5)", color:"#fbbf24", fontSize:11, cursor:"pointer", marginLeft:"auto" }}>End of Quiz Reveal</button>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 380px", gap:0, overflow:"hidden" }}>
        <div style={{ padding:24, overflowY:"auto" as const, borderRight:"1px solid rgba(190,38,193,0.2)" }}>
          {!selectedRound ? (
            <div style={{ textAlign:"center", marginTop:80, color:"rgba(255,255,255,0.4)", fontSize:18 }}>Select a round from the dropdown above to begin</div>
          ) : hostPhase === "round_start" ? (
            <div style={{ textAlign:"center", marginTop:60 }}>
              <div style={{ fontSize:48, marginBottom:16 }}>🎵</div>
              <div style={{ fontSize:32, fontWeight:800, color:"#fb923c", letterSpacing:3, marginBottom:8 }}>{selectedRound.name}</div>
              <div style={{ fontSize:18, color:"rgba(255,255,255,0.5)", marginBottom:32 }}>{selectedRound.questions.length} questions</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)", letterSpacing:2 }}>Announce the round — then SPACE to preview Q1</div>
            </div>
          ) : hostPhase === "round_end" ? (
            <div style={{ textAlign:"center", marginTop:60 }}>
              <div style={{ fontSize:48, marginBottom:16 }}>🏁</div>
              <div style={{ fontSize:32, fontWeight:800, color:"#f87171", letterSpacing:3, marginBottom:8 }}>Round Complete</div>
              <div style={{ fontSize:16, color:"rgba(255,255,255,0.4)", marginBottom:32 }}>SPACE to start next round, or use End of Quiz Reveal</div>
            </div>
          ) : hostPhase === "quiz_end" ? (
            <div style={{ textAlign:"center", marginTop:60 }}>
              <div style={{ fontSize:48, marginBottom:16 }}>🏆</div>
              <div style={{ fontSize:32, fontWeight:800, color:"#fbbf24", letterSpacing:3, marginBottom:8 }}>Quiz Complete!</div>
              <div style={{ fontSize:16, color:"rgba(255,255,255,0.4)", marginBottom:32 }}>Leaderboard reveal is live on the display screen</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)", letterSpacing:2 }}>SPACE: reveal next team on display screen</div>
            </div>
          ) : hostPhase === "celebration" ? (
            <div style={{ textAlign:"center", marginTop:60 }}>
              <div style={{ fontSize:72, marginBottom:16 }}>🎉</div>
              <div style={{ fontSize:14, letterSpacing:3, color:"rgba(255,255,255,0.4)", marginBottom:12 }}>FASTEST CORRECT ANSWER</div>
              {fastestTeam ? (
                <>
                  <div style={{ fontSize:42, fontWeight:800, color:"#BE26C1", letterSpacing:2, textShadow:"0 0 40px rgba(190,38,193,0.7)", marginBottom:8 }}>{fastestTeam}</div>
                  <div style={{ fontSize:16, color:"rgba(255,255,255,0.5)", marginBottom:32 }}>Victory song playing...</div>
                </>
              ) : (
                <div style={{ fontSize:24, color:"rgba(255,25255,0.4)", marginBottom:32 }}>No correct answers this round</div>
              )}
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)", letterSpacing:2 }}>{isLastQ ? "SPACE: End Round" : "SPACE: Preview Next Question"}</div>
            </div>
          ) : !currentQ ? (
            <div style={{ textAlign:"center", marginTop:80, color:"rgba(255,255,255,0.4)", fontSize:18 }}>No questions in this round</div>
          ) : (
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, flexWrap:"wrap" as const }}>
                <span style={{ background:"rgba(190,38,193,0.2)", color:"#BE26C1", padding:"4px 14px", borderRadius:999, fontSize:13, fontWeight:700 }}>Q{qIdx+1} of {selectedRound.questions.length}</span>
                <span style={{ background:"rgba(255,255,255,0.1)", color:typeColor[currentQ.question_type]||"#aaa", padding:"4px 14px", borderRadius:999, fontSize:13, fontWeight:600 }}>{typeLabel[currentQ.question_type]||currentQ.question_type}</span>
                <span style={{ fontSize:13, color:"rgba(255,255,255,0.4)" }}>{currentQ.difficulty}</span>
                {hostPhase === "preview" && <span style={{ padding:"4px 14px", borderRadius:999, background:"rgba(56,189,248,0.2)", border:"1px solid rgba(56,189,248,0.5)", fontSize:12, color:"#38bdf8" }}>HOST PREVIEW — not sent yet</span>}
                {hostPhase === "timer" && (
                  <div style={{ marginLeft:"auto", width:52, height:52, borderRadius:"50%", background:timeLeft<=3?"rgba(239,68,68,0.3)":"rgba(190,38,193,0.2)", border:"3px solid "+(timeLeft<=3?"#ef4444":"#BE26C1"), display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:800, color:timeLeft<=3?"#ef4444":"#BE26C1" }}>{timeLeft}</div>
                )}
              </div>

              <div style={{ fontSize:26, fontWeight:700, lineHeight:1.4, marginBottom:24, color:"#fff" }}>{currentQ.question_text}</div>

              {currentQ.question_type==="multiple_choice" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
                  {(["a","b","c","d"] as const).map(l => {
                    const opt = currentQ[("option_"+l) as keyof Question] as string;
                    const isCorrect = l===currentQ.correct_answer.toLowerCase();
                    const showCorrect = (hostPhase==="answer"||hostPhase==="preview") && isCorrect;
                    return opt ? (
                      <div key={l} style={{ padding:"12px 16px", borderRadius:10, background:showCorrect?"rgba(34,197,94,0.2)":"rgba(255,255,255,0.07)", border:"1px solid "+(showCorrect?"rgba(34,197,94,0.6)":"rgba(255,255,255,0.15)"), fontSize:15 }}>
                        <span style={{ color:"#BE26C1", fontWeight:700, marginRight:8 }}>{l.toUpperCase()}.</span>
                        <span style={{ color:showCorrect?"#22c55e":"#fff" }}>{opt}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              )}

              {currentQ.question_type==="sequence" && (
                <div style={{ marginBottom:20 }}>
                  {[currentQ.option_a,currentQ.option_b,currentQ.option_c,currentQ.option_d].filter(Boolean).map((item,i) => (
                    <div key={i} style={{ padding:"10px 16px", borderRadius:8, background:"rgba(255,255,255,0.07)", marginBottom:6, display:"flex", gap:10, fontSize:15 }}>
                      <span style={{ color:"#BE26C1", fontWeight:700, minWidth:24 }}>{i+1}.</span>{item}
                    </div>
                  ))}
                </div>
              )}

              {currentQ.question_type==="audio" && currentQ.option_b && (
                <div style={{ marginBottom:20 }}>
                  <a href={currentQ.option_b} target="_blank" rel="noopener noreferrer"
                    style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"12px 24px", borderRadius:10, background:"rgba(251,146,60,0.2)", border:"1px solid rgba(251,146,60,0.5)", color:"#fb923c", textDecoration:"none", fontSize:16, fontWeight:600 }}>
                    Play on YouTube
                  </a>
                </div>
              )}

              {hostPhase==="answer" && (
                <div style={{ padding:"16px 20px", borderRadius:12, background:"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.4)", marginBottom:20 }}>
                  <div style={{ fontSize:12, color:"rgba(34,197,94,0.7)", marginBottom:4, letterSpacing:2 }}>ANSWER</div>
                  <div style={{ fontSize:24, fontWeight:700, color:"#22c55e" }}>{getCorrectAnswerText(currentQ)}</div>
                  {currentQ.explanation && <div style={{ fontSize:14, color:"rgba(255,255,255,0.6)", marginTop:8 }}>{currentQ.explanation}</div>}
                </div>
              )}

              <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const, marginTop:16, paddingTop:16, borderTop:"1px solid rgba(255,255,255,0.08)" }}>
                <button onClick={doStartRound}
                  style={{ padding:"10px 20px", borderRadius:8, background:"rgba(251,146,60,0.3)", border:"1px solid rgba(251,146,60,0.6)", color:"#fb923c", cursor:"pointer", fontSize:13 }}>
                  Start Round
                </button>
                <button onClick={() => doPreviewQuestion(qIdx)} disabled={hostPhase==="preview"}
                  style={{ padding:"10px 20px", borderRadius:8, background:"rgba(56,189,248,0.2)", border:"1px solid rgba(56,189,248,0.5)", color:"#38bdf8", cursor:"pointer", fontSize:13 }}>
                  Preview Q
                </button>
                <button onClick={doSendQuestion} disabled={hostPhase!=="preview"}
                  style={{ padding:"10px 20px", borderRadius:8, background:hostPhase==="preview"?"rgba(190,38,193,0.4)":"rgba(255,255,255,0.05)", border:"1px solid "+(hostPhase==="preview"?"#BE26C1":"rgba(255,255,255,0.1)"), color:hostPhase==="preview"?"#fff":"#444", cursor:hostPhase==="preview"?"pointer":"not-allowed", fontSize:13 }}>
                  Send Live
                </button>
                <button onClick={doStartTimer} disabled={hostPhase==="timer"}
                  style={{ padding:"10px 20px", borderRadius:8, background:hostPhase==="timer"?"#111":"rgba(251,191,36,0.3)", border:"1px solid "+(hostPhase==="timer"?"#333":"rgba(251,191,36,0.6)"), color:hostPhase==="timer"?"#444":"#fbbf24", cursor:hostPhase==="timer"?"not-allowed":"pointer", fontSize:13 }}>
                  {hostPhase==="timer" ? timeLeft+"s" : "Timer"}
                </button>
                <button onClick={doRevealAnswer} disabled={hostPhase==="answer"}
                  style={{ padding:"10px 20px", borderRadius:8, background:hostPhase==="answer"?"#111":"rgba(34,197,94,0.3)", border:"1px solid "+(hostPhase==="answer"?"#333":"rgba(34,197,94,0.6)"), color:hostPhase==="answer"?"#444":"#22c55e", cursor:hostPhase==="answer"?"not-allowed":"pointer", fontSize:13 }}>
                  Reveal
                </button>
                <button onClick={doCelebrate}
                  style={{ padding:"10px 20px", borderRadius:8, background:"rgba(251,191,36,0.2)", border:"1px solid rgba(251,191,36,0.5)", color:"#fbbf24", cursor:"pointer", fontSize:13 }}>
                  Celebrate
                </button>
                <button onClick={doDumpQuestion}
                  style={{ padding:"10px 20px", borderRadius:8, background:"rgba(239,68,68,0.2)", border:"1px solid rgba(239,68,68,0.5)", color:"#ef4444", cursor:"pointer", fontSize:13 }}>
                  Dump Q
                </button>
                {isLastQ ? (
                  <button onClick={doEndRound}
                    style={{ padding:"10px 20px", borderRadius:8, background:"rgba(248,113,113,0.3)", border:"1px solid #f87171", color:"#f87171", cursor:"pointer", fontSize:13, marginLeft:"auto" }}>
                    End Round
                  </button>
                ) : (
                  <button onClick={() => doPreviewQuestion(qIdx+1)}
                    style={{ padding:"10px 20px", borderRadius:8, background:"#BE26C1", border:"none", color:"#fff", cursor:"pointer", fontSize:13, marginLeft:"auto" }}>
                    Next Q
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div style={{ overflowY:"auto" as const, display:"flex", flexDirection:"column" as const }}>
          <div style={{ padding:"12px 16px", borderBottom:"1px solid rgba(190,38,193,0.2)", background:"rgba(45,10,94,0.4)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#BE26C1", letterSpacing:2 }}>ROUND SETTINGS</div>
              <button onClick={() => setRoundSettingsOpen((p: boolean) => !p)} style={{ fontSize:11, padding:"2px 8px", borderRadius:6, background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.2)", color:"#fff", cursor:"pointer" }}>{roundSettingsOpen ? "Hide" : "Edit"}</button>
            </div>
            {roundSettingsOpen && (
              <div style={{ display:"flex", flexDirection:"column" as const, gap:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ fontSize:12, color:"rgba(255,255,255,0.6)", minWidth:110 }}>Points/question</label>
                  <input type="number" value={pointsPerQ} onChange={e => setPointsPerQ(Number(e.target.value))} style={{ width:60, padding:"4px 8px", borderRadius:6, background:"rgba(255,255,255,0.1)", color:"#fff", border:"1px solid rgba(190,38,193,0.4)", fontSize:14, textAlign:"center" as const }} />
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ fontSize:12, color:"rgba(255,255,255,0.6)", minWidth:110 }}>Timer (seconds)</label>
                  <input type="number" value={timerDuration} onChange={e => setTimerDuration(Number(e.target.value))} style={{ width:60, padding:"4px 8px", borderRadius:6, background:"rgba(255,255,255,0.1)", color:"#fff", border:"1px solid rgba(190,38,193,0.4)", fontSize:14, textAlign:"center" as const }} />
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ fontSize:12, color:"rgba(255,255,255,0.6)", minWidth:110 }}>Max time bonus</label>
                  <input type="number" value={timeBonus} onChange={e => setTimeBonus(Number(e.target.value))} style={{ width:60, padding:"4px 8px", borderRadius:6, background:"rgba(255,255,255,0.1)", color:"#fff", border:"1px solid rgba(190,38,193,0.4)", fontSize:14, textAlign:"center" as const }} />
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ fontSize:12, color:"rgba(255,255,255,0.6)", minWidth:110 }}>Danger Zone</label>
                  <button onClick={() => setDangerZone((p: boolean) => !p)} style={{ padding:"4px 12px", borderRadius:6, background:dangerZone?"rgba(239,68,68,0.3)":"rgba(255,255,255,0.08)", border:"1px solid "+(dangerZone?"#ef4444":"rgba(255,255,255,0.2)"), color:dangerZone?"#ef4444":"#aaa", fontSize:12, cursor:"pointer" }}>{dangerZone ? "ON" : "OFF"}</button>
                </div>
                {dangerZone && (
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <label style={{ fontSize:12, color:"rgba(255,255,255,0.6)", minWidth:110 }}>Penalty pts</label>
                    <input type="number" value={dangerPenalty} onChange={e => setDangerPenalty(Number(e.target.value))} style={{ width:60, padding:"4px 8px", borderRadius:6, background:"rgba(255,255,255,0.1)", color:"#fff", border:"1px solid rgba(239,68,68,0.4)", fontSize:14, textAlign:"center" as const }} />
                  </div>
                )}
                <button onClick={resetRoundPoints} style={{ padding:"6px 12px", borderRadius:6, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.5)", fontSize:12, cursor:"pointer", marginTop:4 }}>Reset Round Points</button>
              </div>
            )}
            {!roundSettingsOpen && (
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>{pointsPerQ}pts/q · {timerDuration}s · +{timeBonus} bonus · {dangerZone ? "Danger Zone -"+dangerPenalty+"pts" : "Normal"}</div>
            )}
          </div>

          <div style={{ padding:"12px 16px", flex:1, overflowY:"auto" as const }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#BE26C1", letterSpacing:2, marginBottom:10 }}>LEADERBOARD</div>
            {scores.length === 0 && teams.length > 0 && (
              <button onClick={() => ensureScores(sessionPin, teams)} style={{ width:"100%", padding:"8px", borderRadius:8, background:"rgba(190,38,193,0.2)", border:"1px solid rgba(190,38,193,0.4)", color:"#BE26C1", fontSize:13, cursor:"pointer", marginBottom:10 }}>Initialise Scores</button>
            )}
            {scores.map((s, i) => {
              const answered = teamHasAnswered(s.team_name);
              const ans = teamAnswer(s.team_name);
              const medal = i===0 ? "gold" : i===1 ? "silver" : i===2 ? "#cd7f32" : null;
              const isFastest = s.team_name === fastestTeam;
              return (
                <div key={s.team_name} style={{ padding:"8px 10px", borderRadius:10, background:isFastest?"rgba(190,38,193,0.15)":"rgba(255,255,255,0.05)", border:"1px solid "+(isFastest?"#BE26C1":medal||"rgba(255,255,255,0.1)"), marginBottom:6 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:medal||"rgba(255,255,255,0.4)", minWidth:22 }}>{i+1}.</span>
                    <span style={{ fontWeight:700, fontSize:13, flex:1, color:"#fff" }}>{s.team_name}{isFastest?" ⚡":""}</span>
                    <div style={{ width:7, height:7, borderRadius:"50%", background:answered?"#22c55e":"rgba(255,255,255,0.15)", flexShrink:0 }} />
                    <span style={{ fontSize:17, fontWeight:800, color:"#BE26C1", minWidth:38, textAlign:"right" as const }}>{s.total_points}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", paddingLeft:28, marginTop:3, gap:6 }}>
                    <span style={{ fontSize:11, color:"rgba(255,255,255,0.3)" }}>Rd: +{s.round_points}</span>
                    {answered && <span style={{ fontSize:11, color:"#22c55e", fontStyle:"italic", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{ans}</span>}
                    {adjustTeam === s.team_name ? (
                      <div style={{ display:"flex", gap:4, marginLeft:"auto" }}>
                        <input type="number" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} placeholder="+/-" style={{ width:52, padding:"2px 4px", borderRadius:4, background:"rgba(255,255,255,0.1)", color:"#fff", border:"1px solid rgba(190,38,193,0.4)", fontSize:12, textAlign:"center" as const }} />
                        <button onClick={() => adjustScore(s.team_name, Number(adjustAmount))} style={{ padding:"2px 8px", borderRadius:4, background:"#BE26C1", border:"none", color:"#fff", fontSize:11, cursor:"pointer" }}>OK</button>
                        <button onClick={() => { setAdjustTeam(null); setAdjustAmount(""); }} style={{ padding:"2px 6px", borderRadius:4, background:"rgba(255,255,255,0.08)", border:"none", color:"#aaa", fontSize:11, cursor:"pointer" }}>X</button>
                      </div>
                    ) : (
                      <button onClick={() => setAdjustTeam(s.team_name)} style={{ marginLeft:"auto", fontSize:10, padding:"2px 6px", borderRadius:4, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.4)", cursor:"pointer" }}>+/- pts</button>
                    )}
                  </div>
                </div>
              );
            })}
            {unoCards.length > 0 && (
              <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid rgba(190,38,193,0.15)" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"rgba(190,38,193,0.6)", marginBottom:6, letterSpacing:2 }}>POWER CARDS</div>
                {unoCards.slice(0,5).map((card,i) => (
                  <div key={card.id||i} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 8px", borderRadius:6, background:"rgba(255,255,255,0.04)", marginBottom:4 }}>
                    <span style={{ color:cardColor[card.card_type], fontWeight:700, fontSize:11, minWidth:44 }}>{cardLabel[card.card_type]}</span>
                    <span style={{ color:"rgba(255,255,255,0.6)", fontSize:11 }}>{card.team_name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QuizController() {
  return (
    <Suspense fallback={<div style={{ minHeight:"100vh", background:"#0d0225", display:"flex", alignItems:"center", justifyContent:"center", color:"#BE26C1", fontSize:24 }}>Loading...</div>}>
      <QuizControllerInner />
    </Suspense>
  );
}
