"use client";
import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import Image from "next/image";
import { SlotReels, SLOT_SEGS } from "@/components/SlotReels";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { HardDeckPanel } from "@/components/HardDeckPanel";
import { PursuitPanel } from "@/components/PursuitPanel";
import { downloadWinnerCard } from "@/components/SocialShareCard";
import { initTeamScore, applyScoreDelta, setScoreAbsolute, resetRoundPoints as resetRoundPointsSvc, getScores as getScoresSvc } from "@/lib/quiz/scoreService";
import { teamInitials } from "@/components/TeamBadge";
import { BrandLockup, Button, Field, Input, StatusPill } from "@/components/ui/quiz-it-ui";
import { playShowAudio, stopShowAudio } from "@/lib/audio/showAudio";
import { HostDiagnostics } from "@/components/HostDiagnostics";
import { diagnosticTimestamp } from "@/lib/diagnostics/time";
import { PLATFORM_CONFIG } from "@/lib/platform/config";
import { FEATURE_FLAGS } from "@/lib/platform/featureFlags";
import { platformLogger } from "@/lib/platform/logger";

type HostRealtimeChannel = ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]>;

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
type Round = { id: string; name: string; questions: Question[]; round_type?: string; hide_leaderboard?: boolean; allow_power_cards?: boolean; position?: number; completed_at?: string | null; source_round_id?: string | null; };
type Team = { id: string; team_name: string; victory_song: string; session_pin: string; };
type Answer = { session_pin: string; id: string; team_name: string; question_index: number; answer_text: string; submitted_at: string; };
type UnoCard = { id: string; team_name: string; card_type: string; played_at: string; round_number?: number | null; };
type Score = { team_name: string; total_points: number; round_points: number; };

const typeColor: Record<string,string> = { multiple_choice:"#D94FDC", text_answer:"#D94FDC", number:"#D94FDC", sequence:"#D94FDC", picture:"#D94FDC", audio:"#D94FDC" };
const typeLabel: Record<string,string> = { multiple_choice:"Multiple Choice", text_answer:"Text Answer", number:"Number", sequence:"Sequence", picture:"Picture Round", audio:"Name That Tune" };
const cardColor: Record<string,string> = { block:"#38A8FF", reverse:"#FF3B4E", x2:"#FFC533" };
const cardLabel: Record<string,string> = { block:"Time-Out", reverse:"Reverse", x2:"Boost" };

const RULES = {
  house: [
    "Welcome to Quiz-It! Get your team ready on your phones \u2014 join with the PIN on screen.",
    "Answers lock in the moment you submit \u2014 no changing your mind after.",
    "You've got 15 seconds per question, so don't overthink it.",
    "Each Power Card (Time-Out, Boost, Reverse) can be played once per quiz \u2014 use them wisely!",
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
  pursuit: [
    "Every team races through seven questions at the same time \u2014 each correct answer moves your runner forward one stage.",
    "One wrong answer and you're out of the pursuit (you stay on the board, frozen). Multiple teams can finish.",
    "Scoring climbs 10, 20, 30\u2026 up to a 100-point payout for clearing all seven.",
  ],
};

const ROUND_TYPE_LABEL: Record<string,string> = { regular: "General Knowledge", multi_tap: "TapType", music: "Music Round" };

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
  return playShowAudio(file, { channel: file.includes("countdown") ? "timer" : "cue", volume });
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
  const [timerDuration, setTimerDuration] = useState<number>(PLATFORM_CONFIG.timers.defaultSeconds);
  // True while The Pursuit overlay is running — the global spacebar handler stands
  // down so the Pursuit panel drives Space itself (no double-handling).
  const [pursuitActive, setPursuitActive] = useState(false);
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
  const [spinFeedback, setSpinFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [decisionMade, setDecisionMade] = useState(false);
  const [roundNumber, setRoundNumber] = useState(1);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const tickAudioRef = useRef<AudioContext|null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const victorySongRef = useRef<HTMLAudioElement|null>(null);
  const advancingRef = useRef(false);
  const spinTriggeredRef = useRef(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [sessionEventName, setSessionEventName] = useState<string | null>(null);
  const [sessionQuizPlan, setSessionQuizPlan] = useState<string | null>(null);
  const [hostIdentity, setHostIdentity] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState("CLOSED");
  const [realtimeLastSync, setRealtimeLastSync] = useState<number | null>(null);
  const [realtimeLastReconnect, setRealtimeLastReconnect] = useState<number | null>(null);
  const [realtimeErrors, setRealtimeErrors] = useState(0);
  const hostChannelRef = useRef<HostRealtimeChannel | null>(null);
  const roundStartedRef = useRef<number>(0);
  const quizEndRevealedRef = useRef<number>(0);
  const [venueName, setVenueName] = useState<string | null>(null);
  const lastDeltasRef = useRef<Record<string, number>>({});
  const roundQuestionsRef = useRef<Question[]>([]);
  // Always-current question index for the realtime answers handler, whose
  // channel callback otherwise closes over qIdx=0 from subscribe time. Without
  // it, a late INSERT for a *different* question index would be appended to the
  // current `answers` array and could be picked as "fastest correct".
  const qIdxRef = useRef(0);
  useEffect(() => { qIdxRef.current = qIdx; }, [qIdx]);
  useEffect(() => {
    createSupabaseBrowserClient().auth.getUser().then(({ data }) => setHostIdentity(data.user?.email || data.user?.id || null));
  }, []);

  const currentQ = selectedRound?.questions[qIdx] || null;
  const isLastQ = selectedRound ? qIdx >= selectedRound.questions.length - 1 : false;
  const [picSubPhase, setPicSubPhase] = useState<"image_only"|"question_visible">("image_only");

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
    }, PLATFORM_CONFIG.polling.hostSpinSafetyMilliseconds);
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
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (FEATURE_FLAGS.diagnostics) setDiagnosticsOpen(value => !value);
        return;
      }
      if (e.code !== "Space" && e.key !== " ") return;
      if (e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      handleSpacebar();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [hostPhase, selectedRound, qIdx, connected, answers, teams, currentQ, sessionId, sessionPin, pointsPerQ, timeBonus, timerDuration, dangerZone, dangerPenalty, wipeoutMode, timeLeft, isLastQ, pursuitActive]);

  function handleSpacebar() {
    if (pursuitActive) return; // The Pursuit panel owns Space while it's running.
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
    else if (hostPhase === "round_end") { chooseRound(rounds.find(r => (r.position ?? 0) === (selectedRound?.position ?? -1) + 1) || null); }
    else if (hostPhase === "quiz_end") { doRevealNextTeam(); }
  }

  async function loadRounds(liveSessionId: string) {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.from("session_rounds").select("id,name,questions,round_type,hide_leaderboard,allow_power_cards,position,completed_at,source_round_id").eq("session_id", liveSessionId).order("position");
    if (error) platformLogger.error("host", "Live quiz order unavailable", { error });
    setRounds((data ?? []) as Round[]);
  }

  // Restores the host's local UI state from the session row in the database -
  // previously a host browser refresh reconnected to the right session but
  // showed a blank "Select round..." panel with no question/phase/timer state,
  // even though the live game (display screen, player phones) was still
  // running fine off the same session row the whole time. This is what makes
  // "refresh the host laptop mid-show" actually safe instead of disorienting.
  async function restoreSessionState(data: Record<string, unknown>) {
    const supabase = createSupabaseBrowserClient();
    if (data.current_session_round_id || data.round_id) {
      const { data: roundData } = data.current_session_round_id
        ? await supabase.from("session_rounds").select("*").eq("id", data.current_session_round_id as string).maybeSingle()
        : await supabase.from("rounds").select("*").eq("id", data.round_id as string).maybeSingle();
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
        }, PLATFORM_CONFIG.timers.tickMilliseconds);
      }
    }
  }

  async function connectWithPin(p: string) {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("sessions").select("*").eq("pin", p.trim()).single();
    if (!data) return;
    setSessionPin(p.trim());
    setSessionId(data.id); sessionIdRef.current = data.id;
    setConnectedAt(data.created_at ? new Date(data.created_at as string).getTime() : diagnosticTimestamp());
    setSessionEventName((data.event_name as string) || null);
    setSessionQuizPlan((data.quiz_plan_name as string) || null);
    await loadRounds(data.id);
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
    setConnectedAt(data.created_at ? new Date(data.created_at as string).getTime() : diagnosticTimestamp());
    setSessionEventName((data.event_name as string) || null);
    setSessionQuizPlan((data.quiz_plan_name as string) || null);
    await loadRounds(data.id);
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

  // answers.question_index resets to 0 every round, so filtering by index alone
  // returns rows from ALL rounds at that index. Scope to the CURRENT round by
  // only accepting answers submitted at/after this round started. Used by every
  // host answer read so the host, scoring, and "fastest" all see the same
  // current-round-only set.
  function scopedAnswersQuery(pin: string, idx: number) {
    const supabase = createSupabaseBrowserClient();
    let q = supabase.from("answers").select("*").eq("session_pin", pin).eq("question_index", idx);
    if (roundStartedRef.current) q = q.gte("submitted_at", new Date(roundStartedRef.current).toISOString());
    return q.order("submitted_at", { ascending: true });
  }
  async function loadAnswers(pin: string, idx: number) {
    const { data } = await scopedAnswersQuery(pin, idx);
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
    const interval = setInterval(() => { loadAnswers(sessionPin, qIdx); }, PLATFORM_CONFIG.polling.hostAnswerSafetyMilliseconds);
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
    const data = await getScoresSvc(supabase, pin);
    setScores(data);
  }

  async function ensureScores(pin: string, teamList: Team[]) {
    const supabase = createSupabaseBrowserClient();
    for (const team of teamList) {
      await initTeamScore(supabase, pin, team.team_name);
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
        // Wipeout: a single wrong tap zeroes the ENTIRE question for that team -
        // base AND time bonus. Previously only the base was zeroed, so a team that
        // triggered wipeout still banked the speed bonus (points they should not
        // have got).
        const mtWipedOut = wipeoutMode && qIdx >= 5 && wrongTaps.length > 0;
        if (mtWipedOut) mtBasePts = 0;
        const mtTimeBonus = mtWipedOut ? 0 : (rankBonus[team.team_name] ?? 0);
        const mtDelta = (mtBasePts + mtTimeBonus) * (hasBoost(team.team_name) ? 2 : 1);
        lastDeltasRef.current[team.team_name] = mtDelta;
        if (mtDelta === 0) continue;
        const mtResult = await applyScoreDelta(supabase, sessionPin, team.team_name, mtDelta, { eventKey: `autoscore:${sessionPin}:r${roundNumber}:${qIdx}:${team.team_name}:multitap` });
        if (mtResult.scoreboardSyncError) console.error(`autoScore (multi tap, ${team.team_name}): score updated but scoreboard_data sync failed:`, mtResult.scoreboardSyncError);
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
      const scoreResult = await applyScoreDelta(supabase, sessionPin, team.team_name, delta, { eventKey: `autoscore:${sessionPin}:r${roundNumber}:${qIdx}:${team.team_name}` });
      if (scoreResult.scoreboardSyncError) console.error(`autoScore (${team.team_name}): score updated but scoreboard_data sync failed:`, scoreResult.scoreboardSyncError);
    }
    loadScores(sessionPin);
  }

  async function adjustScore(teamName: string, delta: number) {
    if (!sessionPin || isNaN(delta) || delta === 0) return;
    const supabase = createSupabaseBrowserClient();
    const result = await applyScoreDelta(supabase, sessionPin, teamName, delta);
    if (result.scoreboardSyncError) {
      alert(`Score for ${teamName} was updated, but the scoreboard failed to refresh (${result.scoreboardSyncError}). Display/handsets may show a stale total until the next score change.`);
    }
    loadScores(sessionPin);
    setAdjustTeam(null);
    setAdjustAmount("");
  }

  async function resetRoundPoints() {
    if (!sessionPin) return;
    const supabase = createSupabaseBrowserClient();
    const result = await resetRoundPointsSvc(supabase, sessionPin);
    if (result.scoreboardSyncError) console.error("resetRoundPoints: round points reset but scoreboard_data sync failed:", result.scoreboardSyncError);
    loadScores(sessionPin);
  }

  async function pushScoreboardToScreen() {
    if (!sessionId) return;
    if (selectedRound?.hide_leaderboard) return;
    // scoreboard_data is kept fresh by the score service after every score
    // mutation - no need to recompute or embed it here, just toggle visibility.
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ phase: "scoreboard", show_scoreboard: true }).eq("id", sessionId);
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
    if (selectedRound?.hide_leaderboard) return;
    // scoreboard_data is kept fresh by the score service after every score
    // mutation - no need to recompute or embed it here, just toggle visibility.
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ show_scoreboard: true }).eq("id", sessionId);
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
    // scoreboard_data is kept fresh by the score service after every score
    // mutation - no need to recompute or embed it here.
    const { data, error } = await supabase.from("sessions").update({ phase: "quiz_end", quiz_end_revealed_count: 0, quiz_end_trophy_visible: false }).eq("id", sessionId).select();
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
      setSpinFeedback(null);
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
      createSupabaseBrowserClient().from("sessions")
        .update({ phase: "spin_to_win", spin_target_idx: winIdx, spin_nonce: nonce })
        .eq("id", sid)
        .then(({ error }) => {
          if (error) {
            console.error("Failed to write spin_to_win phase:", error);
            setSpinFeedback({ ok: false, message: "Spin could not start on the display. Check the connection and retry." });
          }
        });
      if (fastestTeamRef.current) applySpinResult(winIdx, fastestTeamRef.current, nonce, pin);
      setTimeout(() => {
        const finalSid = sessionIdRef.current || sessionId;
        // Only return to "celebration" if the session is STILL on the spin
        // (phase === "spin_to_win"). If the host already advanced (Continue / Next
        // Question / End Round), that move set fastest_team = null and changed the
        // phase; an unconditional write here would re-enter "celebration" with no
        // winner and make the Display fire the sad-trombone + "No correct answers"
        // and every handset re-show wrong-answer feedback. The .eq("phase",
        // "spin_to_win") guard makes this a no-op in that case. The spin_* columns
        // are cleared in the same guarded write.
        if (finalSid) createSupabaseBrowserClient().from("sessions").update({ phase: "celebration", spin_offered: false, spin_choice: null, spin_nonce: null, spin_target_idx: null }).eq("id", finalSid).eq("phase", "spin_to_win").then(({ error }) => { if (error) console.error("SESSION UPDATE FAILED [spinTimeout]:", error); });
      }, 20000);
    }
  }

  function subscribeToUpdates(pin: string) {
    const supabase = createSupabaseBrowserClient();
    if (hostChannelRef.current) hostChannelRef.current.unsubscribe();
    setRealtimeStatus("CONNECTING");
    const channel = supabase.channel("quiz-host-" + pin)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "answers" }, (payload) => {
        const a = payload.new as Answer;
        // Scope strictly to this session AND the current question index. A stale
        // or retried insert for a previous question must never leak into the
        // live `answers` array (it would otherwise be eligible as "fastest
        // correct" even though it belongs to a different question).
        if (a.session_pin === pin && a.question_index === qIdxRef.current) {
          setRealtimeLastSync(diagnosticTimestamp());
          setAnswers(prev => prev.some(x => x.id === a.id) ? prev : [...prev, a]);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "teams" }, (payload) => {
        const t = payload.new as Team;
        if (t.session_pin === pin) {
          setRealtimeLastSync(diagnosticTimestamp());
          setTeams(prev => [...prev, t]);
          // Create the score row immediately on join, not on first correct answer -
          // otherwise a team that joined after "Initialise Scores" was clicked, or
          // simply hasn't answered correctly yet, was invisible on the leaderboard
          // entirely (it only ever showed teams that already had a scores row).
          initTeamScore(createSupabaseBrowserClient(), pin, t.team_name).then(() => loadScores(pin));
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "uno_cards" }, (payload) => {
        const c = payload.new as UnoCard & { session_pin?: string };
        // Scope to this session - the INSERT event is table-wide, so without
        // this check a power card played in a different concurrent session would
        // be appended to this host's list and leaderboard.
        if (c.session_pin && c.session_pin !== pin) return;
        setUnoCards(prev => prev.some(x => x.id === c.id) ? prev : [c, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "scores", filter: "session_pin=eq." + pin }, () => {
        setRealtimeLastSync(diagnosticTimestamp());
        loadScores(pin);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions" }, (payload) => {
        const s = payload.new as Record<string, unknown>;
        if (s.pin !== pin) return;
        setRealtimeLastSync(diagnosticTimestamp());
        const choice = (s.spin_choice as string) || null;
        setSpinChoice(choice);
        setSpinTargetIdx((s.spin_target_idx as number) ?? null);
        setSpinNonce((s.spin_nonce as number) ?? null);
        setSpinOffered(!!s.spin_offered);
        triggerSpinIfChosen(choice, pin);
      })
      .subscribe(status => {
        setRealtimeStatus(status);
        if (status === "SUBSCRIBED") {
          setRealtimeLastSync(diagnosticTimestamp());
          setRealtimeLastReconnect(diagnosticTimestamp());
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeErrors(value => value + 1);
        }
      });
    hostChannelRef.current = channel;
  }

  useEffect(() => () => { hostChannelRef.current?.unsubscribe(); }, []);

  async function diagnosticsResyncSession() {
    if (!sessionPin) return;
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.from("sessions").select("*").eq("pin", sessionPin).single();
    if (error || !data) throw error || new Error("Session unavailable");
    await restoreSessionState(data as Record<string, unknown>);
    await Promise.all([loadRounds(data.id), loadTeams(sessionPin), loadAnswers(sessionPin, qIdxRef.current), loadUnoCards(sessionPin), loadScores(sessionPin)]);
    setRealtimeLastSync(diagnosticTimestamp());
  }

  async function diagnosticsRefreshPlayers() {
    if (!sessionPin) return;
    await Promise.all([loadTeams(sessionPin), loadAnswers(sessionPin, qIdxRef.current), loadUnoCards(sessionPin)]);
    setRealtimeLastSync(diagnosticTimestamp());
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
      }, PLATFORM_CONFIG.timers.tickMilliseconds);
    } catch {}
  }

  useEffect(() => {
    if (hostPhase !== "timer") stopTickAudio();
    // Audio lifecycle follows the live phase; the timer starter owns creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostPhase]);
  useEffect(() => () => stopTickAudio(), []); // unmount / recovery cleanup

  function stopVictorySong() {
    stopShowAudio("music");
    victorySongRef.current = null;
  }

  function playVictorySong(songFile: string) {
    stopVictorySong();
    const audio = playShowAudio(encodeURIComponent(songFile) + ".mp3", { channel: "music", volume: 0.8 });
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
    await supabase.from("sessions").update({
      phase: "round_start",
      round_name: selectedRound.name,
      round_number: roundNumber,
      fastest_team: null,
      fastest_song: null,
      hide_leaderboard: selectedRound.hide_leaderboard ?? false,
      allow_power_cards: selectedRound.allow_power_cards ?? true,
      ...(selectedRound.hide_leaderboard ? { show_scoreboard: false } : {}),
    }).eq("id", sessionId);
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
    const { error: prevErr } = await supabase.from("sessions").update({ phase: "waiting", fastest_team: null, fastest_song: null, spin_offered: false, spin_nonce: null, spin_target_idx: null, spin_choice: null }).eq("id", sessionId);
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
    }, PLATFORM_CONFIG.timers.tickMilliseconds);
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
    const { data: freshAnswers } = await scopedAnswersQuery(sessionPin, qIdx);
    const answersToScore = freshAnswers ?? answers;
    setAnswers(answersToScore);
    await autoScore(teams, currentQ, answersToScore);
  }

  async function doCelebrate() {
    if (!sessionId) return;
    // Determine "fastest correct" from a fresh read scoped to THIS session and
    // THIS question index, rather than the `answers` React state which can carry
    // stale/late rows. Eligibility strictly requires: an answer was actually
    // submitted (non-blank text), it is correct, it belongs to the current
    // question index, and it belongs to the current session. Null/blank/missing/
    // previous-question/other-session rows can never qualify.
    let scopedAnswers: Answer[] = answers.filter(a => a.session_pin === sessionPin && a.question_index === qIdx);
    if (sessionPin) {
      const { data: freshCelebAnswers } = await scopedAnswersQuery(sessionPin, qIdx);
      if (freshCelebAnswers) scopedAnswers = freshCelebAnswers as Answer[];
    }
    const correctAnswers = scopedAnswers.filter(a =>
      currentQ &&
      !!a.answer_text && a.answer_text.trim() !== "" &&
      a.question_index === qIdx &&
      a.session_pin === sessionPin &&
      isAnswerCorrect(a, currentQ)
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

  async function applySpinResult(winIdx: number, teamName: string, spinNonce: number | undefined, pin: string) {
    // `pin` is passed explicitly rather than read from the `sessionPin` state:
    // this function is reached from the realtime sessions-UPDATE handler, whose
    // callback closes over the render at channel-subscribe time (when sessionPin
    // was still "") and never updates. Using that stale "" meant getScores("")
    // returned no rows and the whole spin payout silently no-opped, while
    // spinTriggeredRef was already set - blocking the correctly-scoped 1.5s poll
    // path from ever retrying. The verified pin threads through cleanly here.
    if (!pin) { console.error("applySpinResult: no session pin available"); return; }
    const supabase = createSupabaseBrowserClient();
    const allScores = await getScoresSvc(supabase, pin);
    if (!allScores.length) {
      setSpinFeedback({ ok: false, message: "Spin score could not be loaded. No points were changed." });
      return;
    }
    // Other teams' TOTALS, highest first. Rank outcomes are computed purely from
    // these so a team lands on the score needed to occupy that leaderboard
    // position - never the ordinal number (1/2/3) and never an arbitrary 0.
    const othersDesc = allScores.filter(s => s.team_name !== teamName).map(s => s.total_points).sort((a, b) => b - a);
    const mine = allScores.find(s => s.team_name === teamName);
    const myTotal = mine?.total_points ?? 0;
    const label = SLOT_SEGS[winIdx]?.label;
    // To occupy overall rank R, exactly R-1 other teams must be above you, so sit
    // one point above the R-th highest other team (othersDesc[R-1]). Deterministic
    // for ties (fixed sort). If there aren't that many other teams, the rank can't
    // exist below the team's current standing - keep the team's own score rather
    // than reducing it to a meaningless value.
    const scoreForRank = (rank: number): number => {
      const idx = rank - 1;
      if (idx < othersDesc.length) return othersDesc[idx] + 1;
      return myTotal;
    };
    let newTotal = myTotal;
    // Numeric outcomes are a straightforward add/subtract, floored at 0.
    if (label === "+50 Points") newTotal = myTotal + 50;
    else if (label === "-10 Points") newTotal = Math.max(0, myTotal - 10);
    else if (label === "-20 Points") newTotal = Math.max(0, myTotal - 20);
    else if (label === "-30 Points") newTotal = Math.max(0, myTotal - 30);
    // 1st place is a reward: guarantee first, but never REDUCE the team's score
    // (e.g. when other teams still have 0, this must not drop a leader to 1).
    else if (label === "1st Place") newTotal = Math.max(myTotal, scoreForRank(1));
    // 2nd place: land exactly 1 point above the team that will sit 3rd (others'
    // 2nd-highest). If there is no 3rd-place team, sit 1 point behind current
    // 1st. Never demote a team already above the target (max with myTotal).
    else if (label === "2nd Place") {
      const target = othersDesc.length >= 2 ? othersDesc[1] + 1
                   : othersDesc.length === 1 ? Math.max(0, othersDesc[0] - 1)
                   : myTotal;
      newTotal = Math.max(myTotal, target);
    }
    // 3rd place: land exactly 1 point above the team that will sit 4th (others'
    // 3rd-highest). If there is no 4th-place team, sit 1 point behind current
    // 2nd. Never demote a team already above the target.
    else if (label === "3rd Place") {
      const target = othersDesc.length >= 3 ? othersDesc[2] + 1
                   : othersDesc.length >= 2 ? Math.max(0, othersDesc[1] - 1)
                   : myTotal;
      newTotal = Math.max(myTotal, target);
    }
    // Last place: sit one below the current lowest other team, floored at 0. Only
    // becomes 0 when 0 is genuinely last (lowest other is 0 or 1). With no other
    // teams there is no "last" to move to, so keep the team's score.
    else if (label === "Last Place") newTotal = othersDesc.length ? Math.max(0, othersDesc[othersDesc.length - 1] - 1) : myTotal;
    // eventKey keyed on the spin_nonce written to the session row for this
    // spin - guards against applySpinResult ever being invoked twice for the
    // same spin (e.g. a future direct call plus a realtime-triggered call).
    // setScoreAbsolute refreshes sessions.scoreboard_data itself as part of
    // this call - no separate sync step needed here. If that refresh fails,
    // the score write still succeeded but Display/Player may show a stale
    // scoreboard until the next mutation; report it rather than pretend the
    // spin fully succeeded.
    const result = await setScoreAbsolute(supabase, pin, teamName, newTotal, {
      eventKey: spinNonce != null ? `spin:${pin}:${spinNonce}` : undefined,
    });
    if (result.scoreboardSyncError) {
      console.error("applySpinResult: score updated but scoreboard_data sync failed:", result.scoreboardSyncError);
      setSpinFeedback({ ok: false, message: "Score changed, but the live leaderboard did not refresh. Reopen the scoreboard." });
    } else {
      const { data: verified } = await supabase.from("scores").select("total_points").eq("session_pin", pin).eq("team_name", teamName).maybeSingle();
      if (!verified || verified.total_points !== newTotal) {
        setSpinFeedback({ ok: false, message: "Spin score update failed. No result has been confirmed." });
      } else {
        setSpinFeedback({ ok: true, message: `${teamName}: ${label} applied — ${newTotal} points.` });
      }
    }
    loadScores(pin);
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
    if (selectedRound) {
      const completedAt = new Date().toISOString();
      await supabase.from("session_rounds").update({ completed_at: completedAt }).eq("id", selectedRound.id);
      setRounds(previous => previous.map(round => round.id === selectedRound.id ? { ...round, completed_at: completedAt } : round));
    }
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
  // Mission Control control-console requirement: submission order + badge +
  // real answer + correct/incorrect after reveal. Derived from the same
  // `answers` array and `isAnswerCorrect` helper scoring already uses — no
  // gameplay/scoring/state change.
  const orderedAnswers = [...answers].sort((a, b) => (a.submitted_at || "").localeCompare(b.submitted_at || ""));
  const submissionOrder = (teamName: string) => { const i = orderedAnswers.findIndex(a => a.team_name === teamName); return i >= 0 ? i + 1 : null; };
  const teamAnswerObj = (teamName: string) => answers.find(a => a.team_name === teamName) || null;
  const answersRevealed = hostPhase === "answer" || hostPhase === "celebration";
  const PowerCardDots = ({ teamName }: { teamName: string }) => {
    const used = teamCardsUsed(teamName);
    return (
      <div style={{ display:"flex", gap:4 }}>
        {(["block","reverse","x2"] as const).map(ct => (
          <span key={ct} title={cardLabel[ct] + (used.has(ct) ? " (played)" : " (available)")}
            style={{ width:9, height:9, borderRadius:"50%",
              background: used.has(ct) ? cardColor[ct] : "transparent",
              border: used.has(ct) ? "none" : "1px solid rgba(255,255,255,0.2)",
              boxShadow: used.has(ct) ? "0 0 6px " + cardColor[ct] : "none" }} />
        ))}
      </div>
    );
  };

  // Single place to choose tonight's round (used by the header dropdown and the
  // big desk picker). Behaviour identical to the original inline handler.
  function chooseRound(r: (typeof rounds)[number] | null) {
    setSelectedRound(r || null); setQIdx(0); setAnswers([]); setHostPhase("waiting");
    setRoundNumber((r?.position ?? 0) + 1);
    if (r?.hide_leaderboard) { setShowScoreboard(false); setShowScoreboardOnHandsets(false); }
    roundQuestionsRef.current = r ? [...r.questions] : [];
    if (sessionId) createSupabaseBrowserClient().from("sessions").update({
      round_id: r?.source_round_id || null,
      current_session_round_id: r?.id || null,
      hide_leaderboard: r?.hide_leaderboard ?? false,
      allow_power_cards: r?.allow_power_cards ?? true,
      round_number: (r?.position ?? 0) + 1,
      ...(r?.hide_leaderboard ? { show_scoreboard: false } : {}),
    }).eq("id", sessionId);
  }

  const spacebarHint =
    hostPhase === "waiting" ? "SPACE: Start Round" :
    hostPhase === "round_start" ? "SPACE: Preview First Question" :
    hostPhase === "preview" ? "SPACE: Send Question Live" :
    hostPhase === "question" && currentQ?.question_type === "picture" && picSubPhase === "image_only" ? "SPACE: Reveal Question Text" :
    hostPhase === "question" ? "SPACE: Start Timer" :
    hostPhase === "timer" ? "SPACE: Reveal Answer" :
    hostPhase === "answer" ? "SPACE: Celebrate Fastest Team" :
    hostPhase === "celebration" ? (isLastQ ? "SPACE: End Round" : "SPACE: Preview Next Question") :
    hostPhase === "round_end" ? "SPACE: Load Next Round" :
    hostPhase === "quiz_end" ? "Leaderboard reveal active" : "";

  // The single next beat, as a plain verb — surfaced as the dominant control so
  // the host never hunts and can drive the whole show from peripheral vision.
  const nextActionLabel =
    hostPhase === "waiting" ? "Start Round" :
    hostPhase === "round_start" ? "Preview First Question" :
    hostPhase === "preview" ? "Send Question Live" :
    hostPhase === "question" && currentQ?.question_type === "picture" && picSubPhase === "image_only" ? "Reveal Question Text" :
    hostPhase === "question" ? "Start Timer" :
    hostPhase === "timer" ? "Reveal Answer" :
    hostPhase === "answer" ? "Celebrate Fastest Team" :
    hostPhase === "celebration" ? (isLastQ ? "End Round" : "Next Question") :
    hostPhase === "round_end" ? "Load Next Round" : "";

  if (!connected) {
    return (
      <main className="qi-app-shell qi-auth-shell">
        <div className="qi-panel qi-panel--elevated qi-mc-connect">
          <BrandLockup />
          <div className="qi-mc-connect__copy">
            <p className="qi-eyebrow">Mission Control</p>
            <h1>Connect to tonight&apos;s quiz</h1>
            <p>Enter the four-digit session PIN.</p>
          </div>
          <Field label="Session PIN">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g,"").slice(0,4))} onKeyDown={e => e.key==="Enter" && connectToSession()} inputMode="numeric" autoComplete="one-time-code" placeholder="0000" maxLength={4} className="qi-mc-pin-input" />}
          </Field>
          <Button onClick={connectToSession} disabled={pinInput.length!==4} className="qi-mc-connect__action">Connect to quiz</Button>
        </div>
      </main>
    );
  }

  // Fable law: the console phase indicator speaks in purple (green reserved for
  // "correct" only). Live phases glow purple; idle phases sit neutral.
  const phaseLive = hostPhase!=="waiting" && hostPhase!=="quiz_end";

  return (
    <div className="fbh qi-mc-shell">
      {/* HEADER */}
      <header className="qi-mc-header">
        <div className="qi-mc-brand">
          <Image src="/me-logo.jpg" alt="Mac Entertainment" width={44} height={44} className="qi-mc-brand__mark" />
          <BrandLockup compact align="left" />
          <span className="qi-mc-brand__section">Mission Control</span>
        </div>
        <div className="qi-mc-session" aria-label="Live session information">
          <div><span>Session PIN</span><strong>{sessionPin}</strong></div>
          <StatusPill tone={phaseLive ? "live" : "inactive"}>{hostPhase.replace("_"," ")}{hostPhase==="timer" ? ` · ${timeLeft}s` : ""}</StatusPill>
          {selectedRound ? <div><span>Question</span><strong>{qIdx+1} / {selectedRound.questions.length}</strong></div> : null}
        </div>
        <nav className="qi-mc-nav" aria-label="Mission Control navigation">
          <a className="qi-button qi-button--quiet" href="/host/events">Events</a>
          <div className="qi-mc-round-select" aria-label="Current quiz round">{selectedRound ? `${(selectedRound.position ?? 0) + 1}. ${selectedRound.name}` : "Quiz not loaded"}</div>
          <Button variant="quiet" onClick={() => setRulesOpen(true)}>Rules</Button>
          {FEATURE_FLAGS.diagnostics && <button className="qi-health-trigger" aria-label="Open host diagnostics" title="Diagnostics · Ctrl/Cmd + Shift + D" onClick={() => setDiagnosticsOpen(true)}>●</button>}
        {rulesOpen && (
          <div onClick={() => setRulesOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
            <div onClick={e => e.stopPropagation()} style={{ background:"#1a0535", border:"2px solid #BE26C1", borderRadius:16, padding:28, maxWidth:560, maxHeight:"80vh", overflowY:"auto" as const, color:"#fff" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                <div style={{ fontSize:20, fontWeight:700, color:"#BE26C1", letterSpacing:2 }}>Rules</div>
                <button onClick={() => setRulesOpen(false)} style={{ background:"transparent", border:"none", color:"rgba(255,255,255,0.5)", fontSize:20, cursor:"pointer" }}>{"\u00D7"}</button>
              </div>

              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#D94FDC", letterSpacing:2, marginBottom:8 }}>HOUSE RULES</div>
                <ul style={{ margin:0, paddingLeft:20, fontSize:14, lineHeight:1.6 }}>
                  {RULES.house.map((r,i) => <li key={i}>{r}</li>)}
                </ul>
              </div>

              {selectedRound && (() => {
                const rt = selectedRound.questions[0]?.round_type || "regular";
                const key = (rt === "multi_tap" || rt === "music") ? rt : "regular";
                return (
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"#D94FDC", letterSpacing:2, marginBottom:8 }}>{(ROUND_TYPE_LABEL[key]||"GENERAL KNOWLEDGE").toUpperCase()} \u2014 CURRENT ROUND</div>
                    <ul style={{ margin:0, paddingLeft:20, fontSize:14, lineHeight:1.6 }}>
                      {RULES[key as keyof typeof RULES].map((r,i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                );
              })()}

              {selectedRound && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#D94FDC", letterSpacing:2, marginBottom:8 }}>THE HARD DECK</div>
                  <ul style={{ margin:0, paddingLeft:20, fontSize:14, lineHeight:1.6 }}>
                    {RULES.hard_deck.map((r,i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}

              {selectedRound && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#D94FDC", letterSpacing:2, marginBottom:8 }}>SPIN TO WIN</div>
                  <ul style={{ margin:0, paddingLeft:20, fontSize:14, lineHeight:1.6 }}>
                    {RULES.spin_to_win.map((r,i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}

              {selectedRound && (
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#D94FDC", letterSpacing:2, marginBottom:8 }}>THE PURSUIT</div>
                  <ul style={{ margin:0, paddingLeft:20, fontSize:14, lineHeight:1.6 }}>
                    {RULES.pursuit.map((r,i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
          {FEATURE_FLAGS.hardDeck && sessionId && <HardDeckPanel sessionId={sessionId} sessionPin={sessionPin} teams={teams} onScoreChange={() => loadScores(sessionPin)} />}
          {FEATURE_FLAGS.pursuit && sessionId && <PursuitPanel sessionId={sessionId} sessionPin={sessionPin} teams={teams} rounds={rounds.filter(r => r.round_type === "pursuit").map(r => ({ id: r.id, name: r.name, questions: r.questions }))} timerDuration={timerDuration} onScoreChange={() => loadScores(sessionPin)} onActiveChange={setPursuitActive} />}
          <a href="/host/display" target="_blank" rel="noopener noreferrer" className="qi-button qi-button--primary">Open Display</a>
        </nav>
      </header>

      {/* SCOREBOARD BUTTONS BAR */}
      <div className="qi-mc-toolbar">
        <div className="qi-mc-toolbar__label"><span>Audience</span><strong>Scoreboard controls</strong></div>
        <Button variant={showScoreboardOnHandsets ? "primary" : "secondary"} disabled={!!selectedRound?.hide_leaderboard} onClick={showScoreboardOnHandsets ? hideScoreboardFromHandsets : pushScoreboardToHandsets}>{selectedRound?.hide_leaderboard ? "Handset leaderboard hidden" : showScoreboardOnHandsets ? "Hide on handsets" : "Show on handsets"}</Button>
        <Button variant={showScoreboard ? "primary" : "secondary"} disabled={!!selectedRound?.hide_leaderboard} onClick={showScoreboard ? hideScoreboard : pushScoreboardToScreen}>{selectedRound?.hide_leaderboard ? "Display leaderboard hidden" : showScoreboard ? "Hide on display" : "Show on display"}</Button>
        {!nextActionLabel && spacebarHint ? <span className="qi-mc-toolbar__hint">{spacebarHint}</span> : null}
        <Button variant="destructive" className="qi-mc-toolbar__end" onClick={doEndOfQuiz}>End quiz</Button>
      </div>

      {/* DOMINANT NEXT-ACTION BAR — the one thing the host acts on next, huge and
          clickable (same as pressing Space). Readable from across the room / at a
          glance while talking. Timer phase shows the live countdown instead. */}
      {selectedRound && nextActionLabel && (
        <button onClick={handleSpacebar} className={`qi-mc-next${hostPhase==="timer" ? " qi-mc-next--timer" : ""}`}>
          <span className="qi-mc-next__eyebrow">Next action</span>
          <span className="qi-mc-next__label">{nextActionLabel}</span>
          {hostPhase==="timer" && <span className={`qi-mc-next__timer${(timeLeft ?? 0)<=5 ? " qi-mc-next__timer--urgent" : ""}`}>{timeLeft}s</span>}
          <span className="qi-mc-next__key">Space ↵</span>
        </button>
      )}

      {/* MAIN CONTENT */}
      <div className="qi-mc-workspace">
        <main className="qi-mc-desk">
          {!selectedRound ? (
            <div className="qi-mc-round-picker">
              <div className="qi-mc-round-picker__title">Tonight&rsquo;s Running Order</div>
              <div className="qi-mc-round-picker__description">Only rounds prepared in this quiz are available. Completed rounds remain visible.</div>
              {rounds.filter(r => r.round_type !== "pursuit").length === 0 ? (
                <div style={{ font:"600 15px 'Inter'", color:"#B9A8D9", textAlign:"center" }}>This session has no quiz snapshot. Create a new session from Quiz Builder.</div>
              ) : (
                <div className="qi-mc-round-grid">
                  {rounds.filter(r => r.round_type !== "pursuit").map(r => (
                    <button key={r.id} onClick={() => chooseRound(r)} className="qi-mc-round-card">
                      <strong>{(r.position ?? 0) + 1}. {r.name}</strong>
                      <span>{r.completed_at ? "✓ Completed" : "Upcoming"} · {r.questions?.length || 0} questions{r.round_type && r.round_type !== "regular" ? " · " + r.round_type : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : hostPhase === "round_start" ? (
            <div style={{ textAlign:"center", marginTop:60 }}>
              <div style={{ fontFamily:"'Bruno Ace SC',var(--font-logo),cursive", fontSize:32, color:"#fff", letterSpacing:".08em", marginBottom:8, textShadow:"0 0 30px rgba(190,38,193,0.5)" }}>{selectedRound.name}</div>
              <div style={{ font:"600 18px 'Inter'", color:"#B9A8D9", marginBottom:32 }}>{selectedRound.questions.length} questions</div>
              <div style={{ font:"400 13px 'Inter'", color:"#6B5A8E", letterSpacing:".16em" }}>Announce the round — then SPACE to preview Q1</div>
            </div>
          ) : hostPhase === "round_end" ? (
            <div style={{ textAlign:"center", marginTop:60 }}>
              <div style={{ fontFamily:"'Bruno Ace SC',var(--font-logo),cursive", fontSize:32, color:"#fff", letterSpacing:".08em", marginBottom:8, textShadow:"0 0 30px rgba(190,38,193,0.5)" }}>Round Complete</div>
              <div style={{ font:"600 16px 'Inter'", color:"#B9A8D9", marginBottom:32 }}>SPACE to start next round, or use End of Quiz Reveal</div>
            </div>
          ) : hostPhase === "quiz_end" ? (
            <div style={{ textAlign:"center", marginTop:60 }}>
              <div style={{ fontFamily:"'Bruno Ace SC',var(--font-logo),cursive", fontSize:32, color:"#E8C36A", letterSpacing:".08em", marginBottom:8, textShadow:"0 0 34px rgba(232,195,106,0.5)" }}>Quiz Complete</div>
              <div style={{ font:"600 16px 'Inter'", color:"#B9A8D9", marginBottom:24 }}>Leaderboard reveal is live on the display screen</div>
              <button onClick={doRevealNextTeam} style={{ padding:"16px 40px", borderRadius:14, background:"#BE26C1", border:"none", color:"#fff", font:"700 18px 'Inter'", letterSpacing:".08em", cursor:"pointer", marginBottom:12, boxShadow:"0 0 24px rgba(190,38,193,0.5)" }}>Reveal Next Team</button>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)", letterSpacing:2, marginBottom:24 }}>or press SPACE</div>
              <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
                <button onClick={() => downloadWinnerCard(scores, teams, venueName, "vertical")} style={{ padding:"10px 20px", borderRadius:10, background:"rgba(190,38,193,0.25)", border:"1px solid #BE26C1", color:"#fff", fontSize:13, cursor:"pointer" }}>Download Share Card (Story)</button>
                <button onClick={() => downloadWinnerCard(scores, teams, venueName, "square")} style={{ padding:"10px 20px", borderRadius:10, background:"rgba(190,38,193,0.25)", border:"1px solid #BE26C1", color:"#fff", fontSize:13, cursor:"pointer" }}>Download Share Card (Post)</button>
              </div>
            </div>
          ) : hostPhase === "celebration" ? (
            <div style={{ textAlign:"center", marginTop:60 }}>
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
                    <div style={{ fontSize:18, color:"#D94FDC", fontWeight:700, marginBottom:24 }}>{fastestTeam}, Spin to Win?</div>
                  )}
                  {spinChoice === "spin" && (
                    <div style={{ width:"100%", maxWidth:420, margin:"0 auto 16px" }}>
                      <SlotReels targetIdx={spinTargetIdx} spinNonce={spinNonce} teamName={fastestTeam || "Team"} size="compact" audioEnabled={false} />
                    </div>
                  )}
                  {spinFeedback && (
                    <div role="status" style={{ maxWidth:520, margin:"0 auto 16px", padding:"12px 16px", borderRadius:12, background: spinFeedback.ok ? "rgba(46,224,110,.12)" : "rgba(255,59,78,.14)", border:`1px solid ${spinFeedback.ok ? "rgba(46,224,110,.45)" : "rgba(255,59,78,.5)"}`, color:spinFeedback.ok ? "#2EE06E" : "#ff8290", fontWeight:800 }}>{spinFeedback.message}</div>
                  )}
                  <button onClick={() => { if (isLastQ) doEndRound(); else doPreviewQuestion(qIdx + 1); }} style={{ padding:"12px 32px", borderRadius:10, background:"rgba(190,38,193,0.3)", border:"1px solid #BE26C1", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", marginBottom:24, marginTop:16 }}>Continue ▶</button>
                  {spinChoice === "pass" && (
                    <div style={{ fontSize:16, color:"rgba(255,255,255,0.5)", marginBottom:24 }}>{fastestTeam} passed</div>
                  )}
                </>
              ) : (
                <div style={{ fontSize:24, color:"rgba(255,255,255,0.4)", marginBottom:32 }}>{currentQ?.question_type === "multi_tap" ? "Nobody got all answers correct." : "No correct answers this round"}</div>
              )}
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)", letterSpacing:2 }}>{isLastQ ? "SPACE: End Round" : "SPACE: Preview Next Question"}</div>
            </div>
          ) : !currentQ ? (
            <div style={{ textAlign:"center", marginTop:80, color:"rgba(255,255,255,0.4)", fontSize:18 }}>No questions in this round</div>
          ) : (
            <div className="qi-mc-question">
              <div className="qi-mc-question__meta">
                <span style={{ background:"rgba(190,38,193,0.2)", border:"1px solid rgba(190,38,193,0.4)", color:"#BE26C1", padding:"5px 16px", borderRadius:999, fontSize:13, fontWeight:700 }}>Q{qIdx+1} of {selectedRound.questions.length}</span>
                <span style={{ background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.15)", color:typeColor[currentQ.question_type]||"#aaa", padding:"5px 16px", borderRadius:999, fontSize:13, fontWeight:600 }}>{typeLabel[currentQ.question_type]||currentQ.question_type}</span>
                <span style={{ fontSize:13, color:"rgba(255,255,255,0.5)" }}>{currentQ.difficulty}</span>
                {hostPhase === "preview" && <span style={{ padding:"5px 16px", borderRadius:999, background:"rgba(190,38,193,0.18)", border:"1px solid #8A1B8D", fontSize:12, color:"#D94FDC" }}>HOST PREVIEW — not sent yet</span>}
                {hostPhase === "timer" && (
                  <div style={{ marginLeft:"auto", width:52, height:52, borderRadius:"50%", background:timeLeft<=3?"rgba(239,68,68,0.3)":"rgba(190,38,193,0.2)", border:"3px solid "+(timeLeft<=3?"#ef4444":"#BE26C1"), display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:800, color:timeLeft<=3?"#ef4444":"#BE26C1" }}>{timeLeft}</div>
                )}
              </div>

              <h1 className="qi-mc-question__title">{currentQ.question_text.replace(/^Play this track:\s*/i, "").replace(/^Show teams this image:\s*/i, "")}</h1>

              {currentQ.question_type==="multiple_choice" && (
              <div className="qi-mc-options">
                  {(["a","b","c","d"] as const).map(l => {
                    const opt = currentQ[("option_"+l) as keyof Question] as string;
                    const isCorrect = l===currentQ.correct_answer.toLowerCase();
                    const showCorrect = isCorrect;
                    return opt ? (
                      <div key={l} className={`qi-mc-option${showCorrect ? " qi-mc-option--correct" : ""}`}>
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
                    const showCorrect = isCorrect;
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
                      style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"14px 26px", borderRadius:14, background:"#150A2E", border:"1px solid #2E1A52", color:"#D94FDC", textDecoration:"none", fontSize:16, fontWeight:600 }}>
                      Play on YouTube
                    </a>
                  ) : (
                    <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"14px 26px", borderRadius:14, background:"rgba(190,38,193,0.12)", border:"1px solid #8A1B8D", color:"#D94FDC", fontSize:14, fontWeight:600 }}>
                      \u266a Auto-playing on display screen ({currentQ.playback_mode === "manual" ? "manual play button" : "auto-play"})
                    </div>
                  )}
                </div>
              )}

              {(
                <div className="qi-mc-answer-key">
                  <div style={{ fontSize:12, color:"rgba(34,197,94,0.7)", marginBottom:4, letterSpacing:2 }}>ANSWER</div>
                  <div style={{ fontSize:24, fontWeight:700, color:"#22c55e" }}>{getCorrectAnswerText(currentQ)}</div>
                  {currentQ.explanation && <div style={{ fontSize:14, color:"rgba(255,255,255,0.6)", marginTop:8 }}>{currentQ.explanation}</div>}
                </div>
              )}

              {/* Manual overrides only — the NEXT bar above is the primary flow, so
                  this row is deliberately small and secondary (jump out of sequence,
                  dump a question, skip ahead). Reduces the screen to one dominant action. */}
              <div className="qi-mc-manual">
                <span className="qi-mc-manual__label">Manual recovery controls</span>
                <button className="qi-button qi-button--quiet qi-mc-manual__button" onClick={doStartRound}>Start Round</button>
                <button className="qi-button qi-button--quiet qi-mc-manual__button" onClick={() => doPreviewQuestion(qIdx)} disabled={hostPhase==="preview"}>Preview Q</button>
                <button className="qi-button qi-button--quiet qi-mc-manual__button" onClick={doSendQuestion} disabled={hostPhase!=="preview"}>Send Live</button>
                <button className="qi-button qi-button--quiet qi-mc-manual__button" onClick={doStartTimer} disabled={hostPhase==="timer"}>{hostPhase==="timer" ? timeLeft+"s" : "Timer"}</button>
                <button className="qi-button qi-button--quiet qi-mc-manual__button" onClick={doRevealAnswer} disabled={hostPhase==="answer"}>Reveal</button>
                <button className="qi-button qi-button--quiet qi-mc-manual__button" onClick={doCelebrate}>Celebrate</button>
                <button className="qi-button qi-button--quiet qi-mc-manual__button" onClick={doDumpQuestion} title="Skip this question without scoring it - stays in the round for next time">Dump Q</button>
                {isLastQ ? (
                  <button className="qi-button qi-button--secondary qi-mc-manual__last" onClick={doEndRound}>End Round</button>
                ) : (
                  <button className="qi-button qi-button--secondary qi-mc-manual__last" onClick={() => doPreviewQuestion(qIdx+1)}>Next Q</button>
                )}
              </div>
            </div>
          )}
        </main>

        {/* RIGHT PANEL */}
        <aside className="qi-mc-rail" aria-label="Teams, answers and round settings">
          <section className="qi-mc-settings">
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <div className="fbh-lbl" style={{ margin:0 }}>Round Settings</div>
              <button className="fbh-btn" style={{ height:28, padding:"0 12px", fontSize:11 }} onClick={() => setRoundSettingsOpen((p: boolean) => !p)}>{roundSettingsOpen ? "Hide" : "Edit"}</button>
            </div>
            {roundSettingsOpen && (
              <div style={{ display:"flex", flexDirection:"column" as const, gap:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ font:"600 12px 'Inter'", color:"#B9A8D9", minWidth:110 }}>Points/question</label>
                  <input type="number" value={pointsPerQ} onChange={e => setPointsPerQ(Number(e.target.value))} style={{ width:60, padding:"6px 8px", borderRadius:10, background:"#0A0118", color:"#fff", border:"1px solid #2E1A52", font:"600 14px 'Inter'", textAlign:"center" as const }} />
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ font:"600 12px 'Inter'", color:"#B9A8D9", minWidth:110 }}>Timer - Picture/Audio (s)</label>
                  <input type="number" value={timerDuration} onChange={e => setTimerDuration(Number(e.target.value))} style={{ width:60, padding:"6px 8px", borderRadius:10, background:"#0A0118", color:"#fff", border:"1px solid #2E1A52", font:"600 14px 'Inter'", textAlign:"center" as const }} />
                </div>
                <div style={{ font:"400 11px 'Inter'", color:"#6B5A8E" }}>Multiple Choice/Sequence/TapType/Number = 15s, written answers = 30s (fixed)</div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ font:"600 12px 'Inter'", color:"#B9A8D9", minWidth:110 }}>Max time bonus</label>
                  <input type="number" value={timeBonus} onChange={e => setTimeBonus(Number(e.target.value))} style={{ width:60, padding:"6px 8px", borderRadius:10, background:"#0A0118", color:"#fff", border:"1px solid #2E1A52", font:"600 14px 'Inter'", textAlign:"center" as const }} />
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ font:"600 12px 'Inter'", color:"#B9A8D9", minWidth:110 }}>Danger Zone</label>
                  <button onClick={() => setDangerZone((p: boolean) => !p)} style={{ padding:"6px 16px", borderRadius:10, background:dangerZone?"rgba(190,38,193,0.25)":"#150A2E", border:"1px solid "+(dangerZone?"#D94FDC":"#2E1A52"), color:dangerZone?"#fff":"#6B5A8E", font:"700 12px 'Inter'", letterSpacing:".08em", cursor:"pointer" }}>{dangerZone ? "ON" : "OFF"}</button>
                </div>
                {dangerZone && (
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <label style={{ font:"600 12px 'Inter'", color:"#B9A8D9", minWidth:110 }}>Penalty pts</label>
                    <input type="number" value={dangerPenalty} onChange={e => setDangerPenalty(Number(e.target.value))} style={{ width:60, padding:"6px 8px", borderRadius:10, background:"#0A0118", color:"#fff", border:"1px solid #2E1A52", font:"600 14px 'Inter'", textAlign:"center" as const }} />
                  </div>
                )}
                {currentQ?.question_type === "multi_tap" && (
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <label style={{ font:"600 12px 'Inter'", color:"#B9A8D9", minWidth:110 }}>Wipeout Mode</label>
                    <button onClick={() => setWipeoutMode((p: boolean) => !p)} style={{ padding:"6px 16px", borderRadius:10, background:wipeoutMode?"rgba(190,38,193,0.25)":"#150A2E", border:"1px solid "+(wipeoutMode?"#D94FDC":"#2E1A52"), color:wipeoutMode?"#fff":"#6B5A8E", font:"700 12px 'Inter'", letterSpacing:".08em", cursor:"pointer" }}>{wipeoutMode ? "ON" : "OFF"}</button>
                    <span style={{ font:"400 11px 'Inter'", color:"#6B5A8E" }}>Q6-10 only: wrong tap zeroes that question</span>
                  </div>
                )}
                <button className="fbh-btn" style={{ height:34, marginTop:4 }} onClick={resetRoundPoints}>Reset Round Points</button>
              </div>
            )}
            {!roundSettingsOpen && (
              <div style={{ font:"400 12px 'Inter'", color:"#6B5A8E" }}>{pointsPerQ}pts/q · {getTimerForQuestion(currentQ, timerDuration)}s · +{timeBonus} bonus · {dangerZone ? "Danger Zone -"+dangerPenalty+"pts" : "Normal"}</div>
            )}
          </section>

          <section className="qi-mc-teams">
            <div className="qi-mc-teams__header"><div><span>Live answers</span><strong>Teams & scores</strong></div><StatusPill tone="live">{answers.length}/{teams.length} answered</StatusPill></div>
            {scores.length === 0 && teams.length > 0 && (
              <>
                <button onClick={() => ensureScores(sessionPin, teams)} style={{ width:"100%", padding:"9px", borderRadius:10, background:"rgba(190,38,193,0.2)", border:"1px solid rgba(190,38,193,0.4)", color:"#BE26C1", fontSize:13, fontWeight:600, cursor:"pointer", marginBottom:12 }}>Initialise Scores</button>
                {teams.map(t => (
                  <div key={t.id} className="qi-mc-team-card">
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{ width:7, height:7, borderRadius:"50%", background:"#D94FDC", flexShrink:0 }} />
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
                <div key={s.team_name} className={`qi-mc-team-card${isFastest ? " qi-mc-team-card--fastest" : ""}`} style={{ borderColor:isFastest?"#BE26C1":medal||"rgba(255,255,255,0.12)" }}>
                  <div className="qi-mc-team-card__summary">
                    <span style={{ fontSize:16, fontWeight:800, color:medal||"rgba(255,255,255,0.45)", minWidth:26 }}>{i+1}.</span>
                    <span className="fbh-crest" style={{ width:20, height:20, fontSize:7, flexShrink:0 }}>{teamInitials(s.team_name)}</span>
                    <span style={{ fontWeight:700, fontSize:14, flex:1, color:"#fff" }}>{s.team_name}{isFastest?" ⚡":""}</span>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:answered?"#D94FDC":"rgba(185,168,217,0.2)", flexShrink:0 }} />
                    <span style={{ fontSize:19, fontWeight:800, color:"#BE26C1", minWidth:42, textAlign:"right" as const, fontVariantNumeric:"tabular-nums" }}>{s.total_points}</span>
                  </div>
                  <div className="qi-mc-team-card__answer">
                    {answered ? (() => {
                      // Submission order + reveal-gated correctness. Green/red only
                      // AFTER reveal (design law: green = correct only). Before
                      // reveal the answer shows neutral, never green.
                      const ord = submissionOrder(s.team_name);
                      const ansObj = teamAnswerObj(s.team_name);
                      const correct = answersRevealed && ansObj && currentQ ? isAnswerCorrect(ansObj, currentQ) : null;
                      const ansColor = correct === true ? "#2EE06E" : correct === false ? "#FF3B4E" : "rgba(255,255,255,0.72)";
                      return (
                        <>
                          {ord !== null && <span style={{ fontSize:10, fontWeight:800, color:"rgba(255,255,255,0.4)", flexShrink:0, minWidth:22 }}>#{ord}</span>}
                          <span style={{ fontSize:13, color:ansColor, fontWeight:600, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{ans}</span>
                        </>
                      );
                    })() : (
                      <span style={{ fontSize:12, color:"rgba(255,255,255,0.3)", fontStyle:"italic", flex:1 }}>waiting…</span>
                    )}
                    <PowerCardDots teamName={s.team_name} />
                    {adjustTeam === s.team_name ? (
                      <div style={{ display:"flex", gap:4, marginLeft:"auto" }}>
                        <input type="number" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} placeholder="+/-" style={{ width:52, padding:"2px 4px", borderRadius:6, background:"rgba(255,255,255,0.1)", color:"#fff", border:"1px solid rgba(190,38,193,0.4)", fontSize:12, textAlign:"center" as const }} />
                        <button onClick={() => adjustScore(s.team_name, Number(adjustAmount))} style={{ padding:"2px 8px", borderRadius:6, background:"#BE26C1", border:"none", color:"#fff", fontSize:11, cursor:"pointer" }}>OK</button>
                        <button onClick={() => { setAdjustTeam(null); setAdjustAmount(""); }} aria-label="Cancel score adjustment" style={{ padding:"2px 6px", borderRadius:6, background:"rgba(255,255,255,0.08)", border:"none", color:"#aaa", fontSize:11, cursor:"pointer" }}>X</button>
                      </div>
                    ) : (
                      <button onClick={() => setAdjustTeam(s.team_name)} style={{ marginLeft:"auto", fontSize:10, padding:"2px 6px", borderRadius:6, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.45)", cursor:"pointer" }}>+/- pts</button>
                    )}
                  </div>
                </div>
              );
            })}
            {(() => {
              const thisRoundCards = unoCards.filter(c => c.round_number === roundNumber);
              return thisRoundCards.length > 0 && (
                <div style={{ marginTop:14, paddingTop:14, borderTop:"1px solid rgba(190,38,193,0.15)" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"rgba(190,38,193,0.65)", marginBottom:8, letterSpacing:2 }}>ACTIVE POWER CARDS THIS ROUND</div>
                  {thisRoundCards.map((card,i) => (
                    <div key={card.id||i} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", borderRadius:8, background:"rgba(255,255,255,0.04)", marginBottom:4 }}>
                      <span style={{ color:cardColor[card.card_type], fontWeight:700, fontSize:11, minWidth:44 }}>{cardLabel[card.card_type]}</span>
                      <span style={{ color:"rgba(255,255,255,0.65)", fontSize:11 }}>{card.team_name}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </section>
        </aside>
      </div>
      {FEATURE_FLAGS.diagnostics && <HostDiagnostics
        open={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
        session={{ id: sessionId, pin: sessionPin, eventName: sessionEventName, quizPlan: sessionQuizPlan, venue: venueName, host: hostIdentity, phase: hostPhase, roundName: selectedRound?.name, roundNumber, questionIndex: qIdx, questionCount: selectedRound?.questions.length || 0, status: connected ? "active" : "disconnected", connectedAt }}
        teams={teams}
        answers={answers}
        timer={{ remaining: timeLeft, running: hostPhase === "timer" && timeLeft > 0, duration: timerDuration }}
        realtime={{ status: realtimeStatus, lastSync: realtimeLastSync, lastReconnect: realtimeLastReconnect, errors: realtimeErrors }}
        onResyncSession={diagnosticsResyncSession}
        onRestartSubscriptions={() => { if (sessionPin) subscribeToUpdates(sessionPin); }}
        onRefreshDisplay={() => { if (sessionPin) window.open(`/host/display?pin=${encodeURIComponent(sessionPin)}`, "quizit-display"); }}
        onRefreshPlayers={diagnosticsRefreshPlayers}
      />}
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
        <Image src="/me-logo.jpg" alt="Mac Entertainment" width={16} height={16} style={{ borderRadius: "50%" }} />
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: 0.3 }}>
          <span style={{ fontFamily: "'Bruno Ace SC',sans-serif" }}>Quiz-It</span><span style={{ fontFamily: "'Inter',sans-serif" }}> · Powered by Mac Entertainment · by Sonya Mac</span>
        </span>
      </div>
    </Suspense>
  );
}
