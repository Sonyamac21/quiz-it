"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMediaUrl } from "@/lib/getMediaUrl";
import { SpinWheel, buildTeamSegments } from "@/components/SpinWheel";
import { SlotReels } from "@/components/SlotReels";

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
type Phase = "waiting" | "round_start" | "question" | "answer" | "celebration" | "round_end" | "scoreboard" | "quiz_end" | "hard_deck" | "intermission" | "spin_to_win";

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

// Cache of preloaded Audio elements, keyed by filename - playing a cloned node
// from an already-loaded source starts instantly instead of re-fetching/decoding
// the file from scratch on every single play. This was the cause of audio lag
// during The Hard Deck, where the same few sounds (crowd-cheer, airhorn) fire
// repeatedly in quick succession.
const audioPreloadCache = new Map<string, HTMLAudioElement>();
const PRELOAD_SOUNDS = ["crowd-cheer.mp3", "airhorn.mp3", "sad-trombone.mp3", "round-start.mp3", "clapping-scores.mp3"];
function preloadSounds() {
  for (const file of PRELOAD_SOUNDS) {
    if (audioPreloadCache.has(file)) continue;
    const a = new Audio("/sounds/" + file);
    a.preload = "auto";
    a.load();
    audioPreloadCache.set(file, a);
  }
}

function playSound(file: string, volume = 1.0) {
  try {
    const cached = audioPreloadCache.get(file);
    if (cached) {
      // Clone so overlapping/rapid repeat plays of the same sound don't cut each
      // other off, while still benefiting from the already-buffered source.
      const a = cached.cloneNode() as HTMLAudioElement;
      a.volume = volume;
      a.play().catch(() => {});
      return a;
    }
    const a = new Audio("/sounds/" + file); a.volume = volume; a.play().catch(() => {}); return a;
  } catch { return null; }
}

// Power card explainer screens shown one at a time on the lobby/waiting screen,
// so players learn what each card does before they need to use one mid-game.
// Colors match the host dashboard's cardColor map exactly for consistency.
const POWER_CARDS = [
  { type: "block", emoji: "\u23F8\uFE0F", title: "Time-Out", color: "#3b82f6", desc: "Freezes every OTHER team from answering for a short window, so you get a free run at the question with no competition." },
  { type: "x2", emoji: "\u26A1", title: "Boost", color: "#eab308", desc: "Doubles your team's points for the question you play it on. Save it for a question you're confident about!" },
  { type: "reverse", emoji: "\u21BB", title: "Reverse", color: "#ef4444", desc: "A surprise twist card - ask your host what it does in this game if you're not sure!" },
];

function DisplayScreenInner() {
  const searchParams = useSearchParams();
  const autoConnectedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [introCardIdx, setIntroCardIdx] = useState(0);
  useEffect(() => { preloadSounds(); }, []);

  // Inject Inter font + all display screen animations on mount
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.id = "quizit-display-anims";
    style.textContent = [
      "@keyframes qSlideUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}",
      "@keyframes optSlide{from{opacity:0;transform:translateX(-18px)}to{opacity:1;transform:translateX(0)}}",
      "@keyframes flashReveal{0%{background:#0D0110}8%{background:#fff}18%{background:#0D0110}100%{background:#0D0110}}",
      "@keyframes correctPop{0%{transform:scale(1)}40%{transform:scale(1.04)}100%{transform:scale(1)}}",
      "@keyframes wrongFade{to{opacity:0.18}}",
      "@keyframes nameSlam{0%{opacity:0;transform:scale(0.35) translateY(24px)}60%{transform:scale(1.06) translateY(-4px)}100%{opacity:1;transform:scale(1) translateY(0)}}",
      "@keyframes goldRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}",
      "@keyframes confettiFall{0%{transform:translateY(-16px) rotate(0deg);opacity:1}100%{transform:translateY(105vh) rotate(540deg);opacity:0}}",
      "@keyframes timerUrgent{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}",
      "@keyframes screenPulse{0%,100%{background:transparent}50%{background:rgba(239,68,68,0.05)}}",
    ].join("");
    document.head.appendChild(style);
    return () => {
      if (link.parentNode) link.parentNode.removeChild(link);
      const s = document.getElementById("quizit-display-anims");
      if (s && s.parentNode) s.parentNode.removeChild(s);
    };
  }, []);
  useEffect(() => {
    const interval = setInterval(() => {
      setIntroCardIdx(i => (i + 1) % POWER_CARDS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const btn = document.createElement("button");
    btn.textContent = "Fullscreen";
    btn.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:9999;padding:10px 18px;border-radius:8px;background:rgba(190,38,193,0.85);color:#fff;border:none;font-family:sans-serif;font-size:13px;letter-spacing:1px;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,0.4);";
    btn.onclick = () => {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    };
    document.body.appendChild(btn);
    const onFsChange = () => {
      btn.style.display = document.fullscreenElement ? "none" : "block";
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      if (btn.parentNode) btn.parentNode.removeChild(btn);
    };
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
  const [teams, setTeams] = useState<{ team_name: string; victory_song?: string; photo_url?: string }[]>([]);
  const [showWinnerPhoto, setShowWinnerPhoto] = useState(false);
  const winnerPhotoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winnerPhotoStartedForRef = useRef<string | null>(null);
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
  const [spinTargetIdx, setSpinTargetIdx] = useState<number|null>(null);
  const [spinNonce, setSpinNonce] = useState<number | null>(null);
  // Track last spinNonce to detect new spins independently of phase state.
  // When spinNonce changes on the display, we force spin_to_win locally even
  // if the phase DB write was missed. This is the same dual-trigger pattern
  // as Hard Deck uses for its wheel.
    const lastSeenSpinNonceRef = useRef<number | null>(null);
  // Tracks which spin_nonce has already forced phase to spin_to_win once.
  // Prevents a stale/out-of-order delivery (poll vs realtime race) from
  // re-forcing the phase back to spin_to_win after the spin has genuinely
  // completed and been cleared - which was remounting SlotReels and
  // restarting the spin audio.
  const spinNonceHandledRef = useRef<number | null>(null);

  const [cardFlash, setCardFlash] = useState<{ team: string; type: string } | null>(null);
  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.textContent = "@keyframes reverseFlash { 0% { transform: translateX(-50%) scale(1); } 100% { transform: translateX(-50%) scale(1.05); } }";
    document.head.appendChild(styleEl);
    return () => { if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl); };
  }, []);
  const cardFlashElRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;display:none;padding:14px 32px;border-radius:12px;background:rgba(20,5,40,0.95);border:2px solid #BE26C1;color:#fff;font-family:sans-serif;font-size:18px;font-weight:700;letter-spacing:1px;box-shadow:0 4px 24px rgba(190,38,193,0.5);";
    document.body.appendChild(el);
    cardFlashElRef.current = el;
    return () => { if (el.parentNode) el.parentNode.removeChild(el); };
  }, []);
  useEffect(() => {
    const el = cardFlashElRef.current;
    if (!el) return;
    if (cardFlash) {
      const label = cardFlash.type === "block" ? "Time-Out" : cardFlash.type === "reverse" ? "Reverse" : "Boost";
      if (cardFlash.type === "reverse") {
        // Reverse flips a score - make this one unmissable, distinct from the other two cards
        el.textContent = "\u21BB  " + cardFlash.team + " PLAYED REVERSE!  \u21BB";
        el.style.cssText = "position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:9999;display:block;padding:22px 56px;border-radius:18px;background:rgba(239,68,68,0.25);border:3px solid #ef4444;color:#fff;font-family:sans-serif;font-size:32px;font-weight:900;letter-spacing:2px;box-shadow:0 0 50px rgba(239,68,68,0.7);animation:reverseFlash 0.5s ease-in-out infinite alternate;";
      } else if (cardFlash.type === "block") {
        el.textContent = "\u23F8  " + cardFlash.team + " PLAYED TIME-OUT!  \u23F8";
        el.style.cssText = "position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:9999;display:block;padding:20px 48px;border-radius:18px;background:rgba(59,130,246,0.25);border:3px solid #3b82f6;color:#fff;font-family:sans-serif;font-size:28px;font-weight:900;letter-spacing:2px;box-shadow:0 0 50px rgba(59,130,246,0.7);";
      } else {
        el.textContent = "\u26A1  " + cardFlash.team + " PLAYED BOOST!  \u26A1";
        el.style.cssText = "position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:9999;display:block;padding:20px 48px;border-radius:18px;background:rgba(234,179,8,0.25);border:3px solid #eab308;color:#fff;font-family:sans-serif;font-size:28px;font-weight:900;letter-spacing:2px;box-shadow:0 0 50px rgba(234,179,8,0.7);";
      }
    } else {
      el.style.display = "none";
    }
  }, [cardFlash]);
  const cardFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const victorySongRef = useRef<HTMLAudioElement|null>(null);
  const celebrationPlayingForRef = useRef<string | null>(null);
  const clappingRef = useRef<HTMLAudioElement|null>(null);
  const quizEndCrowdRef = useRef<HTMLAudioElement|null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const flashRef = useRef<ReturnType<typeof setInterval>|null>(null);
  // Tracks the full timer duration so the SVG ring can show correct progress
  const timerTotalRef = useRef<number>(30);

  const font = "'Bruno Ace SC', sans-serif";
  const purple = "#BE26C1";
  const bg = "#080810";


  // Track picture sub-phase: "image_only" -> "question_visible"
  const [pictureSubPhase, setPictureSubPhase] = useState<"image_only"|"question_visible">("image_only");
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [answeredTeams, setAnsweredTeams] = useState<string[]>([]);
  const [showAnsweredTeams, setShowAnsweredTeams] = useState(false);

  const prevQuizEndRevealedRef = useRef<number>(0);
  const prevPhaseForQuizEndRef = useRef<string>("");
  const trophyCelebrationFiredRef = useRef(false);
  function handleRevealNext(nextCount: number) {
    const sorted = [...quizEndScores].sort((a,b) => a.total_points - b.total_points);
    setRevealedCount(nextCount);
    const isFirst = nextCount === sorted.length && sorted.length > 0;
    playSound("crowd-cheer.mp3", 0.7);
    if (isFirst) {
      stopClapping();
      setTimeout(() => playSound("airhorn.mp3", 1.0), 800);
      const winner = sorted[sorted.length - 1];
      if (winner) {
        const winnerTeam = teams.find(t => t.team_name === winner.team_name);
        setTimeout(() => {
          // Same horn/cheer/victory-song celebration sequence used in Spin to Win (SlotReels.tsx)
          const crowd = new Audio("/sounds/crowd-cheer.mp3");
          crowd.volume = 0.9;
          crowd.play().catch(() => {});
          quizEndCrowdRef.current = crowd;

          if (victorySongRef.current) { victorySongRef.current.pause(); victorySongRef.current = null; }
          if (winnerTeam?.victory_song) {
            const song = new Audio("/sounds/" + encodeURIComponent(winnerTeam.victory_song) + ".mp3");
            song.volume = 0.85;
            song.play().catch(() => {});
            victorySongRef.current = song;
          }

          // Quiz is finished after this - fade the crowd cheer out, then stop everything
          setTimeout(() => {
            if (quizEndCrowdRef.current) {
              const crowdEl = quizEndCrowdRef.current;
              const fadeInterval = setInterval(() => {
                if (crowdEl && crowdEl.volume > 0.05) {
                  crowdEl.volume = Math.max(0, crowdEl.volume - 0.05);
                } else {
                  crowdEl.pause();
                  clearInterval(fadeInterval);
                  if (quizEndCrowdRef.current === crowdEl) quizEndCrowdRef.current = null;
                }
              }, 200);
            }
            setTimeout(() => {
              if (victorySongRef.current) { victorySongRef.current.pause(); victorySongRef.current = null; }
            }, 14000);
          }, 4000);
        }, 1200);
      }
    }
  }

  function stopClapping() {
    if (clappingRef.current) { clappingRef.current.pause(); clappingRef.current.currentTime = 0; clappingRef.current = null; }
  }

  function triggerCardFlash(team: string, type: string) {
    if (cardFlashTimerRef.current) clearTimeout(cardFlashTimerRef.current);
    setCardFlash({ team, type });
    playSound("round-start.mp3", 0.9);
    cardFlashTimerRef.current = setTimeout(() => setCardFlash(null), 5000);
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
    setRoundName((data.round_name as string) || "");
    setRoundNumber((data.round_number as number) || 1);
    const ft = (data.fastest_team as string) || null;
    const fs = (data.fastest_song as string) || null;
    setFastestTeam(ft);
    if (ft && newPhase === "celebration") {
      if (winnerPhotoStartedForRef.current !== ft) {
        winnerPhotoStartedForRef.current = ft;
        setShowWinnerPhoto(false);
        if (winnerPhotoTimerRef.current) clearTimeout(winnerPhotoTimerRef.current);
        winnerPhotoTimerRef.current = setTimeout(() => setShowWinnerPhoto(true), 2000);
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
        if (newHDStatus === "decision") {
          playSound("crowd-cheer.mp3", 0.6);
        } else if (newHDStatus === "won") {
          if (newHDPotential >= 40) {
            playSound("airhorn.mp3", 1.0);
            setTimeout(() => playSound("crowd-cheer.mp3", 0.8), 200);
          } else {
            playSound("crowd-cheer.mp3", 0.6);
          }
        } else if (newHDStatus === "lost") {
          playSound("sad-trombone.mp3", 0.9);
        }
        prevHardDeckStatusRef.current = newHDStatus;
      }
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
    if (newPhase === "question") {
      const q = data.current_question as {question_type?: string} | null;
      if (q?.question_type === "picture") {
        setPictureSubPhase("image_only");
        setImageLoadFailed(false);
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
      const syncedCount = (data.quiz_end_revealed_count as number) || 0;
      const syncedTrophy = !!data.quiz_end_trophy_visible;
      if (prevPhaseForQuizEndRef.current !== "quiz_end") {
        prevQuizEndRevealedRef.current = 0;
        setRevealedCount(0);
        setTrophyVisible(false);
        trophyCelebrationFiredRef.current = false;
        stopClapping();
        if (victorySongRef.current) { victorySongRef.current.pause(); victorySongRef.current = null; }
        if (quizEndCrowdRef.current) { quizEndCrowdRef.current.pause(); quizEndCrowdRef.current = null; }
        const clap = new Audio("/sounds/clapping-scores.mp3");
        clap.volume = 0.5;
        clap.loop = true;
        clap.play().catch(() => {});
        clappingRef.current = clap;
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
          const sorted = [...scores].sort((a,b) => a.total_points - b.total_points);
          const winner = sorted[sorted.length - 1];
          const winnerTeam = winner ? teams.find(t => t.team_name === winner.team_name) : null;
          playSound("airhorn.mp3", 1.0);
          const crowd = new Audio("/sounds/crowd-cheer.mp3");
          crowd.volume = 0.9;
          crowd.play().catch(() => {});
          quizEndCrowdRef.current = crowd;
          if (victorySongRef.current) { victorySongRef.current.pause(); victorySongRef.current = null; }
          if (winnerTeam?.victory_song) {
            const song = new Audio("/sounds/" + encodeURIComponent(winnerTeam.victory_song) + ".mp3");
            song.volume = 0.85;
            song.play().catch(() => {});
            victorySongRef.current = song;
          }
          setTimeout(() => {
            if (quizEndCrowdRef.current) {
              const crowdEl = quizEndCrowdRef.current;
              const fadeInterval = setInterval(() => {
                if (crowdEl && crowdEl.volume > 0.05) {
                  crowdEl.volume = Math.max(0, crowdEl.volume - 0.05);
                } else {
                  crowdEl.pause();
                  clearInterval(fadeInterval);
                  if (quizEndCrowdRef.current === crowdEl) quizEndCrowdRef.current = null;
                }
              }, 200);
            }
            setTimeout(() => {
              if (victorySongRef.current) { victorySongRef.current.pause(); victorySongRef.current = null; }
            }, 14000);
          }, 4000);
        }
      }
    }
    prevPhaseForQuizEndRef.current = newPhase;

    if (newPhase === "celebration" && ft && fs) {
      // Only (re)start the song if this is a genuinely new celebration (different team),
      // not just another applySession call (polling/realtime) for the same one already playing.
      if (celebrationPlayingForRef.current !== ft) {
        celebrationPlayingForRef.current = ft;
        if (victorySongRef.current) { victorySongRef.current.pause(); victorySongRef.current = null; }
        const audio = new Audio("/sounds/" + encodeURIComponent(fs) + ".mp3");
        audio.volume = 0.8;
        audio.play().catch(() => {});
        victorySongRef.current = audio;
        if (flashRef.current) clearInterval(flashRef.current);
        let f = false;
        flashRef.current = setInterval(() => { f = !f; setFlash(f); }, 500);
        setTimeout(() => { if (flashRef.current) clearInterval(flashRef.current); }, 15000);
      }
    } else if (newPhase === "celebration" && !ft) {
      // Nobody got this one right - previously this played no sound at all, which
      // read as the screen just being broken/unresponsive. A sad trombone gives
      // the room a clear, deliberate "nobody got it" beat instead of dead air.
      if (celebrationPlayingForRef.current !== "__no_winner__") {
        celebrationPlayingForRef.current = "__no_winner__";
        playSound("sad-trombone.mp3", 0.9);
      }
    } else {
      // Left celebration (e.g. moved to Spin to Win, Hard Deck, next question) -
      // make sure nothing keeps playing in the background.
      if (celebrationPlayingForRef.current !== null) {
        celebrationPlayingForRef.current = null;
        if (victorySongRef.current) { victorySongRef.current.pause(); victorySongRef.current = null; }
        if (flashRef.current) { clearInterval(flashRef.current); flashRef.current = null; }
      }
      setFlash(false);
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
    }, 1000);
  }

  async function connect() {
    if (pinInput.length !== 4 || connecting) return;
    setConnecting(true);
    setConnectError("");
    const supabase = createSupabaseBrowserClient();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000));
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
    const { data: teamData } = await supabase.from("teams").select("*").eq("session_pin", pinInput).order("created_at", { ascending: true });
    if (teamData) setTeams(teamData);
    supabase.channel("display-" + pinInput)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: "pin=eq." + pinInput }, (payload) => {
        applySession(payload.new as Record<string, unknown>);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "teams", filter: "session_pin=eq." + pinInput }, (payload) => {
        setTeams(prev => [...prev, payload.new as { team_name: string }]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "uno_cards", filter: "session_pin=eq." + pinInput }, (payload) => {
        const c = payload.new as { team_name: string; card_type: string };
        triggerCardFlash(c.team_name, c.card_type);
      })
      .subscribe();
  }

  useEffect(() => {
    if (!connected || !sessionPin) return;
    const supabase = createSupabaseBrowserClient();
    const poll = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("*").eq("pin", sessionPin).single();
      if (data) applySession(data);
    }, 1000);
    return () => clearInterval(poll);
  }, [connected, sessionPin]);

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
          if (attempt < 3) { setTimeout(() => tryAutoConnect(attempt + 1), 2000); return; }
          setConnecting(false);
          setConnectError("Could not connect - check wifi and reload");
          return;
        }
        setConnecting(false);
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
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "uno_cards", filter: "session_pin=eq." + pinFromUrl }, (payload) => {
            const c = payload.new as { team_name: string; card_type: string };
            triggerCardFlash(c.team_name, c.card_type);
          })
          .subscribe();
        });
      };
      tryAutoConnect(0);
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
          {connecting && <div style={{ color:"rgba(255,255,255,0.6)", fontSize:14, marginBottom:12 }}>Connecting...</div>}
          {connectError && <div style={{ color:"#ef4444", fontSize:13, marginBottom:12 }}>{connectError}</div>}
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
        <style>{`@keyframes flash { 0%,100%{opacity:1} 50%{opacity:0.15} }`}</style>
        <div style={{ fontSize:60, fontWeight:800, color:purple, letterSpacing:6, textShadow:"0 0 40px rgba(190,38,193,0.6)" }}>THE HARD DECK</div>
        {hardDeckStatus === "wheel" && teams.length > 0 && hardDeckWheelTarget !== null && (
          <SpinWheel
            segments={buildTeamSegments(teams.map(t => t.team_name))}
            onResult={() => {}}
            size={760}
            forceResultIndex={hardDeckWheelTarget}
            autoSpin={hardDeckWheelSpinning}
          />
        )}
        {hardDeckTeam && (
          <div style={{ fontSize:38, color:"#fff", fontWeight:700, letterSpacing:2 }}>{hardDeckTeam}</div>
        )}
        {hardDeckCards.length > 0 && (
          <div style={{ display:"flex", gap:24 }}>
            {hardDeckCards.map((c, i) => (
              <div key={i} style={{ width:280, height:400, borderRadius:28, background:"#fff", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontSize:96, fontWeight:900, color:(c.suit==="♥"||c.suit==="♦")?"#dc2626":"#111", boxShadow:"0 12px 50px rgba(0,0,0,0.5)" }}>
                <div>{rankLabel(c.rank)}</div>
                <div style={{ fontSize:120 }}>{c.suit}</div>
              </div>
            ))}
          </div>
        )}
        {hardDeckPotential > 0 && hardDeckStatus === "decision" && (
          <div style={{ fontSize:32, color:"#facc15", fontWeight:700 }}>{hardDeckPotential} POINTS</div>
        )}
        {hardDeckPotential > 0 && hardDeckStatus === "won" && hardDeckPotential >= 40 && (
          <div style={{ fontSize:72, color:"#facc15", fontWeight:900, animation:"flash 0.6s ease-in-out infinite", textShadow:"0 0 40px rgba(250,204,21,0.8)" }}>{hardDeckPotential} POINTS</div>
        )}
        {hardDeckPotential > 0 && hardDeckStatus === "won" && hardDeckPotential < 40 && (
          <div style={{ fontSize:32, color:"#facc15", fontWeight:700 }}>{hardDeckPotential} POINTS</div>
        )}
        {hardDeckStatus === "decision" && (
          <div style={{ fontSize:22, color:"rgba(255,255,255,0.6)" }}>Stick or Gamble?</div>
        )}
        {hardDeckStatus === "awaiting_guess" && hardDeckCards.length > 0 && (
          <div style={{ fontSize:48, color:"#fff", fontWeight:800 }}>Higher or Lower?</div>
        )}
        {hardDeckStatus === "won" && hardDeckPotential >= 40 && (
          <div style={{ fontSize:80, color:"#22c55e", fontWeight:900, letterSpacing:4, animation:"flash 0.6s ease-in-out infinite", textShadow:"0 0 40px rgba(34,197,94,0.8)" }}>WINNER! 🎉</div>
        )}
        {hardDeckStatus === "won" && hardDeckPotential < 40 && (
          <div style={{ fontSize:44, color:"#22c55e", fontWeight:800 }}>WINNER! 🎉</div>
        )}
        {hardDeckStatus === "lost" && (
          <div style={{ fontSize:44, color:"#ef4444", fontWeight:800 }}>BUST!</div>
        )}
      </div>
    );
  }

  if (phase === "waiting" || phase === "round_start" || phase === "round_end") {
    if (phase !== "waiting") {
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
    const card = POWER_CARDS[introCardIdx];
    return (
      <div style={{ minHeight:"100vh", background:bg, display:"flex", fontFamily:font }}>
        {/* Left: compact join info */}
        <div style={{ flex:"0 0 38%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:32, borderRight:"2px solid rgba(190,38,193,0.2)" }}>
          <img src="/me-logo.jpg" alt="ME" style={{ width:52, height:52, borderRadius:"50%", marginBottom:14, border:"2px solid "+purple }} />
          <div style={{ fontSize:34, fontWeight:800, color:purple, letterSpacing:3, marginBottom:4, textShadow:"0 0 24px rgba(190,38,193,0.6)" }}>Quiz-It</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", letterSpacing:2, marginBottom:28 }}>powered by Mac Entertainment</div>
          <div style={{ padding:"20px 28px", borderRadius:16, background:"rgba(255,255,255,0.05)", border:"2px solid rgba(190,38,193,0.4)", textAlign:"center" }}>
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)", letterSpacing:2, marginBottom:6 }}>JOIN AT</div>
            <div style={{ fontSize:18, color:"#fff", fontWeight:700, letterSpacing:1, marginBottom:16 }}>quiz-it-six.vercel.app/join</div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)", letterSpacing:2, marginBottom:6 }}>ENTER PIN</div>
            <div style={{ fontSize:64, fontWeight:900, color:"#fff", letterSpacing:10, fontFamily:"monospace", lineHeight:1, textShadow:"0 0 30px rgba(190,38,193,0.8)" }}>{sessionPin}</div>
          </div>
        </div>
        {/* Right: rotating power card explainer */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40 }}>
          <div key={introCardIdx} style={{
            display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center", maxWidth:560,
            animation:"introCardFade 0.6s ease",
          }}>
            <div style={{
              width:140, height:140, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:64, marginBottom:24, background:card.color+"22", border:"4px solid "+card.color,
              boxShadow:"0 0 50px "+card.color+"66",
            }}>{card.emoji}</div>
            <div style={{ fontSize:15, color:"rgba(255,255,255,0.4)", letterSpacing:4, marginBottom:8 }}>POWER CARD</div>
            <div style={{ fontSize:44, fontWeight:900, color:card.color, letterSpacing:2, marginBottom:18, textShadow:"0 0 30px "+card.color+"88" }}>{card.title}</div>
            <div style={{ fontSize:22, color:"rgba(255,255,255,0.8)", lineHeight:1.5 }}>{card.desc}</div>
            <div style={{ display:"flex", gap:8, justifyContent:"center", marginTop:32 }}>
              {POWER_CARDS.map((c, i) => (
                <div key={i} style={{ width:10, height:10, borderRadius:"50%", background: i===introCardIdx ? c.color : "rgba(255,255,255,0.2)" }} />
              ))}
            </div>
          </div>
        </div>
        <style>{`@keyframes introCardFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
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
  // SPIN TO WIN
  if (phase === "spin_to_win") {
    return (
      <div style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:font, padding:40 }}>
        <div style={{ width:"100%", maxWidth:900 }}>
          <SlotReels targetIdx={spinTargetIdx} spinNonce={spinNonce} teamName={fastestTeam || "Team"} victorySong={fastestSong || undefined} size="full" audioEnabled={true} />
        </div>
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
          {[...revealed].reverse().map((s, i) => {
            const pos = sorted.length - revealed.length + 1 + i;
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
    const winnerTeam = teams.find(t => t.team_name === fastestTeam);
    const confettiColors = ["#BE26C1","#F5B800","#22C55E","#38BDF8","#F87171","#A78BFA","#FB923C"];
    return (
      <div style={{ height:"100vh", background:bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'Inter',sans-serif", position:"relative", overflow:"hidden" }}>
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
          <div style={{ textAlign:"center", position:"relative", zIndex:2, padding:"0 48px" }}>
            <div style={{ fontSize:13, fontWeight:700, letterSpacing:5, color:"rgba(255,255,255,0.3)", marginBottom:28 }}>FASTEST CORRECT ANSWER</div>
            <div style={{ fontSize:"clamp(52px,8vw,96px)", fontWeight:900, color:"#fff", letterSpacing:2, lineHeight:1, animation:"nameSlam 0.65s cubic-bezier(0.34,1.56,0.64,1) both" }}>
              {fastestTeam}
            </div>
            {showWinnerPhoto && winnerTeam?.photo_url && (
              <img src={winnerTeam.photo_url} alt={fastestTeam} style={{ width:200, height:200, borderRadius:"50%", objectFit:"cover", border:"4px solid "+purple, marginTop:24, animation:"goldRise 0.5s 0.5s ease-out both", opacity:0 }} />
            )}
          </div>
        ) : (
          <div style={{ fontSize:52, fontWeight:800, color:"rgba(255,255,255,0.25)", fontFamily:"'Inter',sans-serif", textAlign:"center" }}>No correct answers this round</div>
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
      <div style={{ height:"100vh", background:"#0D0110", display:"flex", flexDirection:"column", fontFamily:"'Inter',sans-serif", color:"#fff", animation:"flashReveal 0.45s ease-out", position:"relative" }}>
        {/* HEADER */}
        <div style={{ flexShrink:0, padding:"14px 40px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid rgba(34,197,94,0.2)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:11, fontWeight:700, letterSpacing:3, color:"rgba(255,255,255,0.22)" }}>{roundName || "GENERAL KNOWLEDGE"}</span>
            <span style={{ padding:"3px 12px", background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.4)", borderRadius:999, fontSize:10, fontWeight:700, color:"#22C55E", letterSpacing:2 }}>ANSWER REVEALED</span>
          </div>
          <span style={{ fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.2)" }}>Q {questionIndex + 1}</span>
        </div>
        {/* CONTENT */}
        <div style={{ flex:1, minHeight:0, padding:"20px 48px 14px", display:"flex", flexDirection:"column", gap:14 }}>
          <div style={{ fontSize:"clamp(22px,2.2vw,36px)", fontWeight:700, color:"rgba(255,255,255,0.38)", lineHeight:1.25 }}>
            {question.question_text.replace(/^Play this track:\s*/i, "").replace(/^Show teams this image:\s*/i, "")}
          </div>
          {isMulti ? (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:12 }}>
              {options.map((opt, idx) => {
                const isCorrect = opt.key.toLowerCase() === correctKey;
                return (
                  <div key={opt.key} style={{ display:"flex", alignItems:"center", gap:20,
                    padding:"22px 28px", borderRadius:16,
                    background: isCorrect ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.07)",
                    border: `1px solid ${isCorrect ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.12)"}`,
                    animation: isCorrect ? "correctPop 0.5s 0.05s ease-out" : `wrongFade 0.5s ${0.08 + idx * 0.05}s forwards` }}>
                    <span style={{ fontSize:26, fontWeight:900, color:isCorrect?"#22C55E":purple, minWidth:36, flexShrink:0 }}>{opt.key}.</span>
                    <span style={{ fontSize:28, fontWeight:isCorrect?800:700, color:isCorrect?"#22C55E":"rgba(255,255,255,0.35)", lineHeight:1.2 }}>{opt.text}</span>
                    {isCorrect && <span style={{ fontSize:24, color:"#22C55E", marginLeft:"auto" }}>✓</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ padding:"40px 60px", borderRadius:20, background:"rgba(34,197,94,0.08)",
                border:"2px solid rgba(34,197,94,0.5)", textAlign:"center", animation:"correctPop 0.5s 0.05s ease-out",
                maxWidth:"70%" }}>
                <div style={{ fontSize:12, fontWeight:700, letterSpacing:4, color:"rgba(34,197,94,0.7)", marginBottom:16 }}>CORRECT ANSWER</div>
                <div style={{ fontSize:"clamp(48px,6vw,96px)", fontWeight:900, color:"#22C55E", lineHeight:1 }}>{correctText}</div>
              </div>
            </div>
          )}
        </div>
        {/* FOOTER */}
        <div style={{ flexShrink:0, padding:"9px 40px", borderTop:"1px solid rgba(34,197,94,0.15)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.28)", fontStyle:"italic" }}>
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
        <div style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:font, position:"relative" }}>
          <div style={{ position:"absolute", top:20, right:30, fontSize:18, color:"rgba(255,255,255,0.3)", letterSpacing:2 }}>Q{questionIndex+1} - Quiz-It</div>
          <img src={imageUrl} alt="Quiz image" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; setImageLoadFailed(true); }} style={{ maxWidth:"90vw", maxHeight:"85vh", borderRadius:16, objectFit:"contain", boxShadow:"0 0 60px rgba(190,38,193,0.3)", display: imageLoadFailed ? "none" : "block" }} />
          {imageLoadFailed && (
            <div style={{ padding:"60px 80px", borderRadius:20, background:"rgba(255,255,255,0.06)", border:"2px solid rgba(255,255,255,0.15)", textAlign:"center" }}>
              <div style={{ fontSize:48, marginBottom:16 }}>🖼️</div>
              <div style={{ fontSize:22, color:"rgba(255,255,255,0.5)" }}>Image could not be loaded</div>
            </div>
          )}
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
                {!imageLoadFailed ? (
                  <img src={imageUrl} alt="Quiz image" onError={() => setImageLoadFailed(true)} style={{ maxWidth:"100%", maxHeight:"70vh", borderRadius:12, objectFit:"contain" }} />
                ) : (
                  <div style={{ padding:"40px 60px", borderRadius:16, background:"rgba(255,255,255,0.06)", border:"2px solid rgba(255,255,255,0.15)", textAlign:"center" as const }}>
                    <div style={{ fontSize:40, marginBottom:12 }}>🖼️</div>
                    <div style={{ fontSize:18, color:"rgba(255,255,255,0.5)" }}>Image could not be loaded</div>
                  </div>
                )}
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
    const tLeft = timeLeft ?? 0;
    const tTotal = timerTotalRef.current || 30;
    const tColor = tLeft <= 3 ? "#EF4444" : tLeft <= 6 ? "#F59E0B" : "#BE26C1";
    const CIRC = 226;
    const tDash = CIRC * (tLeft / tTotal);
    const allOpts = isMulti ? options : isMultiTap ? multiTapOptions : [];
    return (
      <div style={{ height:"100vh", display:"flex", flexDirection:"column", fontFamily:"'Inter',sans-serif", color:"#fff",
        position:"relative", overflow:"hidden",
        background:"linear-gradient(160deg,#08001a 0%,#12002a 45%,#0a0018 100%)",
        animation: tLeft <= 3 && tLeft > 0 ? "screenPulse 0.8s ease-in-out infinite" : "none" }}>
        <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse 70% 50% at 50% 20%, rgba(190,38,193,0.12) 0%, transparent 65%)", pointerEvents:"none", zIndex:0 }} />
        <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse 40% 30% at 80% 80%, rgba(190,38,193,0.05) 0%, transparent 60%)", pointerEvents:"none", zIndex:0 }} />
        <svg style={{ position:"absolute", bottom:0, left:0, width:"100%", height:180, pointerEvents:"none", zIndex:0 }} viewBox="0 0 1920 180" preserveAspectRatio="none">
          <path d="M0,120 C320,60 640,160 960,100 C1280,40 1600,120 1920,80 L1920,180 L0,180 Z" fill="rgba(190,38,193,0.18)" />
          <path d="M0,150 C240,100 480,160 720,130 C960,100 1200,155 1440,125 C1680,95 1800,140 1920,120 L1920,180 L0,180 Z" fill="rgba(190,38,193,0.1)" />
        </svg>
        <div style={{ flexShrink:0, padding:"16px 44px", display:"grid", gridTemplateColumns:"1fr auto 1fr", alignItems:"center", position:"relative", zIndex:2 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:12, fontWeight:700, letterSpacing:3, color:"rgba(255,255,255,0.45)", textTransform:"uppercase" }}>{roundName || "General Knowledge"}</span>
            <span style={{ padding:"4px 14px", background:"rgba(190,38,193,0.15)", border:"1px solid rgba(190,38,193,0.5)", borderRadius:999, fontSize:11, fontWeight:700, color:purple, letterSpacing:2 }}>Q {questionIndex + 1}</span>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"'Bruno Ace SC',sans-serif", fontSize:30, letterSpacing:6, lineHeight:1, filter:"drop-shadow(0 0 14px rgba(190,38,193,0.55))" }}>
              <span style={{ color:purple }}>QUIZ-</span><span style={{ color:"#fff" }}>IT</span>
            </div>
            <div style={{ fontSize:10, fontWeight:600, letterSpacing:4, color:"rgba(255,255,255,0.38)", marginTop:5, textTransform:"uppercase" }}>Powered by Mac Entertainment</div>
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            {tLeft > 0 && (
              <div style={{ width:88, height:88, position:"relative", animation: tLeft <= 3 ? "timerUrgent 0.5s ease-in-out infinite" : "none" }}>
                <svg width="88" height="88" viewBox="0 0 88 88" style={{ transform:"rotate(-90deg)", position:"absolute", inset:0 }}>
                  <circle cx="44" cy="44" r="39" fill="none" stroke="rgba(190,38,193,0.18)" strokeWidth="6"/>
                  <circle cx="44" cy="44" r="39" fill="none" stroke={tColor} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={CIRC} strokeDashoffset={CIRC - tDash}
                    style={{ transition:"stroke-dashoffset 0.9s linear, stroke 0.3s", filter:`drop-shadow(0 0 8px ${tColor})` }}/>
                </svg>
                <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, fontWeight:900, color:tColor, filter:`drop-shadow(0 0 6px ${tColor})` }}>{tLeft}</div>
              </div>
            )}
          </div>
        </div>
        <div style={{ height:1, flexShrink:0, background:"linear-gradient(90deg,transparent,rgba(190,38,193,0.8) 30%,rgba(212,175,55,0.4) 50%,rgba(190,38,193,0.8) 70%,transparent)", position:"relative", zIndex:2 }} />
        <div style={{ flex:1, minHeight:0, padding:"24px 56px 12px", display:"flex", flexDirection:"column", gap:18, position:"relative", zIndex:2 }}>
          <div style={{ fontSize:"clamp(28px,3.2vw,52px)", fontWeight:800, color:"#fff", lineHeight:1.3, textAlign:"center", animation:"qSlideUp 0.5s cubic-bezier(0.16,1,0.3,1) both", textShadow:"0 2px 24px rgba(190,38,193,0.15)" }}>
            {question.question_text.replace(/^Play this track:\s*/i, "").replace(/^Show teams this image:\s*/i, "")}
          </div>
          {allOpts.length > 0 && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, flex:1, minHeight:0 }}>
              {allOpts.map((opt, idx) => (
                <div key={opt.key} style={{
                  display:"flex", alignItems:"stretch", borderRadius:22, overflow:"hidden",
                  background:"linear-gradient(135deg,rgba(18,8,32,0.95) 0%,rgba(12,4,24,0.9) 100%)",
                  border:"1px solid rgba(190,38,193,0.4)",
                  boxShadow:"inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(190,38,193,0.07)",
                  position:"relative",
                  animation:`optSlide 0.4s ${idx * 0.07}s cubic-bezier(0.16,1,0.3,1) both`, opacity:0
                }}>
                  <div style={{ position:"absolute", bottom:0, left:"15%", right:"15%", height:1, background:"linear-gradient(90deg,transparent,rgba(212,175,55,0.45),transparent)" }} />
                  <div style={{ position:"absolute", top:0, left:"20%", right:"20%", height:1, background:"linear-gradient(90deg,transparent,rgba(190,38,193,0.35),transparent)" }} />
                  <div style={{ width:86, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:40, fontWeight:900, color:purple, filter:"drop-shadow(0 0 8px rgba(190,38,193,0.7))" }}>
                    {opt.key}
                  </div>
                  <div style={{ width:1, background:"linear-gradient(180deg,transparent 10%,rgba(190,38,193,0.35) 50%,transparent 90%)", flexShrink:0, margin:"18px 0" }} />
                  <div style={{ flex:1, display:"flex", alignItems:"center", padding:"20px 28px", fontSize:22, fontWeight:700, color:"rgba(255,255,255,0.95)", lineHeight:1.3 }}>
                    {opt.text}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!isMulti && !isMultiTap && question.question_type !== "audio" && (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ fontSize:"clamp(80px,10vw,160px)", opacity:0.04, fontWeight:900, color:"#fff" }}>?</div>
            </div>
          )}
          {question.question_type === "audio" && (
            <div style={{ marginTop:8 }}><LiveAudioPlayer question={question} /></div>
          )}
        </div>
        <div style={{ flexShrink:0, padding:"10px 44px", borderTop:"1px solid rgba(190,38,193,0.25)", display:"flex", alignItems:"center", justifyContent:"space-between", position:"relative", zIndex:2 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:purple, boxShadow:"0 0 8px rgba(190,38,193,0.9)" }} />
            <span style={{ fontSize:11, fontWeight:600, letterSpacing:2, color:"rgba(255,255,255,0.3)", textTransform:"uppercase" }}>
              {answeredTeams.length > 0 ? `${answeredTeams.length} team${answeredTeams.length !== 1 ? "s" : ""} answered` : "Waiting for answers..."}
            </span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:34, height:34, borderRadius:"50%", background:"rgba(190,38,193,0.15)", border:"1.5px solid rgba(190,38,193,0.5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:purple }}>ME</div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontFamily:"'Bruno Ace SC',sans-serif", fontSize:12, letterSpacing:2 }}><span style={{ color:purple }}>QUIZ-</span><span style={{ color:"#fff" }}>IT</span></div>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", letterSpacing:1, marginTop:2 }}>Powered by Mac Entertainment · by Sonya Mac</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function DisplayScreen() {
  return (
    <Suspense fallback={<div style={{ minHeight:"100vh", background:"#0d0225" }} />}>
      <DisplayScreenInner />
      {/* Persistent branding overlay - sits on top of every phase screen
          regardless of which internal return branch rendered, instead of
          needing to be threaded through each one individually. */}
      <div style={{
        position: "fixed", bottom: 14, right: 18, zIndex: 9999,
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 12px", borderRadius: 999,
        background: "rgba(13,2,37,0.6)", border: "1px solid rgba(190,38,193,0.3)",
        pointerEvents: "none" as const,
      }}>
        <img src="/me-logo.jpg" alt="ME" style={{ width: 20, height: 20, borderRadius: "50%" }} />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "'Bruno Ace SC',sans-serif", letterSpacing: 0.5 }}>
          Quiz-It powered by Mac Entertainment by Sonya Mac
        </span>
      </div>
    </Suspense>
  );
}
