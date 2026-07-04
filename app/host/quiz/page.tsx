"use client";
import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { SlotReels, SLOT_SEGS } from "@/components/SlotReels";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { HardDeckPanel } from "@/components/HardDeckPanel";
import { downloadWinnerCard } from "@/components/SocialShareCard";

type Question = {
  id?: number;
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
  playback_mode?: string;
  replay_mode?: string;
  fade_in?: boolean;
  fade_out?: boolean;
};
type Round = { id: string; name: string; questions: Question[]; };
type Team = { id: string; team_name: string; victory_song: string; session_pin: string; };
type Answer = { session_pin: string; id: string; team_name: string; question_index: number; answer_text: string; submitted_at: string; };
type UnoCard = { id: string; team_name: string; card_type: string; played_at: string; };
type Score = { team_name: string; total_points: number; round_points: number; };

const typeColor: Record<string,string> = { multiple_choice:"#a78bfa", text_answer:"#34d399", number:"#fbbf24", sequence:"#f472b6", picture:"#38bdf8", audio:"#fb923c" };
const typeLabel: Record<string,string> = { multiple_choice:"Multiple Choice", text_answer:"Text Answer", number:"Number", sequence:"Sequence", picture:"Picture Round", audio:"Name That Tune" };
const cardColor: Record<string,string> = { block:"#60a5fa", reverse:"#f87171", x2:"#facc15" };
const cardLabel: Record<string,string> = { block:"Time-Out", reverse:"Reverse", x2:"Boost" };

const RULES = {
  house: [
    "Welcome to Quiz-It! Get your team ready on your phones \u2014 join with the PIN on screen.",
    "Answers lock in the moment you submit \u2014 no changing your mind after.",
    "You've got 15 seconds per question, so don't overthink it.",
    "Power cards (Time-Out, Boost, Reverse) can be played once per game \u2014 use them wisely!",
    "Have fun, play fair, and good luck!",
  ],
  regular: [
    "Standard quiz questions \u2014 multiple choice, type-in, sequence, or tap-all-that-apply.",
    "Fastest correct answer each question gets a speed bonus on top of normal points.",
    "15 seconds per question. No answers accepted once the timer hits zero.",
  ],
  multi_tap: [
    "Each question has several correct answers hidden among decoys.",
    "Tap every option you think is correct \u2014 wrong taps cost nothing, so tap freely!",
    "Fastest team to find ALL correct answers gets the speed bonus.",
    "Watch out \u2014 in the last 5 questions of this round, a single wrong tap zeroes that question's score (Wipeout Mode).",
  ],
  music: [
    "Listen to the track, then answer the question about it.",
    "Same scoring as a normal round \u2014 fastest correct answer gets the speed bonus.",
  ],
  hard_deck: [
    "One team gets picked by the wheel to play.",
    "Guess Higher or Lower than the card shown \u2014 get it right, score points and keep going.",
    "After the first card, you can Stick with your points or Gamble for more.",
    "Wrong guess or a tie loses everything \u2014 bank it before it's too late!",
  ],
  spin_to_win: [
    "A bonus feature the host can offer manually after any correct answer \u2014 usually saved for the final question, giving the fastest team one last chance to steal a prize!",
    "Spin for a shot at big points... or a big penalty. Your choice \u2014 spin or pass!",
  ],
};

const ROUND_TYPE_LABEL: Record<string,string> = { regular: "General Knowledge", multi_tap: "Multi Tap", music: "Music Round" };

// Per-question-type timer defaults, confirmed by host: Multiple Choice,
// Sequence, Multi Tap, and Number need less thinking time than written
// text answers. Picture and Audio aren't in this map, so they fall back to
// the host's manual timer setting since those need variable time depending
// on content.
const TIMER_BY_TYPE: Record<string, number> = {
  multiple_choice: 15,
  sequence: 15,
  multi_tap: 15,
  number: 15,
  text_answer: 30,
};
function getTimerForQuestion(q: { question_type?: string } | null | undefined, fallback: number): number {
  if (!q || !q.question_type) return fallback;
  return TIMER_BY_TYPE[q.question_type] ?? fallback;
}


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
  const [timerDuration, setTimerDuration] = useState(30);
  const [dangerZone, setDangerZone] = useState(false);
  const [dangerPenalty, setDangerPenalty] = useState(5);
  const [wipeoutMode, setWipeoutMode] = useState(false);
  const [roundSettingsOpen, setRoundSettingsOpen] = useState(false);
  const [adjustTeam, setAdjustTeam] = useState<string|null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showScoreboardOnHandsets, setShowScoreboardOnHandsets] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [timeLeft, setTimeLeft] = useState(30);
  const [fastestTeam, setFastestTeam] = useState<string|null>(null);
  const fastestTeamRef = useRef<string | null>(null);
  // sessionIdRef: always current sessionId without stale closure risk,
  // used inside triggerSpinIfChosen so spin DB writes use .eq("id") like
  // every other host function (Hard Deck, scoreboard, questions etc).
  // Using .eq("pin", pin) in a closure was silently hitting 0 rows.
  const sessionIdRef = useRef<string | null>(null);
  const [fastestSong, setFastestSong] = useState<string|null>(null);
  const [spinOffered, setSpinOffered] = useState(false);
  const [spinChoice, setSpinChoice] = useState<string|null>(null);
  const [spinTargetIdx, setSpinTargetIdx] = useState<number | null>(null);
  const [spinNonce, setSpinNonce] = useState<number | null>(null);
  const [decisionMade, setDecisionMade] = useState(false);
  const [roundNumber, setRoundNumber] = useState(1);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const tickAudioRef = useRef<AudioContext|null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const victorySongRef = useRef<HTMLAudioElement|null>(null);
  const advancingRef = useRef(false);
  const spinTriggeredRef = useRef(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const roundStartedRef = useRef<number>(0);
  const quizEndRevealedRef = useRef<number>(0);
  const [venueName, setVenueName] = useState<string | null>(null);
  const lastDeltasRef = useRef<Record<string, number>>({});
  const [cardFlash, setCardFlash] = useState<{ team: string; type: string } | null>(null);
  const cardFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundQuestionsRef = useRef<Question[]>([]);

  const currentQ = selectedRound?.questions[qIdx] || null;
  const isLastQ = selectedRound ? qIdx >= selectedRound.questions.length - 1 : false;
  const [picSubPhase, setPicSubPhase] = useState<"image_only"|"question_visible">("image_only");

  useEffect(() => { loadRounds(); }, []);

  // Polling fallback for Spin to Win - the realtime listener in subscribeToUpdates
  // is the normal path, but unlike every other piece of synced state in this app
  // (answers, questions, scores all have a polling safety net), this had NONE -
  // it relied solely on a realtime UPDATE event ever reaching the host's browser.
  // If that websocket event is ever dropped or delayed, the host would never learn
  // the player chose to spin, and nothing downstream (display, handsets) would
  // ever fire either - this poll guarantees it gets picked up within ~1.5s either way.
  useEffect(() => {
    if (!spinOffered || !sessionPin) return;
    const interval = setInterval(async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.from("sessions").select("spin_choice").eq("pin", sessionPin).single();
      if (data) {
        setSpinChoice((data.spin_choice as string) || null);
        triggerSpinIfChosen((data.spin_choice as string) || null, sessionPin);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [spinOffered, sessionPin]);

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
  }, [hostPhase, selectedRound, qIdx, connected, answers, teams, currentQ, sessionId, sessionPin, pointsPerQ, timeBonus, timerDuration, dangerZone, dangerPenalty, wipeoutMode, timeLeft, isLastQ]);

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
    else if (hostPhase === "quiz_end") { doRevealNextTeam(); }
  }

  async function loadRounds() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("rounds").select("id, name, questions").order("created_at", { ascending: false });
    if (data) setRounds(data);
  }

  // Restores the host's local UI state from the session row in the database -
  // previously a host browser refresh reconnected to the right session but
  // showed a blank "Select round..." panel with no question/phase/timer state,
  // even though the live game (display screen, player phones) was still
  // running fine off the same session row the whole time. This is what makes
  // "refresh the host laptop mid-show" actually safe instead of disorienting.
  async function restoreSessionState(data: Record<string, unknown>) {
    const supabase = createSupabaseBrowserClient();
    if (data.round_id) {
      const { data: roundData } = await supabase.from("rounds").select("*").eq("id", data.round_id as string).maybeSingle();
      if (roundData) {
        setSelectedRound(roundData as Round);
        roundQuestionsRef.current = [...(roundData as Round).questions];
      }
    }
    if (typeof data.current_question_index === "number") setQIdx(data.current_question_index);
    if (typeof data.round_number === "number") setRoundNumber(data.round_number);
    if (data.fastest_team) { setFastestTeam(data.fastest_team as string); fastestTeamRef.current = data.fastest_team as string; }
    if (data.fastest_song) setFastestSong(data.fastest_song as string);
    const restoredPhase = (data.phase as string) || "waiting";
    setHostPhase(restoredPhase as HostPhase);

    // If a timer was actively running when the refresh happened, resume the
    // countdown from elapsed wall-clock time instead of either losing it
    // entirely or showing a frozen stale number.
    if (restoredPhase === "timer" && data.timer_started_at && data.timer_duration) {
      const elapsed = (Date.now() - new Date(data.timer_started_at as string).getTime()) / 1000;
      const remaining = Math.max(0, Math.ceil((data.timer_duration as number) - elapsed));
      setTimeLeft(remaining);
      if (remaining > 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          setTimeLeft(prev => {
            if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); stopTickAudio(); return 0; }
            return prev - 1;
          });
        }, 1000);
      }
    }
  }

  async function connectWithPin(p: string) {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("sessions").select("*").eq("pin", p.trim()).single();
    if (!data) return;
    setSessionPin(p.trim());
    setSessionId(data.id); sessionIdRef.current = data.id;
    setVenueName(data.venue_name || null);
    setConnected(true);
    loadTeams(p.trim());
    loadAnswers(p.trim(), (data.current_question_index as number) || 0);
    loadUnoCards(p.trim());
    loadScores(p.trim());
    subscribeToUpdates(p.trim());
    restoreSessionState(data);
  }

  async function connectToSession() {
    if (!pinInput.trim()) return;
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("sessions").select("*").eq("pin", pinInput.trim()).single();
    if (!data) { alert("Session not found!"); return; }
    setSessionPin(pinInput.trim());
    setSessionId(data.id); sessionIdRef.current = data.id;
    setVenueName(data.venue_name || null);
    setConnected(true);
    loadTeams(pinInput.trim());
    loadAnswers(pinInput.trim(), (data.current_question_index as number) || 0);
    loadUnoCards(pinInput.trim());
    loadScores(pinInput.trim());
    subscribeToUpdates(pinInput.trim());
    restoreSessionState(data);
  }

  async function loadTeams(pin: string) {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("teams").select("*").eq("session_pin", pin).order("created_at", { ascending: true });
    if (data) {
      setTeams(data);
      if (data.length > 0) ensureScores(pin, data);
    }
  }

  async function loadAnswers(pin: string, idx: number) {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("answers").select("*").eq("session_pin", pin).eq("question_index", idx).order("submitted_at", { ascending: true });
    if (data) setAnswers(data);
  }
  // Safety-net polling in case a realtime answer INSERT event is missed.
  // Previously skipped the "timer" phase entirely - the exact window when the
  // countdown is running and players are actively submitting, which is almost
  // certainly the real cause of "can't see player answers consistently" on the
  // host screen, since the poll only ever ran before the timer started or after
  // it had already ended.
  useEffect(() => {
    if (!sessionPin || !["question", "timer", "answer"].includes(hostPhase)) return;
    const interval = setInterval(() => { loadAnswers(sessionPin, qIdx); }, 2500);
    return () => clearInterval(interval);
  }, [sessionPin, qIdx, hostPhase]);

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

  function isFuzzyMatch(answer: string, correct: string, q?: Question): boolean {
    // For multiple choice, also accept the letter key
    if (q && q.question_type === "multiple_choice") {
      const key = answer.trim().toLowerCase();
      if (key === q.correct_answer.toLowerCase()) return true;
    }
    // Numbers must match exactly - no fuzzy/typo tolerance, a wrong digit is just wrong
    if (q && q.question_type === "number") {
      return answer.trim() === correct.trim();
    }
    const a = normalise(answer);
    const b = normalise(correct);
    if (a === b) return true;
    if (a === "" || b === "") return false;
    // Partial match: answer is contained in correct or vice versa - require a meaningful fraction, not just 3+ chars, to avoid false positives like "her" matching inside "Cher"
    if (b.includes(a) && a.length >= 4 && a.length >= b.length * 0.6) return true;
    if (a.includes(b) && b.length >= 4 && b.length >= a.length * 0.6) return true;
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
    if (q.question_type === "sequence") {
      const map: Record<string, string|null> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d };
      const order = q.correct_answer.split(",").map(s => s.trim().toLowerCase());
      const texts = order.map(key => map[key]).filter((t): t is string => !!t);
      if (texts.length === order.length) return texts.join(", ");
      return q.correct_answer;
    }
    return q.correct_answer;
  }

  // Single source of truth for "did this team get the question right", used by
  // BOTH autoScore (actual point-awarding) and doCelebrate (fastest-team display
  // and victory song/bonus eligibility). Previously doCelebrate used isFuzzyMatch
  // directly for every type, including Multi Tap - but Multi Tap answers are
  // comma-separated tap-key lists ("a,c,e"), not plain text, so fuzzy text
  // matching on them was essentially meaningless. That mismatch let a team that
  // didn't tap all the correct items still show up as "fastest", while the
  // actual scoring (correctly requiring all taps) could award them 0 points -
  // exactly the "fastest team got 0 points" / "wrong team got fastest" reports.
  function isAnswerCorrect(ans: Answer, q: Question): boolean {
    if (q.question_type === "multi_tap") {
      const correctKeys = (q.correct_answer||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
      const tappedKeys = (ans.answer_text||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
      const correctTaps = tappedKeys.filter(k => correctKeys.includes(k));
      return correctTaps.length === correctKeys.length && correctKeys.length > 0;
    }
    return isFuzzyMatch(ans.answer_text, getCorrectAnswerText(q), q);
  }

  async function autoScore(teamList: Team[], q: Question, currentAnswers: Answer[]) {
    if (!sessionPin) return;
    lastDeltasRef.current = {};
    const correctText = getCorrectAnswerText(q);
    const supabase = createSupabaseBrowserClient();
    const hasBoost = (teamName: string) => unoCards.some(c => c.team_name === teamName && c.card_type === "x2" && new Date(c.played_at).getTime() >= roundStartedRef.current);
    // If a network retry ever creates more than one answer row for the same
    // team+question, always treat the most recently submitted one as authoritative -
    // picking whichever row happened to come first in array order could silently
    // score against a stale/earlier answer while a different part of the app (e.g.
    // "fastest correct" determination) looked at a different row, disagreeing with
    // each other for no visible reason.
    function getLatestAnswer(teamName: string): Answer | undefined {
      const matches = currentAnswers.filter(a => a.team_name === teamName);
      if (matches.length === 0) return undefined;
      return matches.reduce((latest, a) => new Date(a.submitted_at).getTime() > new Date(latest.submitted_at).getTime() ? a : latest);
    }

    // Determine rank order of correct answers (by submission time) for rank-based bonus:
    // 1st correct = full bonus, 2nd = bonus-1, 3rd = bonus-2, etc., floored at 0.
    const correctEntries = teamList
      .map(team => {
        const ans = getLatestAnswer(team.team_name);
        if (!ans) return null;
        return isAnswerCorrect(ans, q) ? { teamName: team.team_name, submittedAt: new Date(ans.submitted_at).getTime() } : null;
      })
      .filter((e): e is { teamName: string; submittedAt: number } => e !== null)
      .sort((a, b) => a.submittedAt - b.submittedAt);

    const rankBonus: Record<string, number> = {};
    correctEntries.forEach((entry, idx) => {
      rankBonus[entry.teamName] = Math.max(0, timeBonus - idx);
    });

    for (const team of teamList) {
      const ans = getLatestAnswer(team.team_name);
      if (!ans) continue;
      if (q.question_type === "multi_tap") {
        const correctKeys = (q.correct_answer||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
        const tappedKeys = (ans.answer_text||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
        const correctTaps = tappedKeys.filter(k => correctKeys.includes(k));
        const wrongTaps = tappedKeys.filter(k => !correctKeys.includes(k));
        // Per the confirmed Multi Tap spec: each correct tap scores flat host-set
        // points, decoy/wrong taps cost nothing by default. Previously this also
        // credited the team for every decoy left untapped, which massively
        // over-awarded points (e.g. 2 correct + 4 decoys meant credit for 6
        // things instead of 2) - that was never the intended scoring rule.
        let mtBasePts = correctTaps.length * pointsPerQ;
        if (wipeoutMode && qIdx >= 5 && wrongTaps.length > 0) mtBasePts = 0;
        const mtTimeBonus = rankBonus[team.team_name] ?? 0;
        const mtDelta = (mtBasePts + mtTimeBonus) * (hasBoost(team.team_name) ? 2 : 1);
        lastDeltasRef.current[team.team_name] = mtDelta;
        if (mtDelta === 0) continue;
        const { data: existingMT } = await supabase.from("scores").select("total_points, round_points").eq("session_pin", sessionPin).eq("team_name", team.team_name).single();
        const currentTotalMT = existingMT?.total_points ?? 0;
        const currentRoundMT = existingMT?.round_points ?? 0;
        await supabase.from("scores").upsert({ session_pin: sessionPin, team_name: team.team_name, total_points: currentTotalMT + mtDelta, round_points: currentRoundMT + mtDelta, updated_at: new Date().toISOString() }, { onConflict: "session_pin,team_name" });
        continue;
      }
      const isCorrect = isFuzzyMatch(ans.answer_text, correctText, q);
      const isWrong = !isCorrect && ans.answer_text.trim() !== "";
      if (!isCorrect && !(isWrong && dangerZone)) continue;
      const timeBonusPts = rankBonus[team.team_name] ?? 0;
      const basePts = isCorrect ? pointsPerQ : 0;
      const penalty = isWrong && dangerZone ? -dangerPenalty : 0;
      const delta = (basePts + timeBonusPts) * (hasBoost(team.team_name) ? 2 : 1) + penalty;
      lastDeltasRef.current[team.team_name] = delta;
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
    setShowScoreboardOnHandsets(true);
  }

  async function hideScoreboardFromHandsets() {
    if (!sessionId) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ show_scoreboard: false }).eq("id", sessionId);
    setShowScoreboardOnHandsets(false);
  }

  async function doEndOfQuiz() {
    if (!sessionId) { alert("Not connected to a session - cannot end quiz."); return; }
    quizEndRevealedRef.current = 0;
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.from("sessions").update({ phase: "quiz_end", scoreboard_data: scores, quiz_end_revealed_count: 0, quiz_end_trophy_visible: false }).eq("id", sessionId).select();
    if (error) {
      console.error("doEndOfQuiz failed:", error);
      alert("Failed to end quiz: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      console.error("doEndOfQuiz matched zero rows for sessionId:", sessionId);
      alert("End Quiz didn't update - the session link may be stale. Try refreshing the host page.");
      return;
    }
    setHostPhase("quiz_end");
  }
  async function doRevealNextTeam() {
    if (!sessionId) return;
    const total = scores.length;
    const nextCount = Math.min(quizEndRevealedRef.current + 1, total);
    quizEndRevealedRef.current = nextCount;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ quiz_end_revealed_count: nextCount }).eq("id", sessionId);
    if (nextCount >= total) {
      setTimeout(async () => {
        await supabase.from("sessions").update({ quiz_end_trophy_visible: true }).eq("id", sessionId);
      }, 3000);
    }
  }

  function triggerSpinIfChosen(choice: string | null, pin: string) {
    if (choice === "spin" && !spinTriggeredRef.current) {
      spinTriggeredRef.current = true;
      const winIdx = Math.floor(Math.random() * 8);
      const nonce = Date.now() % 1000000; // Keep within integer column range
      // Set host-local state directly here rather than waiting on the realtime
      // subscription's echo of this same write - the 1500ms safety poll only
      // ever re-fetches the spin_choice column, so if the realtime UPDATE event
      // carrying spin_target_idx/spin_nonce is ever dropped or delayed, the
      // host's own compact SlotReels preview would otherwise never receive a
      // non-null targetIdx and would silently never animate.
      setSpinTargetIdx(winIdx);
      setSpinNonce(nonce);
      // Host animation is now triggered by the subscription echo of the DB write below,
      // same source as display and handset - achieving visual synchronisation.
      // Use pin (already verified above) rather than sessionId, which can be a stale
      // closure value if this listener was set up before sessionId finished loading -
      // that stale value was silently breaking the spin_to_win transition.
      // Use sessionIdRef.current (.eq("id")) not .eq("pin") - matches Hard Deck
      // and every other host function. .eq("pin") in a closure was silently
      // updating 0 rows, so only the host (using local state) saw the spin.
      const sid = sessionIdRef.current || sessionId;
      if (!sid) { console.error("triggerSpinIfChosen: no session ID available"); return; }
      console.log("triggerSpinIfChosen: writing spin_to_win to session", sid);
      createSupabaseBrowserClient().from("sessions")
        .update({ phase: "spin_to_win", spin_target_idx: winIdx, spin_nonce: nonce })
        .eq("id", sid)
        .then(({ error }) => {
          if (error) console.error("Failed to write spin_to_win phase:", error);
          else console.log("spin_to_win phase written — display and player phones should now spin");
        });
      if (fastestTeamRef.current) applySpinResult(winIdx, fastestTeamRef.current);
      setTimeout(() => {
        const finalSid = sessionIdRef.current || sessionId;
        // spin_offered must be cleared here too - previously only spin_choice/nonce/target
        // were reset, leaving spin_offered stuck true in the DB. That let the fastest
        // team's handset re-show the "SPIN TO WIN?" prompt after the spin had already
        // resolved, since its render condition only checks spinOffered && !spinChoice.
        if (finalSid) createSupabaseBrowserClient().from("sessions").update({ phase: "celebration", spin_offered: false, spin_choice: null, spin_nonce: null, spin_target_idx: null }).eq("id", finalSid).then(({ error }) => { if (error) console.error("SESSION UPDATE FAILED [spinTimeout]:", error); });
      }, 20000);
    }
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
        if (t.session_pin === pin) {
          setTeams(prev => [...prev, t]);
          // Create the score row immediately on join, not on first correct answer -
          // otherwise a team that joined after "Initialise Scores" was clicked, or
          // simply hasn't answered correctly yet, was invisible on the leaderboard
          // entirely (it only ever showed teams that already had a scores row).
          createSupabaseBrowserClient().from("scores").upsert(
            { session_pin: pin, team_name: t.team_name, total_points: 0, round_points: 0 },
            { onConflict: "session_pin,team_name", ignoreDuplicates: true }
          ).then(() => loadScores(pin));
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "uno_cards" }, (payload) => {
        setUnoCards(prev => [payload.new as UnoCard, ...prev]);
        const c = payload.new as UnoCard;
        if (cardFlashTimerRef.current) clearTimeout(cardFlashTimerRef.current);
        setCardFlash({ team: c.team_name, type: c.card_type });
        const cardSound = new Audio("/sounds/round-start.mp3");
        cardSound.volume = 0.7;
        cardSound.play().catch(() => {});
        cardFlashTimerRef.current = setTimeout(() => setCardFlash(null), 3000);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions" }, (payload) => {
        const s = payload.new as Record<string, unknown>;
        if (s.pin !== pin) return;
        const choice = (s.spin_choice as string) || null;
        setSpinChoice(choice);
        setSpinTargetIdx((s.spin_target_idx as number) ?? null);
        setSpinNonce((s.spin_nonce as number) ?? null);
        setSpinOffered(!!s.spin_offered);
        triggerSpinIfChosen(choice, pin);
      })
      .subscribe();
  }

  function stopTickAudio() {
    if (tickIntervalRef.current) { clearInterval(tickIntervalRef.current); tickIntervalRef.current = null; }
    if (tickAudioRef.current) { try { tickAudioRef.current.close(); } catch {} tickAudioRef.current = null; }
  }

  function startTickAudio(duration: number) {
    try {
      const ctx = tickAudioRef.current && tickAudioRef.current.state !== "closed" ? tickAudioRef.current : new AudioContext();
      tickAudioRef.current = ctx;
      ctx.resume();
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
    setFastestTeam(null); fastestTeamRef.current = null;
    setFastestSong(null);
    setTimeLeft(getTimerForQuestion(selectedRound.questions[0], timerDuration));
    setHostPhase("round_start");
    roundStartedRef.current = Date.now();
    playSound("round-start.mp3");
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ phase: "round_start", round_name: selectedRound.name, round_number: roundNumber, fastest_team: null, fastest_song: null }).eq("id", sessionId);
    // Reset round_points for the new round - previously this only happened if the
    // host remembered to click "Reset Round Points" manually, so the leaderboard's
    // "Rd: +X" figure could carry over and keep accumulating across the whole game
    // instead of reflecting just the round in progress.
    if (sessionPin) await resetRoundPoints();
  }

  async function doPreviewQuestion(idx: number) {
    if (!selectedRound || !sessionId) return;
    setQIdx(idx);
    setAnswers([]);
    setFastestTeam(null); fastestTeamRef.current = null;
    setFastestSong(null);
    setTimeLeft(getTimerForQuestion(selectedRound.questions[idx], timerDuration));
    setHostPhase("preview");
    setPicSubPhase("image_only");
    // Display screen stays on holding/waiting visually on the host side, but we
    // push phase: "waiting" to Supabase so player handsets reset off the
    // celebration screen back to the Quiz-It idle/logo screen during preview.
    const supabase = createSupabaseBrowserClient();
    const { error: prevErr } = await supabase.from("sessions").update({ phase: "waiting", fastest_team: null, fastest_song: null, spin_nonce: null, spin_target_idx: null, spin_choice: null }).eq("id", sessionId);
    if (prevErr) console.error("SESSION UPDATE FAILED [doPreviewQuestion]:", prevErr);
    if (sessionPin) loadAnswers(sessionPin, idx);
  }

  async function doSendQuestion() {
    if (!selectedRound || !sessionId) return;
    const q = selectedRound.questions[qIdx];
    setHostPhase("question");
    const isPicture = q.question_type === "picture";
    const supabase = createSupabaseBrowserClient();
    const { error: sendErr } = await supabase.from("sessions").update({ phase: "question", current_question: q, current_question_index: qIdx, fastest_team: null, fastest_song: null, picture_sub_phase: isPicture ? "image_only" : null }).eq("id", sessionId);
    if (sendErr) console.error("SESSION UPDATE FAILED [doSendQuestion]:", sendErr);
    // Record actual play-time usage for repeat-prevention - this only fires for
    // questions that came from (or were saved into) the library, i.e. have an id.
    // Older rounds generated before the library existed simply won't have one,
    // and are silently skipped here rather than causing an error.
    if (q.id) {
      supabase.from("game_history").insert({
        question_id: q.id,
        session_pin: sessionPin,
        venue_name: venueName || null,
        round_number: roundNumber,
      }).then(({ error }) => { if (error) console.error("Failed to log game_history:", error); });
      supabase.from("questions").select("times_used").eq("id", q.id).maybeSingle().then(({ data }) => {
        supabase.from("questions").update({
          times_used: ((data?.times_used as number) || 0) + 1,
          last_used_at: new Date().toISOString(),
        }).eq("id", q.id).then(({ error }) => { if (error) console.error("Failed to update question usage:", error); });
      });
    }
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
    const dur = getTimerForQuestion(currentQ, timerDuration);
    setTimeLeft(dur);
    const supabase = createSupabaseBrowserClient();
    const now = new Date().toISOString();
    // Check if a TIME-OUT card is pending — if so, activate the 10-second
    // lockout now (from timer start). On a 15-second question, other teams
    // are locked out for the first 10 seconds and only have 5 seconds left.
    const { data: sessionData } = await supabase
      .from("sessions").select("block_pending, block_team").eq("id", sessionId).single();
    const blockUpdate: Record<string, unknown> = { timer_started_at: now, timer_duration: dur };
    if (sessionData?.block_pending) {
      blockUpdate.block_until = new Date(Date.now() + 10000).toISOString();
      blockUpdate.block_pending = false;
    }
    await supabase.from("sessions").update(blockUpdate).eq("id", sessionId);
    startTickAudio(dur);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); stopTickAudio(); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function doRevealAnswer() {
    if (!currentQ || !sessionId || !sessionPin) return;
    if (timerRef.current) clearInterval(timerRef.current);
    stopTickAudio();
    setHostPhase("answer");
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ phase: "answer" }).eq("id", sessionId);
    // Fetch answers fresh from the DB right before scoring instead of trusting
    // the `answers` React state, which is fed by a realtime subscription plus a
    // 2.5s safety-net poll - if the host hits Reveal right after the last team
    // submits, that state can still be lagging the database by up to ~2.5s,
    // which silently scored against incomplete/stale data (missed points,
    // leaderboard reflecting an earlier question's submissions).
    const { data: freshAnswers } = await supabase.from("answers").select("*").eq("session_pin", sessionPin).eq("question_index", qIdx).order("submitted_at", { ascending: true });
    const answersToScore = freshAnswers ?? answers;
    setAnswers(answersToScore);
    await autoScore(teams, currentQ, answersToScore);
  }

  async function doCelebrate() {
    if (!sessionId) return;
    const correctAnswers = answers.filter(a =>
      currentQ && isAnswerCorrect(a, currentQ)
    ).sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
    const fastest = correctAnswers[0] || null;
    const fastestTeamName = fastest?.team_name || null;
    const team = teams.find(t => t.team_name === fastestTeamName);
    const song = team?.victory_song || null;
    const fastestPoints = fastestTeamName ? (lastDeltasRef.current[fastestTeamName] ?? 0) : 0;
    setFastestTeam(fastestTeamName); fastestTeamRef.current = fastestTeamName;
    setFastestSong(song);
    setSpinOffered(false);
    setSpinChoice(null);
    setDecisionMade(false);
    setHostPhase("celebration");
    const supabase = createSupabaseBrowserClient();
    const { error: celebErr } = await supabase.from("sessions").update({ phase: "celebration", fastest_team: fastestTeamName, fastest_song: song, fastest_points: fastestPoints, spin_offered: false, spin_choice: null }).eq("id", sessionId);
    if (celebErr) console.error("SESSION UPDATE FAILED [doCelebrate]:", celebErr);
    // Victory song now plays only on the display screen to avoid duplicate/echoing audio
  }

  async function applySpinResult(winIdx: number, teamName: string) {
    const supabase = createSupabaseBrowserClient();
    const { data: allScores } = await supabase.from("scores").select("team_name, total_points, round_points").eq("session_pin", sessionPin);
    if (!allScores) return;
    const others = allScores.filter(s => s.team_name !== teamName).sort((a, b) => b.total_points - a.total_points);
    const mine = allScores.find(s => s.team_name === teamName);
    const myTotal = mine?.total_points ?? 0;
    const myRound = mine?.round_points ?? 0;
    const label = SLOT_SEGS[winIdx]?.label;
    let newTotal = myTotal;
    // Numeric outcomes are a straightforward add/subtract, floored at 0.
    if (label === "+50 Points") newTotal = myTotal + 50;
    else if (label === "-10 Points") newTotal = Math.max(0, myTotal - 10);
    else if (label === "-20 Points") newTotal = Math.max(0, myTotal - 20);
    else if (label === "-30 Points") newTotal = Math.max(0, myTotal - 30);
    // Rank outcomes slot the team in 1 point above/below whoever currently holds
    // the position next to that rank, so they land exactly on it.
    else if (label === "1st Place") newTotal = (others[0]?.total_points ?? 0) + 1;
    else if (label === "2nd Place") newTotal = others.length >= 2 ? others[1].total_points + 1 : Math.max(0, (others[0]?.total_points ?? 1) - 1);
    else if (label === "3rd Place") newTotal = others.length >= 3 ? others[2].total_points + 1 : Math.max(0, (others[others.length - 1]?.total_points ?? 1) - 1);
    else if (label === "Last Place") newTotal = Math.max(0, (others[others.length - 1]?.total_points ?? 1) - 1);
    const delta = newTotal - myTotal;
    if (delta === 0) return;
    await supabase.from("scores").upsert(
      { session_pin: sessionPin, team_name: teamName, total_points: newTotal, round_points: myRound + delta, updated_at: new Date().toISOString() },
      { onConflict: "session_pin,team_name" }
    );
  }

  async function doOfferSpinToWin() {
    if (!sessionId) return;
    spinTriggeredRef.current = false;
    setSpinOffered(true);
    setDecisionMade(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ spin_offered: true, spin_choice: null }).eq("id", sessionId);
  }

  function doCelebratePlain() {
    setDecisionMade(true);
  }

  async function doEndRound() {
    if (!sessionId) return;
    stopVictorySong();
    stopTickAudio();
    setHostPhase("round_end");
    playSound("round-end.mp3");
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ phase: "intermission" }).eq("id", sessionId);
    setRoundNumber(prev => prev + 1);
  }

  async function doDumpQuestion() {
    if (!confirm("Skip this question without scoring it? It stays in the round for next time - it just won't be played tonight.")) return;
    if (!selectedRound || !sessionId) return;
    const nextIdx = qIdx + 1;
    if (nextIdx >= selectedRound.questions.length) {
      doEndRound();
      return;
    }
    await doPreviewQuestion(nextIdx);
  }

  const teamHasAnswered = (teamName: string) => answers.some(a => a.team_name === teamName);
  const teamAnswer = (teamName: string) => answers.find(a => a.team_name === teamName)?.answer_text || "";
  const teamCardsUsed = (teamName: string) => new Set(unoCards.filter(c => c.team_name === teamName).map(c => c.card_type));
  const PowerCardDots = ({ teamName }: { teamName: string }) => {
    const used = teamCardsUsed(teamName);
    return (
      <div style={{ display:"flex", gap:4 }}>
        {(["block","reverse","x2"] as const).map(ct => (
          <span key={ct} title={cardLabel[ct] + (used.has(ct) ? " (used)" : " (available)")}
            style={{ width:8, height:8, borderRadius:"50%", background: used.has(ct) ? "rgba(255,255,255,0.12)" : cardColor[ct], border: used.has(ct) ? "1px solid rgba(255,255,255,0.15)" : "none" }} />
        ))}
      </div>
    );
  };

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
      {cardFlash && (
        cardFlash.type === "reverse" ? (
          <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", zIndex:9999, padding:"18px 40px", borderRadius:16, background:"rgba(239,68,68,0.22)", border:"3px solid #ef4444", color:"#fff", fontSize:22, fontWeight:900, letterSpacing:1.5, boxShadow:"0 0 40px rgba(239,68,68,0.6)" }}>
            ↻ {cardFlash.team} PLAYED REVERSE! ↻
          </div>
        ) : cardFlash.type === "block" ? (
          <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", zIndex:9999, padding:"16px 36px", borderRadius:14, background:"rgba(59,130,246,0.22)", border:"3px solid #3b82f6", color:"#fff", fontSize:19, fontWeight:900, letterSpacing:1.2, boxShadow:"0 0 32px rgba(59,130,246,0.6)" }}>
            ⏸ {cardFlash.team} PLAYED TIME-OUT! ⏸
          </div>
        ) : (
          <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", zIndex:9999, padding:"16px 36px", borderRadius:14, background:"rgba(234,179,8,0.22)", border:"3px solid #eab308", color:"#fff", fontSize:19, fontWeight:900, letterSpacing:1.2, boxShadow:"0 0 32px rgba(234,179,8,0.6)" }}>
            ⚡ {cardFlash.team} PLAYED BOOST! ⚡
          </div>
        )
      )}
      {/* HEADER */}
      <div style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 24px", borderBottom:"1px solid rgba(190,38,193,0.25)", background:"linear-gradient(180deg, rgba(26,5,53,0.85) 0%, rgba(13,2,37,0.85) 100%)", backdropFilter:"blur(12px)", flexWrap:"wrap" as const }}>
        <div style={{ width:34, height:34, borderRadius:"50%", flexShrink:0, border:"1.5px solid #BE26C1", boxShadow:"0 0 12px rgba(190,38,193,0.5)", display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(190,38,193,0.08)", overflow:"hidden" as const }}>
          <img src="/me-logo.jpg" alt="ME" style={{ width:"100%", height:"100%", objectFit:"cover" as const }} />
        </div>
        <div style={{ fontSize:16, fontWeight:700, color:"#BE26C1", letterSpacing:3 }}>Quiz Controller</div>
        <div style={{ padding:"4px 12px", borderRadius:999, background:"rgba(190,38,193,0.12)", border:"1px solid rgba(190,38,193,0.4)", fontSize:11, fontWeight:700, letterSpacing:1, color:"#BE26C1" }}>PIN: {sessionPin}</div>
        <div style={{ padding:"4px 12px", borderRadius:999, fontSize:11, fontWeight:700, letterSpacing:1, background:phaseBg, color:phaseColor, border:"1px solid rgba(255,255,255,0.12)", boxShadow:"0 0 10px "+phaseBg }}>
          {hostPhase.toUpperCase().replace("_"," ")}{hostPhase==="timer" ? " "+timeLeft+"s" : ""}
        </div>
        {selectedRound && (
          <div style={{ padding:"4px 14px", borderRadius:999, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.18)", fontSize:13, fontWeight:800, color:"#fff", letterSpacing:0.5 }}>
            Q {qIdx+1} <span style={{ color:"rgba(255,255,255,0.4)", fontWeight:400 }}>of {selectedRound.questions.length}</span>
          </div>
        )}
        <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", letterSpacing:1, flex:1, textAlign:"center" as const }}>{spacebarHint}</div>
        <select value={selectedRound?.id||""} onChange={e => {
          const r = rounds.find(x=>x.id===e.target.value);
          setSelectedRound(r||null); setQIdx(0); setAnswers([]); setHostPhase("waiting");
          roundQuestionsRef.current = r ? [...r.questions] : [];
          if (sessionId) createSupabaseBrowserClient().from("sessions").update({ round_id: r?.id || null }).eq("id", sessionId);
        }}
          style={{ padding:"6px 12px", borderRadius:10, background:"rgba(255,255,255,0.06)", color:"#fff", border:"1px solid rgba(190,38,193,0.35)", fontSize:12, cursor:"pointer" }}>
          <option value="">Select round...</option>
          {rounds.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button onClick={() => setRulesOpen(true)} style={{ padding:"6px 14px", borderRadius:10, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(190,38,193,0.35)", color:"#BE26C1", fontSize:12, cursor:"pointer", fontWeight:600 }}>{"\u{1F4CB}"} Rules</button>
        {rulesOpen && (
          <div onClick={() => setRulesOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
            <div onClick={e => e.stopPropagation()} style={{ background:"#1a0535", border:"2px solid #BE26C1", borderRadius:16, padding:28, maxWidth:560, maxHeight:"80vh", overflowY:"auto" as const, color:"#fff" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                <div style={{ fontSize:20, fontWeight:700, color:"#BE26C1", letterSpacing:2 }}>Rules</div>
                <button onClick={() => setRulesOpen(false)} style={{ background:"transparent", border:"none", color:"rgba(255,255,255,0.5)", fontSize:20, cursor:"pointer" }}>{"\u00D7"}</button>
              </div>

              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#facc15", letterSpacing:2, marginBottom:8 }}>HOUSE RULES</div>
                <ul style={{ margin:0, paddingLeft:20, fontSize:14, lineHeight:1.6 }}>
                  {RULES.house.map((r,i) => <li key={i}>{r}</li>)}
                </ul>
              </div>

              {selectedRound && (() => {
                const rt = selectedRound.questions[0]?.round_type || "regular";
                const key = (rt === "multi_tap" || rt === "music") ? rt : "regular";
                return (
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"#facc15", letterSpacing:2, marginBottom:8 }}>{(ROUND_TYPE_LABEL[key]||"GENERAL KNOWLEDGE").toUpperCase()} \u2014 CURRENT ROUND</div>
                    <ul style={{ margin:0, paddingLeft:20, fontSize:14, lineHeight:1.6 }}>
                      {RULES[key as keyof typeof RULES].map((r,i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                );
              })()}

              {selectedRound && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#facc15", letterSpacing:2, marginBottom:8 }}>THE HARD DECK</div>
                  <ul style={{ margin:0, paddingLeft:20, fontSize:14, lineHeight:1.6 }}>
                    {RULES.hard_deck.map((r,i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}

              {selectedRound && (
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#facc15", letterSpacing:2, marginBottom:8 }}>SPIN TO WIN</div>
                  <ul style={{ margin:0, paddingLeft:20, fontSize:14, lineHeight:1.6 }}>
                    {RULES.spin_to_win.map((r,i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
        {sessionId && <HardDeckPanel sessionId={sessionId} sessionPin={sessionPin} teams={teams} onScoreChange={() => loadScores(sessionPin)} />}
        <a href="/host/display" target="_blank" style={{ padding:"6px 14px", borderRadius:10, background:"#BE26C1", color:"#fff", textDecoration:"none", fontSize:11, fontWeight:700, letterSpacing:0.5, boxShadow:"0 0 12px rgba(190,38,193,0.4)" }}>Display</a>
      </div>

      {/* SCOREBOARD BUTTONS BAR */}
      <div style={{ display:"flex", gap:10, padding:"10px 20px", borderBottom:"1px solid rgba(190,38,193,0.15)", background:"rgba(20,5,50,0.4)", alignItems:"center", flexWrap:"wrap" as const }}>
        <span style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.35)", letterSpacing:2, marginRight:4 }}>SCOREBOARD:</span>
        <button onClick={showScoreboardOnHandsets ? hideScoreboardFromHandsets : pushScoreboardToHandsets} style={{ padding:"7px 16px", borderRadius:10, background:showScoreboardOnHandsets?"rgba(34,197,94,0.3)":"rgba(56,189,248,0.2)", border:"1px solid "+(showScoreboardOnHandsets?"#22c55e":"rgba(56,189,248,0.5)"), color:showScoreboardOnHandsets?"#22c55e":"#38bdf8", fontSize:11, fontWeight:600, cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,0.2)" }}>{showScoreboardOnHandsets ? "Hide from Handsets" : "Send to Handsets"}</button>
        <button onClick={showScoreboard ? hideScoreboard : pushScoreboardToScreen} style={{ padding:"7px 16px", borderRadius:10, background:showScoreboard?"rgba(34,197,94,0.3)":"rgba(190,38,193,0.3)", border:"1px solid "+(showScoreboard?"#22c55e":"#BE26C1"), color:showScoreboard?"#22c55e":"#fff", fontSize:11, fontWeight:600, cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,0.2)" }}>{showScoreboard ? "Hide from Screen" : "Show on Screen"}</button>
        <button onClick={doEndOfQuiz} style={{ padding:"10px 20px", borderRadius:8, background:"rgba(251,191,36,0.25)", border:"2px solid #fbbf24", color:"#fbbf24", fontSize:14, fontWeight:700, letterSpacing:1, cursor:"pointer", marginLeft:"auto", boxShadow:"0 0 16px rgba(251,191,36,0.3)" }}>{"\u{1F3C1}"} End Quiz</button>
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
              <div style={{ fontSize:16, color:"rgba(255,255,255,0.4)", marginBottom:24 }}>Leaderboard reveal is live on the display screen</div>
              <button onClick={doRevealNextTeam} style={{ padding:"16px 40px", borderRadius:14, background:"#BE26C1", border:"none", color:"#fff", fontSize:18, fontWeight:700, letterSpacing:2, cursor:"pointer", marginBottom:12, boxShadow:"0 0 24px rgba(190,38,193,0.5)" }}>Reveal Next Team</button>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)", letterSpacing:2, marginBottom:24 }}>or press SPACE</div>
              <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
                <button onClick={() => downloadWinnerCard(scores, teams, venueName, "vertical")} style={{ padding:"10px 20px", borderRadius:10, background:"rgba(190,38,193,0.25)", border:"1px solid #BE26C1", color:"#fff", fontSize:13, cursor:"pointer" }}>Download Share Card (Story)</button>
                <button onClick={() => downloadWinnerCard(scores, teams, venueName, "square")} style={{ padding:"10px 20px", borderRadius:10, background:"rgba(190,38,193,0.25)", border:"1px solid #BE26C1", color:"#fff", fontSize:13, cursor:"pointer" }}>Download Share Card (Post)</button>
              </div>
            </div>
          ) : hostPhase === "celebration" ? (
            <div style={{ textAlign:"center", marginTop:60 }}>
              <div style={{ fontSize:72, marginBottom:16 }}>🎉</div>
              {currentQ && (
                <div style={{ padding:"16px 20px", borderRadius:12, background:"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.4)", marginBottom:24, maxWidth:480, marginLeft:"auto", marginRight:"auto", textAlign:"left" as const }}>
                  <div style={{ fontSize:12, color:"rgba(34,197,94,0.7)", marginBottom:4, letterSpacing:2 }}>ANSWER</div>
                  <div style={{ fontSize:24, fontWeight:700, color:"#22c55e" }}>{getCorrectAnswerText(currentQ)}</div>
                  {currentQ.explanation && <div style={{ fontSize:14, color:"rgba(255,255,255,0.6)", marginTop:8 }}>{currentQ.explanation}</div>}
                </div>
              )}
              {fastestTeam && <div style={{ fontSize:14, letterSpacing:3, color:"rgba(255,255,255,0.4)", marginBottom:12 }}>FASTEST CORRECT ANSWER</div>}
              {fastestTeam ? (
                <>
                  <div style={{ fontSize:42, fontWeight:800, color:"#BE26C1", letterSpacing:2, textShadow:"0 0 40px rgba(190,38,193,0.7)", marginBottom:8 }}>{fastestTeam}</div>
                  <div style={{ fontSize:16, color:"rgba(255,255,255,0.5)", marginBottom:32 }}>Victory song playing...</div>
                  {!decisionMade && (
                    <div style={{ display:"flex", gap:12, justifyContent:"center", marginBottom:24 }}>
                      <button onClick={doCelebratePlain} style={{ padding:"10px 20px", borderRadius:10, background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.2)", color:"#fff", fontSize:14, cursor:"pointer" }}>Just Celebrate</button>
                      <button onClick={doOfferSpinToWin} style={{ padding:"10px 20px", borderRadius:10, background:"rgba(190,38,193,0.3)", border:"1px solid #BE26C1", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>Offer Spin to Win</button>
                    </div>
                  )}
                  {spinOffered && !spinChoice && (
                    <div style={{ fontSize:18, color:"#facc15", fontWeight:700, marginBottom:24 }}>{fastestTeam}, Spin to Win?</div>
                  )}
                  {spinChoice === "spin" && (
                    <div style={{ width:"100%", maxWidth:420, margin:"0 auto 16px" }}>
                      <SlotReels targetIdx={spinTargetIdx} spinNonce={spinNonce} teamName={fastestTeam || "Team"} size="compact" audioEnabled={false} />
                    </div>
                  )}
                  <button onClick={() => { if (isLastQ) doEndRound(); else doPreviewQuestion(qIdx + 1); }} style={{ padding:"12px 32px", borderRadius:10, background:"rgba(190,38,193,0.3)", border:"1px solid #BE26C1", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", marginBottom:24, marginTop:16 }}>Continue ▶</button>
                  {spinChoice === "pass" && (
                    <div style={{ fontSize:16, color:"rgba(255,255,255,0.5)", marginBottom:24 }}>{fastestTeam} passed</div>
                  )}
                </>
              ) : (
                <div style={{ fontSize:24, color:"rgba(255,255,255,0.4)", marginBottom:32 }}>No correct answers this round</div>
              )}
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)", letterSpacing:2 }}>{isLastQ ? "SPACE: End Round" : "SPACE: Preview Next Question"}</div>
            </div>
          ) : !currentQ ? (
            <div style={{ textAlign:"center", marginTop:80, color:"rgba(255,255,255,0.4)", fontSize:18 }}>No questions in this round</div>
          ) : (
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, flexWrap:"wrap" as const }}>
                <span style={{ background:"rgba(190,38,193,0.2)", border:"1px solid rgba(190,38,193,0.4)", color:"#BE26C1", padding:"5px 16px", borderRadius:999, fontSize:13, fontWeight:700 }}>Q{qIdx+1} of {selectedRound.questions.length}</span>
                <span style={{ background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.15)", color:typeColor[currentQ.question_type]||"#aaa", padding:"5px 16px", borderRadius:999, fontSize:13, fontWeight:600 }}>{typeLabel[currentQ.question_type]||currentQ.question_type}</span>
                <span style={{ fontSize:13, color:"rgba(255,255,255,0.5)" }}>{currentQ.difficulty}</span>
                {hostPhase === "preview" && <span style={{ padding:"5px 16px", borderRadius:999, background:"rgba(56,189,248,0.2)", border:"1px solid rgba(56,189,248,0.5)", fontSize:12, color:"#38bdf8" }}>HOST PREVIEW — not sent yet</span>}
                {hostPhase === "timer" && (
                  <div style={{ marginLeft:"auto", width:52, height:52, borderRadius:"50%", background:timeLeft<=3?"rgba(239,68,68,0.3)":"rgba(190,38,193,0.2)", border:"3px solid "+(timeLeft<=3?"#ef4444":"#BE26C1"), display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:800, color:timeLeft<=3?"#ef4444":"#BE26C1" }}>{timeLeft}</div>
                )}
              </div>

              <div style={{ fontSize:28, fontWeight:800, lineHeight:1.4, marginBottom:24, color:"#fff", textShadow:"0 2px 12px rgba(0,0,0,0.3)" }}>{currentQ.question_text.replace(/^Play this track:\s*/i, "").replace(/^Show teams this image:\s*/i, "")}</div>

              {currentQ.question_type==="multiple_choice" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
                  {(["a","b","c","d"] as const).map(l => {
                    const opt = currentQ[("option_"+l) as keyof Question] as string;
                    const isCorrect = l===currentQ.correct_answer.toLowerCase();
                    const showCorrect = (hostPhase==="answer"||hostPhase==="preview") && isCorrect;
                    return opt ? (
                      <div key={l} style={{ padding:"14px 18px", borderRadius:12, background:showCorrect?"rgba(34,197,94,0.2)":"rgba(255,255,255,0.06)", border:"2px solid "+(showCorrect?"#22c55e":"rgba(255,255,255,0.15)"), fontSize:15, boxShadow:showCorrect?"0 0 16px rgba(34,197,94,0.3)":"none" }}>
                        <span style={{ color:"#BE26C1", fontWeight:800, marginRight:8 }}>{l.toUpperCase()}.</span>
                        <span style={{ color:"#fff", fontWeight:600 }}>{opt}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              )}

              {currentQ.question_type==="multi_tap" && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
                  {(["a","b","c","d","e","f"] as const).map(l => {
                    const opt = currentQ[("option_"+l) as keyof Question] as string | null;
                    if (!opt) return null;
                    const isCorrect = (currentQ.correct_answer||"").split(",").map(s=>s.trim().toLowerCase()).includes(l);
                    const showCorrect = (hostPhase==="answer"||hostPhase==="preview") && isCorrect;
                    return (
                      <div key={l} style={{ padding:"14px 18px", borderRadius:12, background:showCorrect?"rgba(34,197,94,0.2)":"rgba(255,255,255,0.06)", border:"2px solid "+(showCorrect?"#22c55e":"rgba(255,255,255,0.15)"), fontSize:15, boxShadow:showCorrect?"0 0 16px rgba(34,197,94,0.3)":"none" }}>
                        <span style={{ color:"#BE26C1", fontWeight:800, marginRight:8 }}>{l.toUpperCase()}.</span>
                        <span style={{ color:"#fff", fontWeight:600 }}>{opt}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {currentQ.question_type==="sequence" && (
                <div style={{ marginBottom:20 }}>
                  {[currentQ.option_a,currentQ.option_b,currentQ.option_c,currentQ.option_d].filter(Boolean).map((item,i) => (
                    <div key={i} style={{ padding:"12px 18px", borderRadius:10, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)", marginBottom:6, display:"flex", gap:10, fontSize:15 }}>
                      <span style={{ color:"#BE26C1", fontWeight:800, minWidth:24 }}>{i+1}.</span>{item}
                    </div>
                  ))}
                </div>
              )}

              {currentQ.question_type==="audio" && currentQ.option_b && (
                <div style={{ marginBottom:20 }}>
                  {currentQ.option_b.includes("youtube.com") ? (
                    <a href={currentQ.option_b} target="_blank" rel="noopener noreferrer"
                      style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"14px 26px", borderRadius:12, background:"rgba(251,146,60,0.2)", border:"1px solid rgba(251,146,60,0.5)", color:"#fb923c", textDecoration:"none", fontSize:16, fontWeight:600 }}>
                      Play on YouTube
                    </a>
                  ) : (
                    <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"14px 26px", borderRadius:12, background:"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.4)", color:"#4ade80", fontSize:14, fontWeight:600 }}>
                      \u266a Auto-playing on display screen ({currentQ.playback_mode === "manual" ? "manual play button" : "auto-play"})
                    </div>
                  )}
                </div>
              )}

              {hostPhase==="answer" && (
                <div style={{ padding:"16px 20px", borderRadius:12, background:"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.4)", marginBottom:20 }}>
                  <div style={{ fontSize:12, color:"rgba(34,197,94,0.7)", marginBottom:4, letterSpacing:2 }}>ANSWER</div>
                  <div style={{ fontSize:24, fontWeight:700, color:"#22c55e" }}>{getCorrectAnswerText(currentQ)}</div>
                  {currentQ.explanation && <div style={{ fontSize:14, color:"rgba(255,255,255,0.6)", marginTop:8 }}>{currentQ.explanation}</div>}
                </div>
              )}

              <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const, marginTop:20, paddingTop:20, borderTop:"1px solid rgba(255,255,255,0.08)" }}>
                <button onClick={doStartRound}
                  style={{ padding:"11px 22px", borderRadius:10, background:"rgba(251,146,60,0.3)", border:"1px solid rgba(251,146,60,0.6)", color:"#fb923c", cursor:"pointer", fontSize:13, fontWeight:700, boxShadow:"0 2px 8px rgba(0,0,0,0.2)" }}>
                  Start Round
                </button>
                <button onClick={() => doPreviewQuestion(qIdx)} disabled={hostPhase==="preview"}
                  style={{ padding:"11px 22px", borderRadius:10, background:hostPhase==="preview"?"rgba(255,255,255,0.04)":"rgba(56,189,248,0.2)", border:"1px solid "+(hostPhase==="preview"?"rgba(255,255,255,0.1)":"rgba(56,189,248,0.5)"), color:hostPhase==="preview"?"rgba(255,255,255,0.3)":"#38bdf8", cursor:hostPhase==="preview"?"not-allowed":"pointer", fontSize:13, fontWeight:700, boxShadow:hostPhase==="preview"?"none":"0 2px 8px rgba(0,0,0,0.2)" }}>
                  Preview Q
                </button>
                <button onClick={doSendQuestion} disabled={hostPhase!=="preview"}
                  style={{ padding:"11px 22px", borderRadius:10, background:hostPhase==="preview"?"rgba(190,38,193,0.4)":"rgba(255,255,255,0.04)", border:"1px solid "+(hostPhase==="preview"?"#BE26C1":"rgba(255,255,255,0.1)"), color:hostPhase==="preview"?"#fff":"rgba(255,255,255,0.3)", cursor:hostPhase==="preview"?"pointer":"not-allowed", fontSize:13, fontWeight:700, boxShadow:hostPhase==="preview"?"0 2px 8px rgba(0,0,0,0.2)":"none" }}>
                  Send Live
                </button>
                <button onClick={doStartTimer} disabled={hostPhase==="timer"}
                  style={{ padding:"11px 22px", borderRadius:10, background:hostPhase==="timer"?"rgba(255,255,255,0.04)":"rgba(251,191,36,0.3)", border:"1px solid "+(hostPhase==="timer"?"rgba(255,255,255,0.1)":"rgba(251,191,36,0.6)"), color:hostPhase==="timer"?"rgba(255,255,255,0.3)":"#fbbf24", cursor:hostPhase==="timer"?"not-allowed":"pointer", fontSize:13, fontWeight:700, boxShadow:hostPhase==="timer"?"none":"0 2px 8px rgba(0,0,0,0.2)" }}>
                  {hostPhase==="timer" ? timeLeft+"s" : "Timer"}
                </button>
                <button onClick={doRevealAnswer} disabled={hostPhase==="answer"}
                  style={{ padding:"11px 22px", borderRadius:10, background:hostPhase==="answer"?"rgba(255,255,255,0.04)":"rgba(34,197,94,0.3)", border:"1px solid "+(hostPhase==="answer"?"rgba(255,255,255,0.1)":"rgba(34,197,94,0.6)"), color:hostPhase==="answer"?"rgba(255,255,255,0.3)":"#22c55e", cursor:hostPhase==="answer"?"not-allowed":"pointer", fontSize:13, fontWeight:700, boxShadow:hostPhase==="answer"?"none":"0 2px 8px rgba(0,0,0,0.2)" }}>
                  Reveal
                </button>
                <button onClick={doCelebrate}
                  style={{ padding:"11px 22px", borderRadius:10, background:"rgba(251,191,36,0.2)", border:"1px solid rgba(251,191,36,0.5)", color:"#fbbf24", cursor:"pointer", fontSize:13, fontWeight:700, boxShadow:"0 2px 8px rgba(0,0,0,0.2)" }}>
                  Celebrate
                </button>
                <div style={{ width:1, height:28, background:"rgba(255,255,255,0.15)", margin:"0 6px" }} />
                <button onClick={doDumpQuestion} title="Skip this question without scoring it - stays in the round for next time"
                  style={{ padding:"9px 16px", borderRadius:10, background:"transparent", border:"1px solid rgba(239,68,68,0.35)", color:"rgba(239,68,68,0.7)", cursor:"pointer", fontSize:11, fontWeight:600 }}>
                  Dump Q
                </button>
                <div style={{ width:1, height:28, background:"rgba(255,255,255,0.15)", margin:"0 6px" }} />
                {isLastQ ? (
                  <button onClick={doEndRound}
                    style={{ padding:"11px 22px", borderRadius:10, background:"rgba(248,113,113,0.3)", border:"1px solid #f87171", color:"#f87171", cursor:"pointer", fontSize:13, fontWeight:700, marginLeft:"auto", boxShadow:"0 2px 8px rgba(0,0,0,0.2)" }}>
                    End Round
                  </button>
                ) : (
                  <button onClick={() => doPreviewQuestion(qIdx+1)}
                    style={{ padding:"11px 22px", borderRadius:10, background:"#BE26C1", border:"none", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700, marginLeft:"auto", boxShadow:"0 2px 8px rgba(0,0,0,0.2)" }}>
                    Next Q
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div style={{ overflowY:"auto" as const, display:"flex", flexDirection:"column" as const }}>
          <div style={{ padding:"14px 18px", borderBottom:"1px solid rgba(190,38,193,0.2)", background:"rgba(45,10,94,0.4)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <div style={{ fontSize:13, fontWeight:800, color:"#BE26C1", letterSpacing:2 }}>ROUND SETTINGS</div>
              <button onClick={() => setRoundSettingsOpen((p: boolean) => !p)} style={{ fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:8, background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.2)", color:"#fff", cursor:"pointer" }}>{roundSettingsOpen ? "Hide" : "Edit"}</button>
            </div>
            {roundSettingsOpen && (
              <div style={{ display:"flex", flexDirection:"column" as const, gap:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ fontSize:12, color:"rgba(255,255,255,0.65)", minWidth:110 }}>Points/question</label>
                  <input type="number" value={pointsPerQ} onChange={e => setPointsPerQ(Number(e.target.value))} style={{ width:60, padding:"5px 8px", borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff", border:"1px solid rgba(190,38,193,0.4)", fontSize:14, textAlign:"center" as const }} />
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ fontSize:12, color:"rgba(255,255,255,0.65)", minWidth:110 }}>Timer - Picture/Audio (s)</label>
                  <input type="number" value={timerDuration} onChange={e => setTimerDuration(Number(e.target.value))} style={{ width:60, padding:"5px 8px", borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff", border:"1px solid rgba(190,38,193,0.4)", fontSize:14, textAlign:"center" as const }} />
                </div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>Multiple Choice/Sequence/Multi Tap/Number = 15s, written answers = 30s (fixed)</div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ fontSize:12, color:"rgba(255,255,255,0.65)", minWidth:110 }}>Max time bonus</label>
                  <input type="number" value={timeBonus} onChange={e => setTimeBonus(Number(e.target.value))} style={{ width:60, padding:"5px 8px", borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff", border:"1px solid rgba(190,38,193,0.4)", fontSize:14, textAlign:"center" as const }} />
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ fontSize:12, color:"rgba(255,255,255,0.65)", minWidth:110 }}>Danger Zone</label>
                  <button onClick={() => setDangerZone((p: boolean) => !p)} style={{ padding:"5px 14px", borderRadius:8, background:dangerZone?"rgba(239,68,68,0.3)":"rgba(255,255,255,0.08)", border:"1px solid "+(dangerZone?"#ef4444":"rgba(255,255,255,0.2)"), color:dangerZone?"#ef4444":"#aaa", fontSize:12, fontWeight:600, cursor:"pointer" }}>{dangerZone ? "ON" : "OFF"}</button>
                </div>
                {dangerZone && (
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <label style={{ fontSize:12, color:"rgba(255,255,255,0.65)", minWidth:110 }}>Penalty pts</label>
                    <input type="number" value={dangerPenalty} onChange={e => setDangerPenalty(Number(e.target.value))} style={{ width:60, padding:"5px 8px", borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff", border:"1px solid rgba(239,68,68,0.4)", fontSize:14, textAlign:"center" as const }} />
                  </div>
                )}
                {currentQ?.question_type === "multi_tap" && (
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <label style={{ fontSize:12, color:"rgba(255,255,255,0.65)", minWidth:110 }}>Wipeout Mode</label>
                    <button onClick={() => setWipeoutMode((p: boolean) => !p)} style={{ padding:"5px 14px", borderRadius:8, background:wipeoutMode?"rgba(239,68,68,0.3)":"rgba(255,255,255,0.08)", border:"1px solid "+(wipeoutMode?"#ef4444":"rgba(255,255,255,0.2)"), color:wipeoutMode?"#ef4444":"#aaa", fontSize:12, fontWeight:600, cursor:"pointer" }}>{wipeoutMode ? "ON" : "OFF"}</button>
                    <span style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>Q6-10 only: wrong tap zeroes that question</span>
                  </div>
                )}
                <button onClick={resetRoundPoints} style={{ padding:"7px 14px", borderRadius:8, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.55)", fontSize:12, fontWeight:600, cursor:"pointer", marginTop:4 }}>Reset Round Points</button>
              </div>
            )}
            {!roundSettingsOpen && (
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.45)" }}>{pointsPerQ}pts/q · {getTimerForQuestion(currentQ, timerDuration)}s · +{timeBonus} bonus · {dangerZone ? "Danger Zone -"+dangerPenalty+"pts" : "Normal"}</div>
            )}
          </div>

          <div style={{ padding:"14px 18px", flex:1, overflowY:"auto" as const }}>
            <div style={{ fontSize:13, fontWeight:800, color:"#BE26C1", letterSpacing:2, marginBottom:12 }}>LEADERBOARD</div>
            {scores.length === 0 && teams.length > 0 && (
              <>
                <button onClick={() => ensureScores(sessionPin, teams)} style={{ width:"100%", padding:"9px", borderRadius:10, background:"rgba(190,38,193,0.2)", border:"1px solid rgba(190,38,193,0.4)", color:"#BE26C1", fontSize:13, fontWeight:600, cursor:"pointer", marginBottom:12 }}>Initialise Scores</button>
                {teams.map(t => (
                  <div key={t.id} style={{ padding:"10px 12px", borderRadius:12, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", marginBottom:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e", flexShrink:0 }} />
                      <span style={{ fontWeight:700, fontSize:13, flex:1, color:"#fff" }}>{t.team_name}</span>
                      <PowerCardDots teamName={t.team_name} />
                    </div>
                    {t.victory_song && (
                      <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", paddingLeft:13, marginTop:3 }}>♪ {t.victory_song.replace(/\s*SQS\s*$/i,"").replace(/[-_]+$/,"").replace(/[-_]/g," ").trim()}</div>
                    )}
                  </div>
                ))}
              </>
            )}
            {scores.map((s, i) => {
              const answered = teamHasAnswered(s.team_name);
              const ans = teamAnswer(s.team_name);
              const medal = i===0 ? "gold" : i===1 ? "silver" : i===2 ? "#cd7f32" : null;
              const isFastest = s.team_name === fastestTeam;
              return (
                <div key={s.team_name} style={{ padding:"10px 12px", borderRadius:12, background:isFastest?"rgba(190,38,193,0.15)":"rgba(255,255,255,0.045)", border:"1px solid "+(isFastest?"#BE26C1":medal||"rgba(255,255,255,0.12)"), marginBottom:8, boxShadow:"0 1px 4px rgba(0,0,0,0.25)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:16, fontWeight:800, color:medal||"rgba(255,255,255,0.45)", minWidth:26 }}>{i+1}.</span>
                    <span style={{ fontWeight:700, fontSize:14, flex:1, color:"#fff" }}>{s.team_name}{isFastest?" ⚡":""}</span>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:answered?"#22c55e":"rgba(255,255,255,0.15)", flexShrink:0 }} />
                    <span style={{ fontSize:19, fontWeight:800, color:"#BE26C1", minWidth:42, textAlign:"right" as const }}>{s.total_points}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", paddingLeft:36, marginTop:4, gap:6 }}>
                    <span style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.4)" }}>Rd: +{s.round_points}</span>
                    {answered && <span style={{ fontSize:13, color:"#22c55e", fontStyle:"italic", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{ans}</span>}
                    <PowerCardDots teamName={s.team_name} />
                    {adjustTeam === s.team_name ? (
                      <div style={{ display:"flex", gap:4, marginLeft:"auto" }}>
                        <input type="number" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} placeholder="+/-" style={{ width:52, padding:"2px 4px", borderRadius:6, background:"rgba(255,255,255,0.1)", color:"#fff", border:"1px solid rgba(190,38,193,0.4)", fontSize:12, textAlign:"center" as const }} />
                        <button onClick={() => adjustScore(s.team_name, Number(adjustAmount))} style={{ padding:"2px 8px", borderRadius:6, background:"#BE26C1", border:"none", color:"#fff", fontSize:11, cursor:"pointer" }}>OK</button>
                        <button onClick={() => { setAdjustTeam(null); setAdjustAmount(""); }} style={{ padding:"2px 6px", borderRadius:6, background:"rgba(255,255,255,0.08)", border:"none", color:"#aaa", fontSize:11, cursor:"pointer" }}>X</button>
                      </div>
                    ) : (
                      <button onClick={() => setAdjustTeam(s.team_name)} style={{ marginLeft:"auto", fontSize:10, padding:"2px 6px", borderRadius:6, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.45)", cursor:"pointer" }}>+/- pts</button>
                    )}
                  </div>
                </div>
              );
            })}
            {unoCards.length > 0 && (
              <div style={{ marginTop:14, paddingTop:14, borderTop:"1px solid rgba(190,38,193,0.15)" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"rgba(190,38,193,0.65)", marginBottom:8, letterSpacing:2 }}>POWER CARDS</div>
                {unoCards.slice(0,5).map((card,i) => (
                  <div key={card.id||i} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", borderRadius:8, background:"rgba(255,255,255,0.04)", marginBottom:4 }}>
                    <span style={{ color:cardColor[card.card_type], fontWeight:700, fontSize:11, minWidth:44 }}>{cardLabel[card.card_type]}</span>
                    <span style={{ color:"rgba(255,255,255,0.65)", fontSize:11 }}>{card.team_name}</span>
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
      <div style={{
        position: "fixed", bottom: 10, right: 12, zIndex: 9999,
        display: "flex", alignItems: "center", gap: 6,
        padding: "5px 10px", borderRadius: 999,
        background: "rgba(13,2,37,0.6)", border: "1px solid rgba(190,38,193,0.3)",
        pointerEvents: "none" as const,
      }}>
        <img src="/me-logo.jpg" alt="ME" style={{ width: 16, height: 16, borderRadius: "50%" }} />
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontFamily: "'Bruno Ace SC',sans-serif", letterSpacing: 0.3 }}>
          Quiz-It · Mac Entertainment by Sonya Mac
        </span>
      </div>
    </Suspense>
  );
}
