"use client";
import { useEffect, useState, useRef, Suspense, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMediaUrl } from "@/lib/getMediaUrl";
import { SpinWheel, buildTeamSegments } from "@/components/SpinWheel";
import { SlotReels } from "@/components/SlotReels";
import { PursuitPhase, PursuitRace, readPursuitState, readRace, readQIndex, pursuitCorrectAnswerText, PURSUIT_TOTAL_QUESTIONS } from "@/lib/quiz/pursuit";
import { PursuitBoard } from "@/components/PursuitBoard";
import { teamInitials } from "@/components/TeamBadge";
import { RoundStart, RoundEnd, Intermission, WaitingForHost } from "@/components/fable/DisplayStates";
import { playShowAudio, preloadShowAudio, stopAllShowAudio, stopShowAudio } from "@/lib/audio/showAudio";
import { PLATFORM_CONFIG } from "@/lib/platform/config";

type Question = {
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_answer: string;
  explanation?: string;
  playback_mode?: string;
  replay_mode?: string;
  fade_in?: boolean;
  fade_out?: boolean;
};
type Score = { team_name: string; total_points: number; };
type Phase = "waiting" | "round_start" | "question" | "answer" | "celebration" | "round_end" | "scoreboard" | "quiz_end" | "hard_deck" | "intermission" | "spin_to_win" | "pursuit";

// Real, automatic audio playback for "audio" question types - this replaces
// what used to be the host manually alt-tabbing to YouTube on their own laptop.
// Preloads immediately on mount (the clip is a short, lightweight file on a
// fast CDN, so buffering is sub-second even on a venue's imperfect wifi),
// respects the host's chosen playback_mode/replay_mode/fade settings, and
// silently does nothing for legacy questions whose option_b is still a
// youtube.com URL (those still rely on the existing manual host link).
function LiveAudioPlayer({ question }: { question: Question }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [manualPlayed, setManualPlayed] = useState(false);
  const url = getMediaUrl(question.option_b);
  const isLegacyYouTube = !!url && url.includes("youtube.com");

  useEffect(() => {
    setManualPlayed(false);
  }, [url]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !url || isLegacyYouTube) return;
    el.loop = question.replay_mode === "unlimited";
    const fadeMs = 1200;
    if (question.fade_in) el.volume = 0; else el.volume = 1;

    function rampVolume(target: number, ms: number) {
      const audioEl = el as HTMLAudioElement;
      const start = audioEl.volume;
      const startTime = performance.now();
      function step(now: number) {
        const t = Math.min(1, (now - startTime) / ms);
        audioEl.volume = start + (target - start) * t;
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    if (question.fade_in) rampVolume(1, fadeMs);

    if (question.fade_out && el.duration) {
      const onTimeUpdate = () => {
        if (el.duration - el.currentTime <= fadeMs / 1000 && !el.loop) {
          rampVolume(0, fadeMs);
        }
      };
      el.addEventListener("timeupdate", onTimeUpdate);
      return () => el.removeEventListener("timeupdate", onTimeUpdate);
    }
  }, [url, question.fade_in, question.fade_out, question.replay_mode, isLegacyYouTube]);

  if (!url || isLegacyYouTube) return null;

  const isManualMode = question.playback_mode === "manual";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <audio
        ref={audioRef}
        src={url}
        preload="auto"
        autoPlay={!isManualMode}
        style={{ display: "none" }}
      />
      {isManualMode && !manualPlayed && (
        <button
          onClick={() => { audioRef.current?.play(); setManualPlayed(true); }}
          style={{ padding: "14px 28px", borderRadius: 14, background: "rgba(190,38,193,0.25)", border: "2px solid #BE26C1", color: "#fff", fontSize: 20, fontWeight: 700, cursor: "pointer" }}
        >
          \u25b6 Play Track
        </button>
      )}
    </div>
  );
}

const PRELOAD_SOUNDS = ["airhorn.mp3", "sad-trombone.mp3", "round-start.mp3", "clapping-scores.mp3"];

// Lobby Power-Card rules rotation. Rules mirror the real cards in
// components/UnoCards.tsx; colours are the locked feature tokens
// (Time-Out = blue, Boost = yellow, Reverse = red).
const POWER_CARD_INFO = [
  { name: "TIME-OUT", sigil: "⏸", color: "#38A8FF", glow: "rgba(56,168,255,.45)", rule: "Freezes every other team for 10 seconds." },
  { name: "BOOST", sigil: "⚡", color: "#FFC533", glow: "rgba(255,197,51,.45)", rule: "Doubles your points for every correct answer this round." },
  { name: "REVERSE", sigil: "↻", color: "#FF3B4E", glow: "rgba(255,59,78,.45)", rule: "Reverses the digits of your score." },
];
function playSound(file: string, volume = 1.0) {
  const timerCue = file.includes("countdown") || file === "lock.mp3";
  return playShowAudio(file, { channel: timerCue ? "timer" : "cue", volume });
}

function DisplayFullscreenControl() {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  if (fullscreen) return null;
  return <button type="button" className="qi-display-fullscreen" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>FULLSCREEN</button>;
}

// Power card explainer screens shown one at a time on the lobby/waiting screen,
// so players learn what each card does before they need to use one mid-game.
// Colors match the host dashboard's cardColor map exactly for consistency.
const POWER_CARDS = [
  { type: "block", emoji: "\u23F8\uFE0F", title: "Time-Out", color: "#3b82f6", desc: "Freezes every OTHER team from answering for a short window, so you get a free run at the question with no competition." },
  { type: "x2", emoji: "\u26A1", title: "Boost", color: "#eab308", desc: "Doubles your team's points for every correct answer in the current round." },
  { type: "reverse", emoji: "\u21BB", title: "Reverse", color: "#ef4444", desc: "Reverses the digits of your team's score." },
];

// Display-only Power Card overlays: a compact top-centre announcement (slides/
// fades in, ~1.2s, then fades out) and a persistent bottom-right list of cards
// active this round. Rendered via createPortal into the existing document.body
// node - no manual DOM node creation, no innerHTML, purely React-rendered JSX.
// A single component so it can be dropped into each phase branch's JSX without
// restructuring the file's existing per-phase early-return structure.
function PowerCardOverlays({ currentAnnounce, announceVisible, roundCardPlays, roundNumber }: {
  currentAnnounce: { team: string; type: string } | null;
  announceVisible: boolean;
  roundCardPlays: { team_name: string; card_type: string; round_number: number | null }[];
  roundNumber: number;
}) {
  if (typeof document === "undefined") return null;
  const thisRoundCards = roundCardPlays.filter(c => c.round_number === roundNumber);
  return createPortal(
    <>
      {currentAnnounce && (
        <div style={{
          position: "fixed", top: 28, left: "50%",
          transform: announceVisible ? "translate(-50%, 0) scale(1)" : "translate(-50%, -16px) scale(0.96)",
          opacity: announceVisible ? 1 : 0,
          transition: "opacity 0.35s ease, transform 0.35s ease",
          zIndex: 9999, pointerEvents: "none",
          display: "flex", alignItems: "center", gap: 18,
          padding: "18px 34px", borderRadius: 18,
          background: "rgba(20,5,40,0.96)",
          border: "2px solid " + (POWER_CARDS.find(p => p.type === currentAnnounce.type)?.color || "#BE26C1"),
          boxShadow: "0 8px 40px rgba(0,0,0,0.55), 0 0 30px " + (POWER_CARDS.find(p => p.type === currentAnnounce.type)?.color || "#BE26C1") + "66",
          fontFamily: "'Inter', sans-serif",
        }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1.5, color: POWER_CARDS.find(p => p.type === currentAnnounce.type)?.color || "#BE26C1" }}>
            {"\u26A1 POWER CARD"}
          </span>
          <span style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{currentAnnounce.team}</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: POWER_CARDS.find(p => p.type === currentAnnounce.type)?.color || "#fff" }}>
            {POWER_CARDS.find(p => p.type === currentAnnounce.type)?.title || currentAnnounce.type}
          </span>
        </div>
      )}
      {thisRoundCards.length > 0 && (
        <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 9998, display: "flex", flexDirection: "column", gap: 6, fontFamily: "'Inter', sans-serif" }}>
          {thisRoundCards.map((c, i) => {
            const card = POWER_CARDS.find(p => p.type === c.card_type);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 10, background: "rgba(20,5,40,0.9)", border: "1px solid " + (card?.color || "#888"), color: "#fff", fontSize: 13, fontWeight: 600 }}>
                <span>{card?.emoji}</span><span>{c.team_name}</span><span style={{ color: "rgba(255,255,255,0.5)" }}>{card?.title}</span>
              </div>
            );
          })}
        </div>
      )}
    </>,
    document.body
  );
}

function DisplayScreenInner() {
  const searchParams = useSearchParams();
  const autoConnectedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  // Live "locked in" count: distinct teams that have submitted an answer for the
  // CURRENT question, driven by realtime answers INSERTs (not the post-reveal
  // answered_teams snapshot). qIndexRef lets the once-subscribed answers callback
  // filter to the current question without re-subscribing.
  const [lockedTeams, setLockedTeams] = useState<string[]>([]);
  const qIndexRef = useRef(0);
  const lockedQuestionRef = useRef(-1);
  // Lobby Power-Card rules rotation (Time-Out · Boost · Reverse), one at a time.
  const [powerCardIdx, setPowerCardIdx] = useState(0);
  const displayChannelRef = useRef<ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]> | null>(null);
  useEffect(() => () => {
    if (displayChannelRef.current) {
      void createSupabaseBrowserClient().removeChannel(displayChannelRef.current);
      displayChannelRef.current = null;
    }
  }, []);
  useEffect(() => {
    if (phase !== "waiting") return;
    const id = setInterval(() => setPowerCardIdx(i => (i + 1) % 3), PLATFORM_CONFIG.display.powerCardRotationMilliseconds);
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => {
    preloadShowAudio(PRELOAD_SOUNDS);
    return () => stopAllShowAudio();
  }, []);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [sessionPin, setSessionPin] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [fastestTeam, setFastestTeam] = useState<string|null>(null);
  const [fastestSong, setFastestSong] = useState<string|null>(null);
  const [hardDeckTeam, setHardDeckTeam] = useState<string|null>(null);
  const [hardDeckCards, setHardDeckCards] = useState<{ rank: number; suit: string }[]>([]);
  const [hardDeckStatus, setHardDeckStatus] = useState<string>("idle");
  const [hardDeckPotential, setHardDeckPotential] = useState(0);
  const [hardDeckWheelTarget, setHardDeckWheelTarget] = useState<number|null>(null);
  const [hardDeckWheelSpinning, setHardDeckWheelSpinning] = useState(false);
  const prevHardDeckStatusRef = useRef<string>("idle");
  // THE PURSUIT — display-side mirror of pursuit_status + the pursuit_data race.
  const [pursuitStatus, setPursuitStatus] = useState<PursuitPhase>("idle");
  const [pursuitRace, setPursuitRace] = useState<PursuitRace>({});
  const [pursuitQIndex, setPursuitQIndex] = useState(-1);
  const prevPursuitStatusRef = useRef<string>("idle");
  const prevPursuitRaceRef = useRef<PursuitRace>({});
  const pursuitUrgentPlayedRef = useRef<number>(-1);
  const pursuitLockPlayedRef = useRef<number>(-1);
  // Pursuit countdown urgency (last 5s) + lock click on expiry — once per gate.
  useEffect(() => {
    if (pursuitStatus !== "question" || timeLeft === null) return;
    if (timeLeft === 5 && pursuitUrgentPlayedRef.current !== pursuitQIndex) {
      pursuitUrgentPlayedRef.current = pursuitQIndex;
      playSound("countdown-urgent.mp3", 0.35);
    }
    if (timeLeft === 0 && pursuitLockPlayedRef.current !== pursuitQIndex) {
      pursuitLockPlayedRef.current = pursuitQIndex;
      playSound("lock.mp3", 0.5);
    }
  }, [timeLeft, pursuitStatus, pursuitQIndex]);
  const [teams, setTeams] = useState<{ team_name: string; victory_song?: string; photo_url?: string; photo_approved?: boolean }[]>([]);
  // Lobby crest wall — flare newly-arrived teams once, then let them settle.
  const [flaringTeams, setFlaringTeams] = useState<Set<string>>(new Set());
  const seenTeamsRef = useRef<Set<string>>(new Set());
  const lobbySeededRef = useRef(false);
  useEffect(() => {
    const names = teams.map(t => t.team_name);
    if (!lobbySeededRef.current) {
      if (names.length > 0) { names.forEach(n => seenTeamsRef.current.add(n)); lobbySeededRef.current = true; }
      return;
    }
    const fresh = names.filter(n => !seenTeamsRef.current.has(n));
    if (fresh.length === 0) return;
    fresh.forEach(n => seenTeamsRef.current.add(n));
    setFlaringTeams(prev => new Set([...prev, ...fresh]));
    const id = setTimeout(() => setFlaringTeams(prev => { const s = new Set(prev); fresh.forEach(n => s.delete(n)); return s; }), 1600);
    return () => clearTimeout(id);
  }, [teams]);
  // teams is read inside realtime subscription callbacks set up once at
  // connect-time, whose closures freeze component state at that moment
  // (before the teams fetch has even resolved) - this ref always holds the
  // current value regardless, matching the sessionId staleness fix pattern.
  const teamsRef = useRef(teams);
  useEffect(() => { teamsRef.current = teams; }, [teams]);
  const [showWinnerPhoto, setShowWinnerPhoto] = useState(false);
  const winnerPhotoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winnerPhotoStartedForRef = useRef<string | null>(null);
  const [roundName, setRoundName] = useState("");
  const [roundNumber, setRoundNumber] = useState(1);
  const [scoreboardData, setScoreboardData] = useState<Score[]>([]);
  const [hideLeaderboard, setHideLeaderboard] = useState(false);
  const [allowPowerCards, setAllowPowerCards] = useState(true);
  // Leaderboard climber chips — movement since the previous board (climbers only).
  const prevRanksRef = useRef<Map<string, number>>(new Map());
  const [rankMoves, setRankMoves] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (scoreboardData.length === 0) return;
    const sorted = [...scoreboardData].sort((a, b) => b.total_points - a.total_points);
    const moves = new Map<string, number>();
    const next = new Map<string, number>();
    sorted.forEach((s, i) => {
      const prev = prevRanksRef.current.get(s.team_name);
      if (prev !== undefined && prev > i) moves.set(s.team_name, prev - i);
      next.set(s.team_name, i);
    });
    setRankMoves(moves);
    prevRanksRef.current = next;
  }, [scoreboardData]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [quizEndScores, setQuizEndScores] = useState<Score[]>([]);
  const [trophyVisible, setTrophyVisible] = useState(false);
  const [intermissionOffers, setIntermissionOffers] = useState("");
  const [intermissionWhatsapp, setIntermissionWhatsapp] = useState("");
  const [intermissionOtherQuizzes, setIntermissionOtherQuizzes] = useState("");
  const [spinTargetIdx, setSpinTargetIdx] = useState<number|null>(null);
  const [spinNonce, setSpinNonce] = useState<number | null>(null);
  // Tracks which spin_nonce has already forced phase to spin_to_win once.
  // Prevents a stale/out-of-order delivery (poll vs realtime race) from
  // re-forcing the phase back to spin_to_win after the spin has genuinely
  // completed and been cleared - which was remounting SlotReels and
  // restarting the spin audio.
  const spinNonceHandledRef = useRef<number | null>(null);

  const seenCardPlaysRef = useRef<Set<string>>(new Set());
  // Full running list of card plays in this session. It is hydrated on connect
  // as well as updated through realtime, so display refreshes preserve the
  // current-round effect reminders while uno_cards remains the permanent log.
  const [roundCardPlays, setRoundCardPlays] = useState<{ team_name: string; card_type: string; round_number: number | null }[]>([]);

  // Compact top-centre announcement, display-only. A queue ensures multiple
  // near-simultaneous plays are shown one at a time, never overlapping.
  const [announceQueue, setAnnounceQueue] = useState<{ team: string; type: string }[]>([]);
  const [currentAnnounce, setCurrentAnnounce] = useState<{ team: string; type: string } | null>(null);
  const [announceVisible, setAnnounceVisible] = useState(false);
  useEffect(() => {
    if (currentAnnounce || announceQueue.length === 0) return;
    const next = announceQueue[0];
    setAnnounceQueue(q => q.slice(1));
    setCurrentAnnounce(next);
  }, [announceQueue, currentAnnounce]);
  useEffect(() => {
    if (!currentAnnounce) return;
    setAnnounceVisible(true);
    const fadeOutTimer = setTimeout(() => setAnnounceVisible(false), PLATFORM_CONFIG.display.announcementVisibleMilliseconds);
    const clearTimer = setTimeout(() => setCurrentAnnounce(null), PLATFORM_CONFIG.display.announcementClearMilliseconds);
    return () => { clearTimeout(fadeOutTimer); clearTimeout(clearTimer); };
  }, [currentAnnounce]);
  const celebrationPlayingForRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  // Tracks the full timer duration so the SVG ring can show correct progress
  const timerTotalRef = useRef<number>(30);

  const purple = "#BE26C1";


  // Track picture sub-phase: "image_only" -> "question_visible"
  const [pictureSubPhase, setPictureSubPhase] = useState<"image_only"|"question_visible">("image_only");
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  const prevQuizEndRevealedRef = useRef<number>(0);
  const prevPhaseForQuizEndRef = useRef<string>("");
  const trophyCelebrationFiredRef = useRef(false);
  // Single source of truth for the end-of-quiz winner audio. Both the final
  // team reveal and the trophy/podium reveal used to independently start the
  // airhorn/victory-song sequence, so whichever fired second paused and
  // restarted the first - cutting the winner's song short (or making it seem
  // inaudible). This guard guarantees the sequence starts exactly once, at the
  // winner reveal, and is not restarted by the later phase/trophy update.
  const winnerCelebrationFiredRef = useRef(false);
  function playWinnerCelebration(winnerName?: string) {
    if (winnerCelebrationFiredRef.current) return;
    winnerCelebrationFiredRef.current = true;
    stopClapping();
    const winnerTeam = winnerName ? teamsRef.current.find(t => t.team_name === winnerName) : null;
    // The winner's victory theme is the primary audio. The airhorn is a brief accent.
    playSound("airhorn.mp3", 0.6);
    // Start the winning team's configured victory song at full volume and let it
    // play to its natural end - no forced stop timer, so it is never cut short.
    stopShowAudio("music");
    if (winnerTeam?.victory_song) {
      playShowAudio(encodeURIComponent(winnerTeam.victory_song) + ".mp3", { channel: "music", volume: 0.9 });
    }
  }
  function handleRevealNext(nextCount: number) {
    const sorted = [...quizEndScores].sort((a,b) => a.total_points - b.total_points);
    setRevealedCount(nextCount);
    const isFirst = nextCount === sorted.length && sorted.length > 0;
    if (isFirst) {
      // Winner reveal: fire the (once-only) winner celebration. Do NOT also play
      // any generic per-reveal sound here; it would compete with the winner sequence.
      const winner = sorted[sorted.length - 1];
      playWinnerCelebration(winner?.team_name);
    }
  }

  function stopClapping() {
    stopShowAudio("ambient");
  }

  function triggerCardFlash(team: string, type: string, roundNum: number | null, dedupKey: string) {
    if (seenCardPlaysRef.current.has(dedupKey)) return;
    seenCardPlaysRef.current.add(dedupKey);
    setRoundCardPlays(prev => [...prev, { team_name: team, card_type: type, round_number: roundNum }]);
    setAnnounceQueue(q => [...q, { team, type }]);
  }
  async function hydrateCardPlays(pin: string) {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("uno_cards").select("id, team_name, card_type, round_number").eq("session_pin", pin).order("played_at", { ascending: true });
    if (!data) return;
    seenCardPlaysRef.current = new Set(data.map(c => String(c.id)));
    setRoundCardPlays(data.map(c => ({ team_name: c.team_name, card_type: c.card_type, round_number: c.round_number ?? null })));
  }
  function applySession(data: Record<string, unknown>) {
    const newPhase = (data.phase as Phase) || "waiting";
    const spinChoiceVal = (data.spin_choice as string) || null;
    const spinNonceVal = (data.spin_nonce as number) ?? null;
    if (spinChoiceVal === "spin" && spinNonceVal !== null && spinNonceHandledRef.current !== spinNonceVal) {
      spinNonceHandledRef.current = spinNonceVal;
      setPhase("spin_to_win");
    } else {
      setPhase(newPhase);
    }
    setQuestion((data.current_question as Question) || null);
    setQuestionIndex((data.current_question_index as number) ?? 0);
    qIndexRef.current = (data.current_question_index as number) ?? 0;
    if (data.picture_sub_phase === "question_visible" || data.picture_sub_phase === "image_only") {
      setPictureSubPhase(data.picture_sub_phase);
    }
    setRoundName((data.round_name as string) || "");
    setRoundNumber((data.round_number as number) || 1);
    setHideLeaderboard(!!data.hide_leaderboard);
    setAllowPowerCards(data.allow_power_cards !== false);
    const ft = (data.fastest_team as string) || null;
    const fs = (data.fastest_song as string) || null;
    setFastestTeam(ft);
    if (ft && newPhase === "celebration") {
      if (winnerPhotoStartedForRef.current !== ft) {
        winnerPhotoStartedForRef.current = ft;
        setShowWinnerPhoto(false);
        if (winnerPhotoTimerRef.current) clearTimeout(winnerPhotoTimerRef.current);
        winnerPhotoTimerRef.current = setTimeout(() => setShowWinnerPhoto(true), PLATFORM_CONFIG.display.winnerPhotoDelayMilliseconds);
      }
    } else if (newPhase !== "celebration") {
      winnerPhotoStartedForRef.current = null;
      setShowWinnerPhoto(false);
    }
    setFastestSong(fs);
    setHardDeckTeam((data.hard_deck_team as string) || null);
    setHardDeckCards((data.hard_deck_cards as { rank: number; suit: string }[]) || []);
    setHardDeckStatus((data.hard_deck_status as string) || "idle");
    setHardDeckPotential((data.hard_deck_potential as number) || 0);
    setHardDeckWheelTarget((data.hard_deck_wheel_target as number) ?? null);
    setHardDeckWheelSpinning(!!data.hard_deck_wheel_spinning);
    {
      const newHDStatus = (data.hard_deck_status as string) || "idle";
      const newHDPotential = (data.hard_deck_potential as number) || 0;
      if (newHDStatus !== prevHardDeckStatusRef.current) {
        if (newHDStatus === "won") {
          if (newHDPotential >= 40) {
            playSound("airhorn.mp3", 1.0);
          }
        } else if (newHDStatus === "lost") {
          playSound("sad-trombone.mp3", 0.9);
        }
        prevHardDeckStatusRef.current = newHDStatus;
      }
    }
    {
      // THE PURSUIT — hydrate the display mirror from pursuit_status + pursuit_data.
      const p = readPursuitState(data);
      const newRace = readRace(p);
      setPursuitStatus(p.status);
      setPursuitRace(newRace);
      setPursuitQIndex(readQIndex(p));

      // Pursuit audio via the existing playSound system, fired on status
      // transitions + race outcome. Every filename below resolves to a real file
      // in public/sounds/ (playSound also swallows any missing-file error).
      const prevStatus = prevPursuitStatusRef.current;
      if (p.status !== prevStatus) {
        if (p.status === "intro") { playSound("round-start.mp3", 0.65); }
        else if (p.status === "reveal") { playSound("correct-chime.mp3", 0.5); }
        else if (p.status === "advance") {
          const prevRace = prevPursuitRaceRef.current;
          const names = teams.map(t => t.team_name);
          const gate7 = readQIndex(p) >= PURSUIT_TOTAL_QUESTIONS - 1;
          const advanced = names.some(n => (newRace[n]?.stage ?? 0) > (prevRace[n]?.stage ?? 0) && newRace[n]?.status !== "eliminated");
          const newlyFinished = names.some(n => newRace[n]?.status === "completed" && prevRace[n]?.status !== "completed");
          // Runner advancing → footsteps; the final sprint (gate 7) is the same
          // footsteps, louder. Eliminations stay silent.
          if (advanced) playSound("footsteps.mp3", gate7 ? 0.65 : 0.4);
          if (newlyFinished) playSound("airhorn.mp3", 0.45);
          // Lane compaction whoosh — fired once at COMPACTION_DELAY (1300ms), after
          // the runners have finished moving, as the surviving lanes reflow. Well
          // clear of the footsteps at t=0, so the two never overlap.
          setTimeout(() => playSound("whoosh.mp3", 0.3), 1300);
        }
        else if (p.status === "complete") {
          // Nobody finished → one sad trombone. Finishers already received their
          // finish cue, so no extra audio here.
          const finishers = Object.values(newRace).filter(e => e.status === "completed").length;
          if (finishers === 0) playSound("sad-trombone.mp3", 0.9);
        }
        prevPursuitStatusRef.current = p.status;
      }
      prevPursuitRaceRef.current = newRace;
    }
    setIntermissionOffers((data.intermission_offers as string) || "");
    setIntermissionWhatsapp((data.intermission_whatsapp as string) || "");
    setIntermissionOtherQuizzes((data.intermission_other_quizzes as string) || "");
    setSpinTargetIdx((data.spin_target_idx as number) ?? null);
    setSpinNonce((data.spin_nonce as number) ?? null);

    if (newPhase === "scoreboard") {
      setScoreboardData((data.scoreboard_data as Score[]) || []);
    }

    // Reset picture sub-phase when new question arrives
    if (newPhase === "question" && lockedQuestionRef.current !== qIndexRef.current) {
      lockedQuestionRef.current = qIndexRef.current;
      const q = data.current_question as {question_type?: string} | null;
      if (q?.question_type === "picture") {
        setPictureSubPhase("image_only");
        setImageLoadFailed(false);
      }
      setLockedTeams([]); // reset the live locked-in meter at the start of every question
    }

    // Picture sub-phase: advance from image_only to question_visible
    if ((data as any).picture_sub_phase === "question_visible") {
      setPictureSubPhase("question_visible");
    }

    if (newPhase === "quiz_end") {
      const scores = (data.scoreboard_data as Score[]) || [];
      setQuizEndScores(scores);
      const syncedCount = (data.quiz_end_revealed_count as number) || 0;
      const syncedTrophy = !!data.quiz_end_trophy_visible;
      if (prevPhaseForQuizEndRef.current !== "quiz_end") {
        prevQuizEndRevealedRef.current = 0;
        setRevealedCount(0);
        setTrophyVisible(false);
        trophyCelebrationFiredRef.current = false;
        winnerCelebrationFiredRef.current = false;
        stopClapping();
        stopShowAudio("music");
        playShowAudio("clapping-scores.mp3", { channel: "ambient", volume: 0.45, loop: true });
      } else if (syncedCount > prevQuizEndRevealedRef.current) {
        prevQuizEndRevealedRef.current = syncedCount;
        handleRevealNext(syncedCount);
      }
      if (syncedTrophy) {
        setTrophyVisible(true);
        // Safety net: the trophy podium showing means the quiz is finished -
        // guarantee clapping stops and the winner celebration fires here too,
        // even if the per-team reveal count didn't land exactly on the last team.
        stopClapping();
        if (!trophyCelebrationFiredRef.current) {
          trophyCelebrationFiredRef.current = true;
          // Safety net if the per-team reveal count never landed exactly on the
          // last team: the (once-only) guard means this is a no-op when the
          // winner reveal already started the celebration, so the victory song
          // keeps playing rather than being restarted/cut short.
          const sorted = [...scores].sort((a,b) => a.total_points - b.total_points);
          const winner = sorted[sorted.length - 1];
          playWinnerCelebration(winner?.team_name);
        }
      }
    }
    prevPhaseForQuizEndRef.current = newPhase;

    if (newPhase === "celebration" && ft && fs) {
      // Only (re)start the song if this is a genuinely new celebration (different team),
      // not just another applySession call (polling/realtime) for the same one already playing.
      if (celebrationPlayingForRef.current !== ft) {
        celebrationPlayingForRef.current = ft;
        stopShowAudio("music");
        playShowAudio(encodeURIComponent(fs) + ".mp3", { channel: "music", volume: 0.8 });
      }
    } else if (newPhase === "celebration" && !ft) {
      // Nobody got this one right - previously this played no sound at all, which
      // read as the screen just being broken/unresponsive. A sad trombone gives
      // the room a clear, deliberate "nobody got it" beat instead of dead air.
      if (celebrationPlayingForRef.current !== "__no_winner__") {
        celebrationPlayingForRef.current = "__no_winner__";
        playSound("sad-trombone.mp3", 0.9);
      }
    } else if (newPhase === "spin_to_win") {
      // The host now moves the Display into this phase as soon as they click
      // "Offer Spin to Win" - before the wheel has actually spun (spin_target_idx
      // is still null at that point). Cutting the victory song at that instant,
      // as this used to do unconditionally, silenced it every time a spin was
      // offered quickly - which read as "the song didn't play" for that team.
      // Only stop it once a real spin starts (spin_target_idx present); while
      // merely offered/idle, let the song keep playing under the wheel screen.
      // Deliberately do NOT reset celebrationPlayingForRef to null here either
      // way. The spin-cleanup timeout on the host writes phase back to
      // "celebration" with the SAME fastest_team/fastest_song still set (it only
      // clears the spin_* columns) - if this ref were nulled out, that return
      // trip would look like "a genuinely new celebration" for the same team
      // and replay the victory song a second time.
      if (data.spin_target_idx != null) stopShowAudio("music");
    } else if (newPhase === "quiz_end") {
      // The podium winner celebration owns the music channel during the finale.
      // Do NOT let the generic celebration-exit cleanup below
      // pause/clear it - that was a path to the winner song being silenced/cut
      // short. Any leftover question-celebration song was already stopped on
      // quiz_end entry.
    } else {
      // Left celebration for something else entirely (Hard Deck, next question,
      // round end, etc) - this is a genuine exit, so the next celebration
      // (even for the same team on a later question) must be treated as new.
      if (celebrationPlayingForRef.current !== null) {
        celebrationPlayingForRef.current = null;
        stopShowAudio("music");
      }
    }
    if (data.timer_started_at && data.timer_duration) {
      const started = new Date(data.timer_started_at as string).getTime();
      const duration = data.timer_duration as number;
      timerTotalRef.current = duration;
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
    }, PLATFORM_CONFIG.timers.tickMilliseconds);
  }

  async function connect() {
    if (pinInput.length !== 4 || connecting) return;
    setConnecting(true);
    setConnectError("");
    const supabase = createSupabaseBrowserClient();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), PLATFORM_CONFIG.reconnect.requestTimeoutMilliseconds));
    let data;
    try {
      const result = await Promise.race([
        supabase.from("sessions").select("*").eq("pin", pinInput).single(),
        timeoutPromise,
      ]) as { data: Record<string, unknown> | null };
      data = result.data;
    } catch {
      setConnecting(false);
      setConnectError("Connection timed out - check wifi and try again");
      return;
    }
    if (!data) {
      setConnecting(false);
      setConnectError("Session not found - check the PIN");
      return;
    }
    setConnecting(false);
    setSessionPin(pinInput);
    setConnected(true);
    applySession(data);
    hydrateCardPlays(pinInput);
    const { data: teamData } = await supabase.from("teams").select("*").eq("session_pin", pinInput).order("created_at", { ascending: true });
    if (teamData) setTeams(teamData);
    const channel = supabase.channel("display-" + pinInput)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: "pin=eq." + pinInput }, (payload) => {
        applySession(payload.new as Record<string, unknown>);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "teams", filter: "session_pin=eq." + pinInput }, (payload) => {
        setTeams(prev => [...prev, payload.new as { team_name: string }]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "uno_cards", filter: "session_pin=eq." + pinInput }, (payload) => {
        const c = payload.new as { id?: string|number; team_name: string; card_type: string; played_at?: string; round_number?: number|null };
        const dedupKey = c.id != null ? String(c.id) : c.team_name + "|" + c.card_type + "|" + c.played_at;
        triggerCardFlash(c.team_name, c.card_type, c.round_number ?? null, dedupKey);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "answers", filter: "session_pin=eq." + pinInput }, (payload) => {
        const a = payload.new as { team_name?: string; question_index?: number };
        if (a && a.team_name && typeof a.question_index === "number" && a.question_index === qIndexRef.current) {
          setLockedTeams(prev => prev.includes(a.team_name!) ? prev : [...prev, a.team_name!]);
        }
      });
    if (displayChannelRef.current) void supabase.removeChannel(displayChannelRef.current);
    displayChannelRef.current = channel;
    channel.subscribe();
  }

  useEffect(() => {
    if (!connected || !sessionPin) return;
    const supabase = createSupabaseBrowserClient();
    const poll = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("*").eq("pin", sessionPin).single();
      if (data) applySession(data);
    }, PLATFORM_CONFIG.polling.displaySessionMilliseconds);
    return () => clearInterval(poll);
  }, [connected, sessionPin]);

  // Rebuild the live Locked In state from authoritative answers. Realtime gives
  // immediate feedback, while this short poll repairs dropped websocket events
  // and makes refresh/reconnect land on the correct count.
  useEffect(() => {
    if (!connected || !sessionPin || (phase !== "question" && phase !== "pursuit")) return;
    let active = true;
    const supabase = createSupabaseBrowserClient();
    const load = async () => {
      const { data } = await supabase.from("answers")
        .select("team_name")
        .eq("session_pin", sessionPin)
        .eq("question_index", questionIndex);
      if (!active || !data) return;
      setLockedTeams([...new Set(data.map(row => row.team_name).filter(Boolean))]);
    };
    load();
    const id = window.setInterval(load, PLATFORM_CONFIG.polling.displayScoreboardMilliseconds);
    return () => { active = false; window.clearInterval(id); };
  }, [connected, sessionPin, phase, questionIndex]);

  useEffect(() => {
    const pinFromUrl = searchParams.get("pin");
    if (pinFromUrl && pinFromUrl.length === 4 && !autoConnectedRef.current) {
      autoConnectedRef.current = true;
      setPinInput(pinFromUrl);
      setConnecting(true);
      const supabase = createSupabaseBrowserClient();
      const tryAutoConnect = (attempt: number) => {
        supabase.from("sessions").select("*").eq("pin", pinFromUrl).single().then(({ data }) => {
        if (!data) {
          if (attempt < PLATFORM_CONFIG.reconnect.displayAttempts) { setTimeout(() => tryAutoConnect(attempt + 1), PLATFORM_CONFIG.reconnect.displayRetryMilliseconds); return; }
          setConnecting(false);
          setConnectError("Could not connect - check wifi and reload");
          return;
        }
        setConnecting(false);
        setSessionPin(pinFromUrl);
        setConnected(true);
        applySession(data);
        hydrateCardPlays(pinFromUrl);
        supabase.from("teams").select("*").eq("session_pin", pinFromUrl).order("created_at", { ascending: true }).then(({ data: teamData }) => {
          if (teamData) setTeams(teamData);
        });
        const channel = supabase.channel("display-" + pinFromUrl)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: "pin=eq." + pinFromUrl }, (payload) => {
            applySession(payload.new as Record<string, unknown>);
          })
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "teams", filter: "session_pin=eq." + pinFromUrl }, (payload) => {
            setTeams(prev => [...prev, payload.new as { team_name: string }]);
          })
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "uno_cards", filter: "session_pin=eq." + pinFromUrl }, (payload) => {
            const c = payload.new as { id?: string|number; team_name: string; card_type: string; played_at?: string; round_number?: number|null };
            const dedupKey = c.id != null ? String(c.id) : c.team_name + "|" + c.card_type + "|" + c.played_at;
            triggerCardFlash(c.team_name, c.card_type, c.round_number ?? null, dedupKey);
          })
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "answers", filter: "session_pin=eq." + pinFromUrl }, (payload) => {
            const a = payload.new as { team_name?: string; question_index?: number };
            if (a && a.team_name && typeof a.question_index === "number" && a.question_index === qIndexRef.current) {
              setLockedTeams(prev => prev.includes(a.team_name!) ? prev : [...prev, a.team_name!]);
            }
          });
        if (displayChannelRef.current) void supabase.removeChannel(displayChannelRef.current);
        displayChannelRef.current = channel;
        channel.subscribe();
        });
      };
      tryAutoConnect(0);
    }
  }, [searchParams]);
  if (!connected) {
    return (
      <div className="qi-display-connect">
        <div className="qi-display-connect-card">
          <div className="qi-display-wordmark"><span>QUIZ-</span>IT</div>
          <div className="qi-display-connect-title">Connect this display</div>
          <div className="qi-display-connect-copy">Enter the four-digit session PIN</div>
          <input value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g,"").slice(0,4))}
            onKeyDown={e => e.key==="Enter" && connect()} placeholder="PIN" maxLength={4}
            className="qi-display-pin-input" aria-label="Session PIN" />
          {connecting && <div className="qi-display-connect-status" role="status">Connecting…</div>}
          {connectError && <div className="qi-display-connect-error" role="alert">{connectError}</div>}
          <button onClick={connect} disabled={pinInput.length!==4}
            className="qi-display-connect-button">
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
    const cur = hardDeckCards.length > 0 ? hardDeckCards[hardDeckCards.length - 1] : null;
    const curRed = !!cur && (cur.suit === "♥" || cur.suit === "♦");
    const LADDER = [5, 10, 20, 40];
    const nextRung = LADDER.find(v => v > hardDeckPotential) ?? 40;
    return (
      <div className="fbl fbl-stage qi-display-stage qi-display-lobby">
        <PowerCardOverlays currentAnnounce={currentAnnounce} announceVisible={announceVisible} roundCardPlays={roundCardPlays} roundNumber={roundNumber} />
        <div className="hd">
          <div className="hd-title">THE HARD DECK</div>
          {hardDeckStatus === "wheel" && teams.length > 0 && hardDeckWheelTarget !== null ? (
            <div style={{ position: "relative", zIndex: 2 }}>
              <SpinWheel segments={buildTeamSegments(teams.map(t => t.team_name))} onResult={() => {}} size={620} forceResultIndex={hardDeckWheelTarget} autoSpin={hardDeckWheelSpinning} allowManualSpin={false} />
            </div>
          ) : (
            <>
              <div className="hd-ladder">
                {LADDER.map(v => (
                  <div key={v} className={"hd-rung" + (v < hardDeckPotential ? " won" : v === hardDeckPotential ? " now" : "")}>{v}</div>
                ))}
              </div>
              {cur ? (
                <div className={"bigcard" + (curRed ? " red" : "")}>
                  <div className="cv">{rankLabel(cur.rank)}</div>
                  <div className="cs">{cur.suit}</div>
                  <div className="cvb">{rankLabel(cur.rank)}{cur.suit}</div>
                </div>
              ) : (
                <div className="bigcard back"><div className="q">?</div></div>
              )}
              <div className="hd-mid">
                <div className="hd-pot"><small>THE POT</small><div className="tnum">{hardDeckPotential}</div></div>
                {hardDeckStatus === "decision" && (
                  <div className="hd-choices">
                    <div className="hd-choice hd-stick"><span>STICK</span><small>BANK {hardDeckPotential}</small></div>
                    <div className="hd-choice hd-gamble"><div className="charge" /><span>GAMBLE</span><small>NEXT CARD · {nextRung}</small></div>
                  </div>
                )}
                {hardDeckStatus === "awaiting_guess" && (
                  <div className="hd-choices">
                    <div className="hd-choice hd-stick"><span className="arrow">▲</span><span>HIGHER</span></div>
                    <div className="hd-choice hd-gamble"><span className="arrow">▼</span><span>LOWER</span></div>
                  </div>
                )}
                {hardDeckStatus === "won" && <div style={{ font: "800 clamp(16px,2.4vw,30px) Inter", color: "var(--green)", letterSpacing: "0.06em" }}>WON {hardDeckPotential} POINTS</div>}
                {hardDeckStatus === "lost" && <div style={{ font: "800 clamp(16px,2.4vw,30px) Inter", color: "var(--red)", letterSpacing: "0.14em" }}>BUST</div>}
              </div>
              <div className="bigcard back"><div className="q">?</div></div>
              {hardDeckTeam && (
                <div className="hd-crowd">
                  <b>{hardDeckTeam.toUpperCase()}</b>{
                    hardDeckStatus === "decision" ? " — STICK OR GAMBLE?"
                    : hardDeckStatus === "awaiting_guess" ? " — HIGHER OR LOWER?"
                    : hardDeckStatus === "won" ? " BANKED IT"
                    : hardDeckStatus === "lost" ? " WENT BUST"
                    : ""}
                </div>
              )}
            </>
          )}
        </div>
        <div className="badge">QUIZ-IT · Powered by Mac Entertainment · by Sonya Mac</div>
      </div>
    );
  }

  // THE PURSUIT — the race board is the hero (prototype v1.0). All race/scoring
  // logic stays in the state machine; the board is pure presentation.
  if (phase === "pursuit") {
    return (
      <PursuitBoard
        status={pursuitStatus}
        race={pursuitRace}
        teamNames={teams.map(t => t.team_name)}
        qIndex={pursuitQIndex}
        timeLeft={timeLeft}
        questionText={question?.question_text ?? null}
        questionCategory={question?.question_type ?? null}
        correctAnswer={question ? pursuitCorrectAnswerText(question) : null}
      />
    );
  }

  if (phase === "waiting" || phase === "round_start" || phase === "round_end") {
    if (phase !== "waiting") {
      // Fable Display "show structure" states, wired to the real phase +
      // roundNumber/roundName the state machine already provides.
      return (
        <>
          <PowerCardOverlays currentAnnounce={currentAnnounce} announceVisible={announceVisible} roundCardPlays={roundCardPlays} roundNumber={roundNumber} />
          {phase === "round_start" ? (
            <RoundStart roundNumber={roundNumber} roundName={roundName || "GENERAL KNOWLEDGE"} />
          ) : (
            <RoundEnd roundNumber={roundNumber} captions={fastestTeam ? [`FASTEST: ${fastestTeam}`] : []} />
          )}
        </>
      );
    }
    return (
      <div className="fbl fbl-stage">
        <PowerCardOverlays currentAnnounce={currentAnnounce} announceVisible={announceVisible} roundCardPlays={roundCardPlays} roundNumber={roundNumber} />
        <div className="lb lb-split">
          <div className="lb-join">
            <div className="lb-kicker">JOIN TONIGHT&rsquo;S SHOW</div>
            <div className="lb-pin"><small>ENTER PIN</small>{sessionPin}</div>
            <div className="lb-how">
              <div className="lb-qr" />
              <div className="lb-steps">
                <b>1.</b> Go to quiz-it.app or scan<br />
                <b>2.</b> Enter the PIN<br />
                <b>3.</b> Name your team
              </div>
            </div>
            <div className="lb-count"><b>{teams.length} TEAM{teams.length === 1 ? "" : "S"}</b> IN THE ROOM</div>
            <div className="lb-crests">
              {teams.map((t) => (
                <div key={t.team_name} className={"lb-team" + (flaringTeams.has(t.team_name) ? " new" : "")}>
                  <div className="crest">{teamInitials(t.team_name)}</div>
                  <span>{t.team_name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="lb-cardstage">
            {!allowPowerCards ? (
              <>
                <div className="lb-cardkicker">ROUND RULE</div>
                <div className="lb-pcard">
                  <div className="lb-pcard-sigil" aria-hidden="true">◇</div>
                  <div className="lb-pcard-name">POWER CARDS PAUSED</div>
                  <div className="lb-pcard-rule">Unused cards stay available for a later round.</div>
                </div>
              </>
            ) : <>
            <div className="lb-cardkicker">POWER CARDS</div>
            {(() => {
              const c = POWER_CARD_INFO[powerCardIdx];
              return (
                <div key={powerCardIdx} className="lb-pcard" style={{ borderColor: c.color, boxShadow: `0 0 60px ${c.glow}` }}>
                  <div className="lb-pcard-sigil" style={{ color: c.color, textShadow: `0 0 34px ${c.glow}` }}>{c.sigil}</div>
                  <div className="lb-pcard-name" style={{ color: c.color }}>{c.name}</div>
                  <div className="lb-pcard-rule">{c.rule}</div>
                  <div className="lb-pcard-meta">Once per quiz</div>
                </div>
              );
            })()}
            <div className="lb-dots">
              {POWER_CARD_INFO.map((_, i) => <span key={i} className={"lb-dot" + (i === powerCardIdx ? " on" : "")} />)}
            </div>
            </>}
          </div>
          <div className="lb-foot">
            <div className="lb-start">SHOW STARTS SOON</div>
            <div className="lb-tease">TONIGHT: SPIN TO WIN · THE HARD DECK · THE PURSUIT</div>
          </div>
        </div>
        <div className="badge">QUIZ-IT · Powered by Mac Entertainment · by Sonya Mac</div>
      </div>
    );
  }

  // INTERMISSION
  if (phase === "intermission") {
    const hasContent = intermissionOffers || intermissionWhatsapp || intermissionOtherQuizzes;
    // No venue content → the approved Fable holding shot. With content →
    // preserve the working offers/WhatsApp/other-quizzes advertising layout.
    if (!hasContent) {
      return (
        <>
          <PowerCardOverlays currentAnnounce={currentAnnounce} announceVisible={announceVisible} roundCardPlays={roundCardPlays} roundNumber={roundNumber} />
          <Intermission nextLabel={`ROUND ${roundNumber + 1} COMING UP`} />
        </>
      );
    }
    return (
      <div className="qi-display-intermission">
      <PowerCardOverlays currentAnnounce={currentAnnounce} announceVisible={announceVisible} roundCardPlays={roundCardPlays} roundNumber={roundNumber} />
        <div className="qi-display-eyebrow">TAKE A BREATHER</div>
        <div className="qi-display-intermission-title">INTERMISSION</div>
        <div className="qi-display-intermission-subtitle">Next round starting soon…</div>
        {(
          <div className="qi-display-promo-grid">
            <div className="qi-display-promo-stack">
              {intermissionOffers && (
                <div className="qi-display-promo-card">
                  <div className="qi-display-promo-label">TONIGHT&apos;S OFFERS</div>
                  <div className="qi-display-promo-copy">{intermissionOffers}</div>
                </div>
              )}
              {intermissionOtherQuizzes && (
                <div className="qi-display-promo-card">
                  <div className="qi-display-promo-label">MORE QUIZ NIGHTS</div>
                  <div className="qi-display-promo-copy">{intermissionOtherQuizzes}</div>
                </div>
              )}
            </div>
            {intermissionWhatsapp && (
              <div className="qi-display-promo-card qi-display-promo-qr">
                <div className="qi-display-promo-label">JOIN OUR WHATSAPP</div>
                <img src={"https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(intermissionWhatsapp)} alt="WhatsApp QR code" />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  // SPIN TO WIN — approved Fable "summons frame": Bruno title + purple flood,
  // the earning honoured. The machine itself (SlotReels) is unchanged — same
  // props, nonce, scoring, audio and sync. Presentation-only wrapper.
  if (phase === "spin_to_win") {
    return (
      <div className="fbl fbl-stage qi-display-stage qi-display-spin">
        <PowerCardOverlays currentAnnounce={currentAnnounce} announceVisible={announceVisible} roundCardPlays={roundCardPlays} roundNumber={roundNumber} />
        <div className="qi-display-spin-heading">
          <div className="qi-display-spin-title">
            <span style={{ color:"#BE26C1" }}>SPIN</span> TO WIN
          </div>
          {fastestTeam && (
            <div className="qi-display-spin-winner">
              FASTEST CORRECT ANSWER: {fastestTeam.toUpperCase()}
            </div>
          )}
        </div>
        <div className="qi-display-spin-machine">
          <SlotReels targetIdx={spinTargetIdx} spinNonce={spinNonce} teamName={fastestTeam || "Team"} victorySong={fastestSong || undefined} size="full" audioEnabled={true} />
        </div>
        <div className="badge">QUIZ-IT · Powered by Mac Entertainment · by Sonya Mac</div>
      </div>
    );
  }
  // SCOREBOARD
  if (phase === "scoreboard") {
    if (hideLeaderboard) {
      return <WaitingForHost message="STANDINGS HIDDEN FOR THIS ROUND" />;
    }
    const sorted = [...scoreboardData].sort((a,b) => b.total_points - a.total_points);
    const leader = sorted[0]?.total_points || 1;
    const topGap = sorted.length >= 3 ? sorted[0].total_points - sorted[2].total_points : sorted.length === 2 ? sorted[0].total_points - sorted[1].total_points : 0;
    return (
      <div className="fbl fbl-stage qi-display-stage qi-display-scoreboard">
        <PowerCardOverlays currentAnnounce={currentAnnounce} announceVisible={announceVisible} roundCardPlays={roundCardPlays} roundNumber={roundNumber} />
        <div className="ld">
          <div className="qi-display-eyebrow">AFTER ROUND {roundNumber}</div>
          <div className="ld-title">LIVE STANDINGS</div>
          {sorted.map((s, i) => {
            const move = rankMoves.get(s.team_name);
            return (
              <div key={s.team_name} className={"ld-row" + (i < 3 ? " top" : "") + (i === 0 ? " p1" : i === 1 ? " p2" : i === 2 ? " p3" : "")}>
                <div className="rank">{i + 1}</div>
                <div className="crest">{teamInitials(s.team_name)}</div>
                <div className="name">{s.team_name}</div>
                {move ? <div className="move">&#9650;{move}</div> : null}
                <div className="gapbar"><i style={{ width: Math.max(4, Math.round((s.total_points / leader) * 100)) + "%" }} /></div>
                <div className="pts tnum">{s.total_points.toLocaleString()}</div>
              </div>
            );
          })}
          {sorted.length >= 2 && (
            <div className="ld-foot">TOP {Math.min(3, sorted.length)} SEPARATED BY {topGap.toLocaleString()} POINTS</div>
          )}
        </div>
        <div className="badge">QUIZ-IT · Powered by Mac Entertainment · by Sonya Mac</div>
      </div>
    );
  }

  // QUIZ END — LEADERBOARD REVEAL
  if (phase === "quiz_end") {
    const sorted = [...quizEndScores].sort((a,b) => a.total_points - b.total_points);
    const revealed = sorted.slice(0, revealedCount);
    const top3 = [...quizEndScores].sort((a,b) => b.total_points - a.total_points).slice(0,3);

    if (trophyVisible) {
      const winner = top3[0];
      const confetti = [
        { left: "8%", bg: "var(--gold)", dur: "5s", delay: "0s" },
        { left: "18%", bg: "#fff", dur: "6.4s", delay: ".8s" },
        { left: "29%", bg: "var(--gold)", dur: "5.6s", delay: "1.6s" },
        { left: "41%", bg: "#fff", dur: "7s", delay: ".4s" },
        { left: "55%", bg: "var(--gold)", dur: "5.2s", delay: "1.1s" },
        { left: "67%", bg: "var(--gold)", dur: "6.8s", delay: ".2s" },
        { left: "78%", bg: "#fff", dur: "5.8s", delay: "1.9s" },
        { left: "90%", bg: "var(--gold)", dur: "6.2s", delay: ".6s" },
      ];
      return (
        <div className="fbl fbl-stage qi-display-stage qi-display-winner">
          <PowerCardOverlays currentAnnounce={currentAnnounce} announceVisible={announceVisible} roundCardPlays={roundCardPlays} roundNumber={roundNumber} />
          <div className="wc">
            <div className="wc-bg" />
            <div className="wc-rays" />
            {confetti.map((c, i) => (
              <div key={i} className="confetti" style={{ left: c.left, background: c.bg, animationDuration: c.dur, animationDelay: c.delay }} />
            ))}
            <div className="wc-kicker">TONIGHT&rsquo;S WINNERS</div>
            <div className="wc-crest crest">{winner ? teamInitials(winner.team_name) : "?"}<div className="wc-crown">👑</div></div>
            <div className="wc-name">{(winner?.team_name || "").toUpperCase()}</div>
            <div className="wc-champ">CHAMPIONS</div>
            <div className="wc-meta tnum">{(winner?.total_points ?? 0).toLocaleString()} POINTS</div>
            <div className="wc-photo">📸 GET UP HERE — YOUR PHOTO&rsquo;S WAITING</div>
          </div>
          <div className="badge">QUIZ-IT · Powered by Mac Entertainment · by Sonya Mac</div>
        </div>
      );
    }

    // Reveal in progress
    return (
      <div className="qi-display-final-reveal">
        <div className="qi-display-eyebrow">TONIGHT&apos;S RESULTS</div>
        <div className="qi-display-final-title">FINAL LEADERBOARD</div>
        <div className="qi-display-final-list">
          {[...revealed].reverse().map((s, i) => {
            const pos = sorted.length - revealed.length + 1 + i;
            const isTop = pos <= 3;
            const medal = pos===1?"gold":pos===2?"silver":pos===3?"#cd7f32":null;
            return (
              <div key={s.team_name} className={"qi-display-final-row" + (isTop ? " is-podium" : "")} style={{ "--qi-medal": medal || undefined } as CSSProperties}>
                <span className="qi-display-final-rank">{pos}</span>
                <span className="qi-display-final-team">{s.team_name}</span>
                <span className="qi-display-final-score">{s.total_points.toLocaleString()}</span>
              </div>
            );
          })}
          {revealedCount === 0 && (
            <div className="qi-display-final-wait">Results incoming…</div>
          )}
        </div>
        <div className="qi-display-powered">QUIZ-IT · Powered by Mac Entertainment</div>
      </div>
    );
  }

  // CELEBRATION
  if (phase === "celebration") {
    const winnerTeam = teams.find(t => t.team_name === fastestTeam);
    const confettiColors = ["#BE26C1","#F5B800","#22C55E","#38BDF8","#F87171","#A78BFA","#FB923C"];
    return (
      <div className="qi-display-celebration">
      <PowerCardOverlays currentAnnounce={currentAnnounce} announceVisible={announceVisible} roundCardPlays={roundCardPlays} roundNumber={roundNumber} />
        {/* Confetti layer */}
        {fastestTeam && (
          <div style={{ position:"absolute", inset:0, pointerEvents:"none", overflow:"hidden" }}>
            {Array.from({length:28}).map((_,i) => (
              <div key={i} style={{
                position:"absolute", top:"-16px",
                left:(3 + (i * 19) % 94) + "%",
                width: 6 + (i % 5) * 3, height: 6 + (i % 4) * 3,
                borderRadius: i % 3 === 0 ? "50%" : "2px",
                background: confettiColors[i % confettiColors.length],
                animation:`confettiFall ${1.4 + (i % 8) * 0.25}s ${(i % 7) * 0.18}s ease-in infinite`,
              }} />
            ))}
          </div>
        )}
        {/* Brand ambient glow */}
        <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse 60% 50% at 50% 50%, rgba(190,38,193,0.12) 0%, transparent 70%)", pointerEvents:"none" }} />
        {fastestTeam ? (
          <div className="qi-display-celebration-content">
            <div className="qi-display-eyebrow">FASTEST CORRECT ANSWER</div>
            <div className="qi-display-fastest-team">
              {fastestTeam}
            </div>
            {/* Never shown until a host has approved this team's photo - see
                the 202607230002_photo_approval migration. */}
            {showWinnerPhoto && winnerTeam?.photo_url && winnerTeam?.photo_approved && (
              <div className="qi-display-fastest-photo">
                <img src={winnerTeam.photo_url} alt={fastestTeam} />
              </div>
            )}
          </div>
        ) : (
          <div className="qi-display-no-winner">{question?.question_type === "multi_tap" ? "Nobody got all answers correct." : "No correct answers this round"}</div>
        )}
        {/* Brand */}
        <div style={{ position:"absolute", bottom:22, textAlign:"center", zIndex:2 }}>
          <div style={{ fontFamily:"'Bruno Ace SC',sans-serif", fontSize:16, letterSpacing:3 }}>
            <span style={{ color:purple }}>QUIZ-</span><span style={{ color:"#fff" }}>IT</span>
          </div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.2)", marginTop:3 }}>Powered by Mac Entertainment · by Sonya Mac</div>
        </div>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:`linear-gradient(90deg,transparent,${purple},transparent)` }} />
        <div style={{ position:"absolute", bottom:0, left:0, right:0, height:1, background:`linear-gradient(90deg,transparent,${purple},transparent)` }} />
      </div>
    );
  }

  // ANSWER REVEAL
  if (phase === "answer" && question) {
    const options = [{ key:"A", text:question.option_a },{ key:"B", text:question.option_b },{ key:"C", text:question.option_c },{ key:"D", text:question.option_d }].filter(o => o.text);
    const isMulti = question.question_type === "multiple_choice";
    const correctText = isMulti ? (options.find(o => o.key.toLowerCase()===question.correct_answer.toLowerCase())?.text || question.correct_answer) : question.correct_answer;
    const correctKey = question.correct_answer.toLowerCase();
    return (
      <div className="qi-display-answer-reveal">
      <PowerCardOverlays currentAnnounce={currentAnnounce} announceVisible={announceVisible} roundCardPlays={roundCardPlays} roundNumber={roundNumber} />
        {/* HEADER */}
        <div className="qi-display-answer-header">
          <div className="qi-display-answer-meta">
            <span>{roundName || "GENERAL KNOWLEDGE"}</span>
            <strong>ANSWER REVEALED</strong>
          </div>
          <span className="qi-display-question-number">QUESTION {questionIndex + 1}</span>
        </div>
        {/* CONTENT */}
        <div className="qi-display-answer-content">
          <div className="qi-display-answer-question">
            {question.question_text.replace(/^Play this track:\s*/i, "").replace(/^Show teams this image:\s*/i, "")}
          </div>
          {isMulti ? (
            <div className="qi-display-answer-options">
              {options.map((opt, idx) => {
                const isCorrect = opt.key.toLowerCase() === correctKey;
                return (
                  <div key={opt.key} className={"qi-display-answer-option" + (isCorrect ? " is-correct" : " is-dimmed")} style={{ "--qi-option-delay": `${0.08 + idx * 0.05}s` } as CSSProperties}>
                    <span className="qi-display-answer-key">{opt.key}</span>
                    <span className="qi-display-answer-text">{opt.text}</span>
                    {isCorrect && <span className="qi-display-answer-check" aria-label="Correct">✓</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="qi-display-answer-hero-wrap">
              <div className="qi-display-answer-hero">
                <div className="qi-display-answer-hero-label">CORRECT ANSWER</div>
                <div className="qi-display-answer-hero-text">{correctText}</div>
              </div>
            </div>
          )}
        </div>
        {/* FOOTER */}
        <div className="qi-display-answer-footer">
          <div className="qi-display-answer-explanation">
            {question.explanation || ""}
          </div>
          <div style={{ textAlign:"right", lineHeight:1.3 }}>
            <div><span style={{ fontFamily:"'Bruno Ace SC',sans-serif", fontSize:11, letterSpacing:"1.5px" }}><span style={{ color:purple }}>QUIZ-</span><span style={{ color:"#fff" }}>IT</span></span></div>
            <div style={{ fontSize:8, color:"rgba(255,255,255,0.14)" }}>Powered by Mac Entertainment · by Sonya Mac</div>
          </div>
        </div>
        <div style={{ position:"absolute", bottom:0, left:0, right:0, height:1, background:`linear-gradient(90deg,transparent,rgba(34,197,94,0.6),transparent)` }} />
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
    const imageUrl = isPicture ? getMediaUrl(question.option_b) : null;

    // PICTURE ROUND - image only (first space)
    if (isPicture && pictureSubPhase === "image_only" && imageUrl) {
      return (
        <div className="qi-display-picture-hero">
      <PowerCardOverlays currentAnnounce={currentAnnounce} announceVisible={announceVisible} roundCardPlays={roundCardPlays} roundNumber={roundNumber} />
          <div className="qi-display-picture-meta">QUESTION {questionIndex+1} · PICTURE ROUND</div>
          <img className="qi-display-picture-image" src={imageUrl} alt="Quiz image" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; setImageLoadFailed(true); }} style={{ display: imageLoadFailed ? "none" : "block" }} />
          {imageLoadFailed && (
            <div className="qi-display-media-error" role="status">
              <div style={{ fontSize:48, marginBottom:16 }}>🖼️</div>
              <div style={{ fontSize:22, color:"rgba(255,255,255,0.5)" }}>Image could not be loaded</div>
            </div>
          )}
          <div className="qi-display-picture-prompt">TAKE A GOOD LOOK</div>
        </div>
      );
    }

    // PICTURE ROUND - image + question (second space)
    if (isPicture && pictureSubPhase === "question_visible") {
      return (
        <div className="qi-display-picture-question">
      <PowerCardOverlays currentAnnounce={currentAnnounce} announceVisible={announceVisible} roundCardPlays={roundCardPlays} roundNumber={roundNumber} />
          <div className="qi-display-picture-header">
            <div className="qi-display-question-number">QUESTION {questionIndex+1}</div>
            <div className="qi-display-picture-chip">PICTURE ROUND</div>
            <div style={{ flex:1 }} />
            {timeLeft !== null && timeLeft > 0 && (
              <div className={"qi-display-picture-timer" + (timeLeft<=3 ? " is-urgent" : "")}>{timeLeft}</div>
            )}
            <div style={{ fontSize:18, color:"rgba(255,255,255,0.3)", letterSpacing:2 }}>Quiz-It</div>
          </div>
          <div className="qi-display-picture-layout">
            {imageUrl && (
              <div className="qi-display-picture-media">
                {!imageLoadFailed ? (
                  <img src={imageUrl} alt="Quiz image" onError={() => setImageLoadFailed(true)} />
                ) : (
                  <div className="qi-display-media-error">
                    <div style={{ fontSize:40, marginBottom:12 }}>🖼️</div>
                    <div style={{ fontSize:18, color:"rgba(255,255,255,0.5)" }}>Image could not be loaded</div>
                  </div>
                )}
              </div>
            )}
            <div className="qi-display-picture-copy">
              <div className="qi-display-picture-question-text">{question.question_text.replace(/^Show teams this image:\s*/i, "")}</div>
              <div className="qi-display-answer-on-phone">
                Type your answer on your phone
              </div>
            </div>
          </div>
        </div>
      );
    }

    // STANDARD QUESTION — Fable "live answer meter" layout.
    const tLeft = timeLeft ?? 0;
    const allOpts = isMulti ? options : isMultiTap ? multiTapOptions : [];
    // Real, live locked-in count: distinct still-connected teams that have
    // actually submitted an answer for this question. Intersecting with the
    // current `teams` list means a team leaving mid-question doesn't corrupt the
    // count, and it never exceeds the number of teams in the room.
    const totalTeams = teams.length;
    const lockedCount = lockedTeams.filter(t => teams.some(tm => tm.team_name === t)).length;
    return (
      <div className="fbl fbl-stage qi-display-stage qi-display-question">
        <PowerCardOverlays currentAnnounce={currentAnnounce} announceVisible={announceVisible} roundCardPlays={roundCardPlays} roundNumber={roundNumber} />
        <div className="qd-ring" />
        {/* Final-5s urgent glow: intensity ramps steadily as time approaches 0.
            No rapid flashing (single steady glow), reduced-motion disables the transition. */}
        <div className="qd-urgent" style={{ boxShadow: tLeft > 0 && tLeft <= 5
          ? `inset 0 0 ${110 + (6 - tLeft) * 34}px ${18 + (6 - tLeft) * 14}px rgba(255,59,78,${(0.12 + (6 - tLeft) * 0.11).toFixed(3)})`
          : "none" }} />
        {tLeft > 0 && <div className={"qd-bigtimer" + (tLeft <= 5 ? " urgent" : "")}>{tLeft}</div>}
        <div className="qd">
          <div className="qd-top">
            <span><span className="qd-kick">QUESTION {questionIndex + 1}</span> · {(roundName || "GENERAL KNOWLEDGE").toUpperCase()}</span>
            <span>{tLeft > 0 ? "SPEED BONUS" : "ANSWERS LOCKED"}</span>
          </div>
          <div className="qd-q">{question.question_text.replace(/^Play this track:\s*/i, "").replace(/^Show teams this image:\s*/i, "")}</div>
          {allOpts.length > 0 && (
            <div className="qd-opts">
              {allOpts.map((opt) => (
                <div key={opt.key} className="qd-opt"><div className="chip">{opt.key}</div>{opt.text}</div>
              ))}
            </div>
          )}
          {question.question_type === "audio" && (
            <div style={{ margin: "2% 6%" }}><LiveAudioPlayer question={question} /></div>
          )}
          {!isMulti && !isMultiTap && question.question_type !== "audio" && (
            <div style={{ textAlign: "center", margin: "2% 6%", color: "var(--text2)", fontSize: "clamp(12px,1.6vw,20px)", fontWeight: 600, letterSpacing: "0.1em" }}>ANSWER ON YOUR PHONE</div>
          )}
          <div className="qd-meter">
            <div className="qd-mlabel"><span>ANSWERS LOCKED</span><b className="tnum">{lockedCount} OF {totalTeams}</b></div>
            <div className="qd-ticks">
              {Array.from({ length: Math.max(totalTeams, 1) }).map((_, i) => (
                <div key={i} className={"qd-tick" + (i < lockedCount ? " in" : "") + (i === lockedCount - 1 ? " last" : "")} />
              ))}
            </div>
          </div>
        </div>
        <div className="badge">QUIZ-IT · Powered by Mac Entertainment · by Sonya Mac</div>
      </div>
    );
  }

  return null;
}

export default function DisplayScreen() {
  return (
    <Suspense fallback={<div style={{ minHeight:"100vh", background:"#0d0225" }} />}>
      <div className="qi-display-shell">
        <DisplayScreenInner />
        <DisplayFullscreenControl />
      {/* Persistent branding overlay - sits on top of every phase screen
          regardless of which internal return branch rendered, instead of
          needing to be threaded through each one individually. */}
        <div className="qi-display-brand-signature" style={{
        position: "fixed", bottom: 14, right: 18, zIndex: 9999,
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 12px", borderRadius: 999,
        background: "rgba(13,2,37,0.6)", border: "1px solid rgba(190,38,193,0.3)",
        pointerEvents: "none" as const,
      }}>
        <img src="/me-logo.jpg" alt="ME" style={{ width: 20, height: 20, borderRadius: "50%" }} />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", letterSpacing: 0.5 }}>
          <span style={{ fontFamily: "'Bruno Ace SC',sans-serif" }}>Quiz-It</span><span style={{ fontFamily: "'Inter',sans-serif" }}> · Powered by Mac Entertainment · by Sonya Mac</span>
        </span>
        </div>
      </div>
    </Suspense>
  );
}
