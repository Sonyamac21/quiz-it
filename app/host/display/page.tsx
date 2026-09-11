"use client";
import { displayLeaderboardVisible } from "@/lib/quiz/leaderboardVisibility";
import { useEffect, useLayoutEffect, useState, useRef, Suspense, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { BrandLockup } from "@/components/ui/quiz-it-ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMediaUrl } from "@/lib/getMediaUrl";
import { SpinWheel, buildTeamSegments } from "@/components/SpinWheel";
import { SlotReels } from "@/components/SlotReels";
import { PursuitPhase, PursuitRace, readPursuitState, readRace, readQIndex, pursuitCorrectAnswerText, PURSUIT_TOTAL_QUESTIONS } from "@/lib/quiz/pursuit";
import { PursuitBoard } from "@/components/PursuitBoard";
import { teamInitials } from "@/components/TeamBadge";
import { RoundStart, RoundEnd, Intermission, IntermissionGallery, WaitingForHost } from "@/components/fable/DisplayStates";
import { enableShowAudio, playShowAudio, preloadShowAudio, stopAllShowAudio, stopShowAudio, victorySongAudioFile } from "@/lib/audio/showAudio";
import { PLATFORM_CONFIG } from "@/lib/platform/config";
import { displaySnapshot, type DisplaySnapshot } from "@/lib/diagnostics/displayHealth";
import { useDisplayResponder } from "@/lib/diagnostics/useDisplayHealth";
import { HOT_SEAT_ANSWER_SECONDS, readHotSeatState, type HotSeatStatus } from "@/lib/quiz/hotSeat";

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
type Phase = "waiting" | "round_start" | "question" | "hot_seat" | "answer" | "celebration" | "round_end" | "scoreboard" | "quiz_end" | "hard_deck" | "intermission" | "spin_to_win" | "pursuit";

// Corner branding badge shown on every display screen. Centralised so the
// design only has to be changed in one place instead of the 7 identical
// copies that used to be scattered through this file.
//
// Previously included a small circular headshot (badge-avatar) - at the
// size this badge renders on a real venue TV it read as an illegible,
// pointless blob rather than a recognisable photo, so it's been dropped in
// favour of just the (now larger/clearer) wordmark text.
function QuizItBadge() {
  return (
    <div className="badge">
      <span className="badge-text">QUIZ-IT · Powered by Mac Entertainment</span>
    </div>
  );
}

// Simple inline Instagram glyph so the venue's handle reads instantly as
// "this is our Instagram" rather than just a plain @-string - no icon font
// or external asset needed, sized via em so it always matches the
// headline text it sits next to.
function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.6" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.4" cy="6.6" r="1.3" fill="currentColor" />
    </svg>
  );
}

// Guaranteed-fit text: two rounds of trying to precompute a font-size that
// would fit (first with vw units, then with container-query cqw units)
// both still overflowed in real testing - vw ignores ancestor padding, and
// the cqw estimate for this particular font's actual glyph width was still
// wrong. Rather than guess a third formula, this measures its own real
// rendered width against its container's real available width and scales
// itself down by whatever factor actually makes it fit - correct by
// construction, regardless of font metrics, screen size, or how much
// padding sits between it and the viewport. Never scales UP past 1 (so it
// doesn't blow past its intended max size on a container with room to
// spare), and re-measures on resize.
function FitText({ children, className }: { children: ReactNode; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const baseFontSizeRef = useRef<number | null>(null);
  const [fontSize, setFontSize] = useState<number | null>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current, inner = innerRef.current;
    if (!wrap || !inner) return;
    // The className this renders with (.lb-reel-brand-headline) carries a
    // slide-in animation that itself animates `transform` - an earlier
    // version of this component ALSO scaled via `transform`, and the two
    // fought over the same CSS property. During the animation the
    // keyframe's `transform: none` won, silently cancelling the shrink and
    // showing the text at full, overflowing size. Scaling via font-size
    // instead avoids this entirely - nothing else here touches font-size.
    if (baseFontSizeRef.current == null) {
      baseFontSizeRef.current = parseFloat(getComputedStyle(inner).fontSize) || 16;
    }
    const base = baseFontSizeRef.current;
    // Confirmed via live devtools inspection (real production measurements,
    // not guesswork): fit() was correctly computing a shrink factor, but the
    // number it used to compute that factor (inner.scrollWidth, measured
    // against the FALLBACK system font because the real "Bruno Ace SC" font
    // hadn't swapped in yet) was too small - so it under-corrected. The
    // real font's glyphs render wider, so even the "fitted" size still
    // overflowed once the real font finally swapped in. document.fonts.ready
    // alone didn't reliably catch this: that promise can resolve before the
    // browser has actually started fetching a font that's about to be
    // painted for the first time, so a later real swap can still slip past
    // it with nothing here re-measuring. Two changes: (1) also listen for
    // the browser's actual 'loadingdone' font-swap event for the life of
    // this component, not just a one-time ready check; (2) after applying a
    // fit, verify against the real rendered result on the next frame and
    // correct again if it still doesn't fit - this no longer trusts any
    // single measurement to be the final word.
    let correctionAttempts = 0;
    const fit = () => {
      const available = wrap.offsetWidth;
      inner.style.fontSize = base + "px";
      const natural = inner.scrollWidth;
      const factor = natural > available && available > 0 ? available / natural : 1;
      const nextSize = base * factor;
      inner.style.fontSize = nextSize + "px";
      setFontSize(nextSize);
      correctionAttempts = 0;
      requestAnimationFrame(verifyAndCorrect);
    };
    const verifyAndCorrect = () => {
      const available = wrap.offsetWidth;
      const actual = inner.scrollWidth;
      if (actual > available && available > 0 && correctionAttempts < 5) {
        correctionAttempts += 1;
        const current = parseFloat(inner.style.fontSize) || base;
        const corrected = current * (available / actual);
        inner.style.fontSize = corrected + "px";
        setFontSize(corrected);
        requestAnimationFrame(verifyAndCorrect);
      }
    };
    fit();
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(fit).catch(() => {});
      document.fonts.addEventListener?.("loadingdone", fit);
    }
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      if (typeof document !== "undefined" && "fonts" in document) {
        document.fonts.removeEventListener?.("loadingdone", fit);
      }
    };
  }, [children]);

  return (
    <div ref={wrapRef} style={{ width: "100%", overflow: "hidden", display: "flex", justifyContent: "center" }}>
      <div ref={innerRef} className={className} style={{ display: "inline-flex", alignItems: "center", gap: ".3em", whiteSpace: "nowrap", ...(fontSize != null ? { fontSize } : {}) }}>
        {children}
      </div>
    </div>
  );
}

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
  const [needsManualPlay, setNeedsManualPlay] = useState(false);
  const url = getMediaUrl(question.option_b);
  const isLegacyYouTube = !!url && url.includes("youtube.com");

  useEffect(() => {
    if (!url || isLegacyYouTube) return;
    const el = question.playback_mode !== "manual"
      ? playShowAudio(url, { channel: "music", volume: question.fade_in ? 0 : 1, loop: question.replay_mode === "unlimited" })
      : audioRef.current;
    if (!el) { setNeedsManualPlay(true); return; }
    audioRef.current = el;
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
  }, [url, question.fade_in, question.fade_out, question.replay_mode, question.playback_mode, isLegacyYouTube]);

  if (!url || isLegacyYouTube) return null;

  const isManualMode = question.playback_mode === "manual";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <audio
        ref={audioRef}
        src={isManualMode ? url : undefined}
        preload="auto"
        autoPlay={!isManualMode}
        onPlay={() => setNeedsManualPlay(false)}
        onError={() => setNeedsManualPlay(true)}
        style={{ display: "none" }}
      />
      {((isManualMode && !manualPlayed) || needsManualPlay) && (
        <button
          onClick={() => {
            const el = playShowAudio(url, { channel: "music", volume: 1, loop: question.replay_mode === "unlimited" });
            audioRef.current = el;
            setManualPlayed(!!el); setNeedsManualPlay(!el);
          }}
          style={{ padding: "14px 28px", borderRadius: 14, background: "rgba(190,38,193,0.25)", border: "2px solid #BE26C1", color: "#fff", fontSize: 20, fontWeight: 700, cursor: "pointer" }}
        >
          {needsManualPlay ? "\u25b6 Audio blocked \u2014 play track" : "\u25b6 Play Track"}
        </button>
      )}
    </div>
  );
}

const PRELOAD_SOUNDS = ["airhorn.mp3", "sad-trombone.mp3", "round-start.mp3", "clapping-scores.mp3", "countdown-urgent.mp3", "lock.mp3", "crowd-cheer.mp3", "correct-chime.mp3", "footsteps.mp3", "whoosh.mp3", "slot-spin.mp3"];

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

function DisplayWakeControl() {
  const [awake, setAwake] = useState(false);
  const [supported, setSupported] = useState(true);
  const retry = useRef<() => void>(() => {});
  useEffect(() => {
    if (!("wakeLock" in navigator)) { setSupported(false); return; }
    let disposed = false;
    let pending = false;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      if (disposed || pending || (lock && !lock.released) || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (disposed) { await next.release(); return; }
        lock = next;
        setAwake(true);
        next.addEventListener("release", () => { if (!disposed && lock === next) setAwake(false); });
      } catch { if (!disposed) setAwake(false); }
      finally { pending = false; }
    };
    retry.current = () => { void acquire(); };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      disposed = true;
      retry.current = () => {};
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, []);
  // The wake lock itself still runs (a display screen sleeping mid-quiz is a
  // real problem) - only the persistent on-screen "Screen staying awake"
  // button/badge is gone, since it sat on top of the show the whole night for
  // no ongoing reason once the lock was acquired. Silently retry from the
  // visibilitychange listener above covers the normal re-acquire case; if a
  // device truly drops the lock and needs a manual tap, that's the one
  // remaining gap, but it's a rare edge case not worth a permanent overlay.
  void awake;
  void supported;
  return null;
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
          // Fixed px offsets/sizes here used to be tuned for one screen size -
          // on a venue's actual TV/projector (which varies wildly, unlike a
          // laptop preview) that meant this could sit too close to the edge
          // or read too small/large relative to everything else on screen.
          // vh/vw-based sizing scales with the actual display instead.
          position: "fixed", top: "2.2vh", left: "50%",
          transform: announceVisible ? "translate(-50%, 0) scale(1)" : "translate(-50%, -16px) scale(0.96)",
          opacity: announceVisible ? 1 : 0,
          transition: "opacity 0.35s ease, transform 0.35s ease",
          zIndex: 9999, pointerEvents: "none",
          display: "flex", alignItems: "center", gap: "1.2vw",
          padding: "1.4vh 2.2vw", borderRadius: 18,
          background: "rgba(20,5,40,0.96)",
          border: "2px solid " + (POWER_CARDS.find(p => p.type === currentAnnounce.type)?.color || "#BE26C1"),
          boxShadow: "0 8px 40px rgba(0,0,0,0.55), 0 0 30px " + (POWER_CARDS.find(p => p.type === currentAnnounce.type)?.color || "#BE26C1") + "66",
          fontFamily: "'Inter', sans-serif",
        }}>
          <span style={{ fontSize: "clamp(14px,1.5vw,24px)", fontWeight: 800, letterSpacing: 1.5, color: POWER_CARDS.find(p => p.type === currentAnnounce.type)?.color || "#BE26C1" }}>
            {"\u26A1 POWER CARD"}
          </span>
          <span style={{ fontSize: "clamp(15px,1.7vw,26px)", fontWeight: 800, color: "#fff" }}>{currentAnnounce.team}</span>
          <span style={{ fontSize: "clamp(14px,1.5vw,24px)", fontWeight: 700, color: POWER_CARDS.find(p => p.type === currentAnnounce.type)?.color || "#fff" }}>
            {POWER_CARDS.find(p => p.type === currentAnnounce.type)?.title || currentAnnounce.type}
          </span>
        </div>
      )}
      {thisRoundCards.length > 0 && (
        <div style={{ position: "fixed", bottom: "2vh", right: "1.6vw", zIndex: 9998, display: "flex", flexDirection: "column", gap: "0.6vh", fontFamily: "'Inter', sans-serif" }}>
          {thisRoundCards.map((c, i) => {
            const card = POWER_CARDS.find(p => p.type === c.card_type);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.6vw", padding: "0.6vh 1vw", borderRadius: 10, background: "rgba(20,5,40,0.9)", border: "1px solid " + (card?.color || "#888"), color: "#fff", fontSize: "clamp(11px,0.9vw,15px)", fontWeight: 600, maxWidth: "min(90vw, 480px)" }}>
                <span style={{ flexShrink: 0 }}>{card?.emoji}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{c.team_name}</span>
                <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>{card?.title}</span>
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
  // Same round-boundary timestamp the host page persists (see
  // supabase/migrations/202608270002_session_round_started_at.sql) - used
  // to scope the "Locked In" answers query below to THIS round only.
  // Question indexes restart at 0 every round, so without this boundary an
  // answer left over from a previous round with the same index could
  // reappear as a currently-locked-in team.
  const [roundStartedAt, setRoundStartedAt] = useState<string | null>(null);
  // Live "locked in" count: distinct teams that have submitted an answer for the
  // CURRENT question, driven by realtime answers INSERTs (not the post-reveal
  // answered_teams snapshot). qIndexRef lets the once-subscribed answers callback
  // filter to the current question without re-subscribing.
  const [lockedTeams, setLockedTeams] = useState<string[]>([]);
  const qIndexRef = useRef(0);
  // Codex pre-launch review, finding #8: guards against an out-of-order
  // session snapshot (e.g. a slow poll response landing after a newer
  // realtime update already applied) overwriting the display with stale
  // data - see applySession below and the sessions.updated_at trigger in
  // supabase/migrations/202608270004_session_updated_at_ordering.sql.
  const lastAppliedUpdatedAtRef = useRef(0);
  const [acknowledgedSnapshot, setAcknowledgedSnapshot] = useState<DisplaySnapshot | null>(null);
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
  const [hotSeatStatus, setHotSeatStatus] = useState<HotSeatStatus>("idle");
  const [hotSeatTeam, setHotSeatTeam] = useState<string | null>(null);
  const [hotSeatLockedTeams, setHotSeatLockedTeams] = useState<string[]>([]);
  const prevHotSeatStatusRef = useRef<HotSeatStatus>("idle");
  const prevHotSeatPhaseRef = useRef<Phase>("waiting");
  const hotSeatUrgentPlayedRef = useRef<string | null>(null);
  const hotSeatLockPlayedRef = useRef<string | null>(null);
  // Hot Seat uses the same final-five countdown and lock cues as other timed
  // gameplay. The question/team key prevents realtime echoes and safety polls
  // from replaying either sound.
  useEffect(() => {
    if (phase !== "hot_seat" || hotSeatStatus !== "claimed" || !hotSeatTeam || timeLeft === null) return;
    const attemptKey = `${questionIndex}:${hotSeatTeam}`;
    if (timeLeft === 5 && hotSeatUrgentPlayedRef.current !== attemptKey) {
      hotSeatUrgentPlayedRef.current = attemptKey;
      playSound("countdown-urgent.mp3", 0.35);
    }
    if (timeLeft === 0 && hotSeatLockPlayedRef.current !== attemptKey) {
      hotSeatLockPlayedRef.current = attemptKey;
      playSound("lock.mp3", 0.5);
    }
  }, [phase, hotSeatStatus, hotSeatTeam, timeLeft, questionIndex]);
  const [pinInput, setPinInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [sessionPin, setSessionPin] = useState("");
  useDisplayResponder(sessionPin, connected, acknowledgedSnapshot);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  // Whether the realtime channel is currently down (CHANNEL_ERROR/TIMED_OUT/
  // CLOSED after having connected once). The screen keeps running off the
  // poll-based safety nets during a drop, but the venue's projector should
  // show something reassuring rather than silently stalling - see the small
  // banner rendered below the main display.
  const [realtimeDown, setRealtimeDown] = useState(false);
  const hasSubscribedOnceRef = useRef(false);
  const [fastestTeam, setFastestTeam] = useState<string|null>(null);
  const [fastestSong, setFastestSong] = useState<string|null>(null);
  const [hardDeckTeam, setHardDeckTeam] = useState<string|null>(null);
  const [hardDeckCards, setHardDeckCards] = useState<{ rank: number; suit: string }[]>([]);
  const [hardDeckStatus, setHardDeckStatus] = useState<string>("idle");
  const [hardDeckPotential, setHardDeckPotential] = useState(0);
  const [hardDeckWheelTarget, setHardDeckWheelTarget] = useState<number|null>(null);
  const [hardDeckWheelSpinning, setHardDeckWheelSpinning] = useState(false);
  const [hardDeckStealWinners, setHardDeckStealWinners] = useState<string[]>([]);
  const prevHardDeckStatusRef = useRef<string>("idle");
  // Transient "DOUBLED!" / "+N POINTS" callouts, keyed so the CSS animation
  // restarts each time even if the same status repeats across a fresh Hard
  // Deck turn (React won't replay a keyframe animation on an unchanged key).
  const [hdCelebration, setHdCelebration] = useState<{ type: "correct" | "won"; amount: number; key: number } | null>(null);
  const hdCelebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [venueRecordId, setVenueRecordId] = useState<string | null>(null);
  const [approvedCustomerPhotos, setApprovedCustomerPhotos] = useState<string[]>([]);
  // Poll approved customer photos only while actually on the intermission
  // screen - approvals can land at any moment, so this can't be a one-shot
  // fetch, but there's no need to keep querying it during live gameplay.
  useEffect(() => {
    if ((phase !== "intermission" && phase !== "waiting") || !sessionPin) { setApprovedCustomerPhotos([]); return; }
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    async function loadApprovedPhotos() {
      const { data } = await supabase.from("session_photos").select("photo_url").eq("session_pin", sessionPin).eq("approved", true).order("created_at", { ascending: true });
      if (!cancelled) setApprovedCustomerPhotos((data || []).map(row => row.photo_url as string));
    }
    loadApprovedPhotos();
    const interval = window.setInterval(loadApprovedPhotos, 5000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [phase, sessionPin]);
  // Venue Offers ("Generic offers"/venue-offer rotation, uploaded on the
  // Venues page) rotate on player handsets specifically, per the host - the
  // Display screen's own gallery uses intermissionVenuePhotos (Display
  // Slides/Adverts, curated for the TV) instead. See fetchActiveVenueOffers
  // usage in PlayerQuizScreen.tsx for the handset side of this.
  // THE PURSUIT — display-side mirror of pursuit_status + the pursuit_data race.
  const [pursuitStatus, setPursuitStatus] = useState<PursuitPhase>("idle");
  const [pursuitRace, setPursuitRace] = useState<PursuitRace>({});
  const [pursuitQIndex, setPursuitQIndex] = useState(-1);
  const prevPursuitStatusRef = useRef<string>("idle");
  const prevPursuitRaceRef = useRef<PursuitRace>({});
  const pursuitUrgentPlayedRef = useRef<number>(-1);
  const pursuitLockPlayedRef = useRef<number>(-1);
  // Pursuit countdown track + lock click on expiry — once per gate. Previously
  // this only started the countdown-urgent.mp3 track at timeLeft===5, so the
  // host only ever heard the last 5 seconds of what's actually a ~50s ticking
  // clock track meant to be audible for the whole countdown. Now it starts as
  // soon as the gate's question timer appears (any timeLeft while status is
  // "question", guarded to fire once per gate via the ref) and is explicitly
  // stopped the moment the gate leaves "question", so it never bleeds into
  // the reveal/advance cues.
  useEffect(() => {
    if (pursuitStatus !== "question" || timeLeft === null) return;
    if (timeLeft > 0 && pursuitUrgentPlayedRef.current !== pursuitQIndex) {
      pursuitUrgentPlayedRef.current = pursuitQIndex;
      playSound("countdown-urgent.mp3", 0.35);
    }
    if (timeLeft === 0 && pursuitLockPlayedRef.current !== pursuitQIndex) {
      pursuitLockPlayedRef.current = pursuitQIndex;
      playSound("lock.mp3", 0.5);
    }
  }, [timeLeft, pursuitStatus, pursuitQIndex]);
  useEffect(() => {
    if (pursuitStatus !== "question") stopShowAudio("timer");
  }, [pursuitStatus]);
  const [teams, setTeams] = useState<{ team_name: string; victory_song?: string; photo_url?: string; photo_approved?: boolean }[]>([]);
  // Lobby crest wall — flare newly-arrived teams once, then let them settle.
  const [flaringTeams, setFlaringTeams] = useState<Set<string>>(new Set());
  const [countPulsing, setCountPulsing] = useState(false);
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
    // The crest grid below already pops in newly-joined teams; the aggregate
    // "N TEAMS IN THE ROOM" count itself just silently changed number with no
    // visual acknowledgement, so a team joining while nobody happened to be
    // looking at the crest wall was easy to miss entirely. Brief pulse on the
    // number itself, same 1.6s window as the crest flare it's paired with.
    setCountPulsing(true);
    const id = setTimeout(() => setFlaringTeams(prev => { const s = new Set(prev); fresh.forEach(n => s.delete(n)); return s; }), 1600);
    const pulseId = setTimeout(() => setCountPulsing(false), 700);
    return () => { clearTimeout(id); clearTimeout(pulseId); };
  }, [teams]);
  // teams is read inside realtime subscription callbacks set up once at
  // connect-time, whose closures freeze component state at that moment
  // (before the teams fetch has even resolved) - this ref always holds the
  // current value regardless, matching the sessionId staleness fix pattern.
  const teamsRef = useRef(teams);
  useEffect(() => {
    teamsRef.current = teams;
    // Victory tracks must be in the browser cache before a reveal. Previously
    // uploaded tracks were first requested at celebration time, creating a
    // conspicuous network delay after the graphic appeared.
    preloadShowAudio(teams.map(t => t.victory_song).filter((song): song is string => !!song).map(victorySongAudioFile));
  }, [teams]);
  const [showWinnerPhoto, setShowWinnerPhoto] = useState(false);
  const winnerPhotoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winnerPhotoStartedForRef = useRef<string | null>(null);
  const [roundName, setRoundName] = useState("");
  const [roundNumber, setRoundNumber] = useState(1);
  const [scoreboardData, setScoreboardData] = useState<Score[]>([]);
  const [hideLeaderboard, setHideLeaderboard] = useState(false);
  const [displayLeaderboard, setDisplayLeaderboard] = useState(false);
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
  // Venue gallery photos, snapshotted onto the session at creation (see
  // 202607230003_intermission_photos). Rarely changes mid-show, so this is
  // read directly off the session row in applySession, same as the other
  // intermission fields.
  const [intermissionVenuePhotos, setIntermissionVenuePhotos] = useState<string[]>([]);
  const [venueName, setVenueName] = useState<string | null>(null);
  const [venueHeroImageUrl, setVenueHeroImageUrl] = useState<string | null>(null);
  const [venueHeroVideoUrl, setVenueHeroVideoUrl] = useState<string | null>(null);
  // If the uploaded hero video fails to load/play (bad file, network hiccup,
  // codec the TV/browser can't decode), fall back to the hero image if one
  // exists, or the animated branded background - rather than leaving a blank/
  // broken video element on the pre-show screen the moment doors open.
  const [venueHeroVideoFailed, setVenueHeroVideoFailed] = useState(false);
  const [venueLogoUrl, setVenueLogoUrl] = useState<string | null>(null);
  // Auto-generated "venue experience" pre-show scenes - built entirely from
  // fields already on the venue profile (no separate video upload needed),
  // per the host's request: prizes, schedule, host photo, website/socials.
  const [venuePrizeInfo, setVenuePrizeInfo] = useState<string | null>(null);
  const [venueScheduleText, setVenueScheduleText] = useState<string | null>(null);
  const [venueHostName, setVenueHostName] = useState<string | null>(null);
  const [venueHostPhotoUrl, setVenueHostPhotoUrl] = useState<string | null>(null);
  const [venueSocialLinks, setVenueSocialLinks] = useState<Record<string, string>>({});
  // Which scene of the pre-show reel is on screen: the venue's branded
  // video/image, the power card explainer, or floating team photos. Cycles
  // automatically; "photos" is skipped entirely when nobody's uploaded one
  // yet, so the reel never sits on an empty scene.
  const [reelSceneIdx, setReelSceneIdx] = useState(0);
  const [floatingPhotoIdx, setFloatingPhotoIdx] = useState(0);
  const venueInstagramRaw = Object.entries(venueSocialLinks).find(([key, value]) => key.toLowerCase().includes("instagram") && value)?.[1] || "";
  const venueInstagramTag = venueInstagramRaw
    ? "@" + venueInstagramRaw.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "")
    : "";

  const reelScenes = [
    "venue",
    ...(intermissionOffers.trim() ? ["offers"] : []),
    ...(venuePrizeInfo ? ["prizes"] : []),
    // Always shown - this is Mac Entertainment's own handle for players to tag
    // when they post, not tied to whether a venue has its own social links set.
    "tag-us",
    ...(venueInstagramTag ? ["social"] : []),
    "cards",
    ...(approvedCustomerPhotos.length > 0 ? ["photos"] : []),
  ];
  useEffect(() => {
    if (phase !== "waiting") return;
    const id = window.setInterval(() => {
      setReelSceneIdx(i => (i + 1) % reelScenes.length);
    }, 7000);
    return () => window.clearInterval(id);
  }, [phase, reelScenes.length]);
  useEffect(() => {
    if (approvedCustomerPhotos.length === 0) return;
    const id = window.setInterval(() => {
      setFloatingPhotoIdx(i => (i + 1) % approvedCustomerPhotos.length);
    }, 4000);
    return () => window.clearInterval(id);
  }, [approvedCustomerPhotos.length]);
  const currentReelScene = reelScenes[reelSceneIdx % reelScenes.length];

  // Host-approved customer photos (session_photos.approved = true). Unlike
  // the venue photos above, approvals can land at any moment mid-show, so
  // this polls its own session_photos query rather than riding the session
  // row - approving a photo does not touch `sessions` at all.
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
  // Tracks which reveal (by question index) has already had its correct
  // teams' theme songs queued, so a realtime resync/poll for the same
  // reveal doesn't restart the sequence from the top.
  const revealSongsPlayedForRef = useRef<string | null>(null);
  const revealSongsTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  // Tracks the full timer duration so the SVG ring can show correct progress
  const timerTotalRef = useRef<number>(30);

  const purple = "#BE26C1";


  // Track picture sub-phase: "image_only" -> "question_visible"
  const [pictureSubPhase, setPictureSubPhase] = useState<"image_only"|"question_visible">("image_only");
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  const prevQuizEndRevealedRef = useRef<number>(0);
  const prevPhaseForQuizEndRef = useRef<string>("");
  const lastRoundStartCueRef = useRef<string | null>(null);
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
      playShowAudio(victorySongAudioFile(winnerTeam.victory_song), { channel: "music", volume: 0.9 });
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
    // Discard this snapshot entirely if it's older than one we've already
    // applied - a strict `<` (not `<=`) so the same event arriving twice
    // (once via realtime, once via the next poll tick) still re-applies
    // harmlessly rather than being treated as stale. Sessions without an
    // updated_at yet (shouldn't happen post-migration, but defensively) fall
    // through and apply as before.
    const incomingUpdatedAt = data.updated_at ? new Date(data.updated_at as string).getTime() : null;
    if (incomingUpdatedAt !== null) {
      if (incomingUpdatedAt < lastAppliedUpdatedAtRef.current) return;
      lastAppliedUpdatedAtRef.current = incomingUpdatedAt;
    }
    const newPhase = (data.phase as Phase) || "waiting";
    const isRoundOpening = newPhase === "round_start"
      || (newPhase === "pursuit" && readPursuitState(data).status === "intro")
      || (newPhase === "hard_deck" && data.hard_deck_status === "wheel");
    if (isRoundOpening) {
      // round_started_at is rewritten every time the host starts a round, even
      // when they restart the same round while testing. Using only the round
      // record id suppressed the claxon on that second start. Keep ids/numbers
      // as a legacy fallback for older session snapshots.
      const roundKey = String(data.round_started_at ?? `${data.current_session_round_id ?? data.round_id ?? "round"}:${data.round_number ?? "?"}`);
      if (lastRoundStartCueRef.current !== roundKey) {
        lastRoundStartCueRef.current = roundKey;
        playSound("airhorn.mp3", 0.9);
      }
    }
    const spinChoiceVal = (data.spin_choice as string) || null;
    const spinNonceVal = (data.spin_nonce as number) ?? null;
    if (spinChoiceVal === "spin" && spinNonceVal !== null && spinNonceHandledRef.current !== spinNonceVal) {
      spinNonceHandledRef.current = spinNonceVal;
      setPhase("spin_to_win");
    } else {
      setPhase(newPhase);
    }
    const incomingQuestion = (data.current_question as Question) || null;
    setQuestion(incomingQuestion);
    // The host publishes the question before its live answering phase. Start
    // fetching a prepared music clip immediately, not when the display JSX
    // finally mounts its audio player.
    if (incomingQuestion?.question_type === "audio" && incomingQuestion.option_b) {
      const clip = getMediaUrl(incomingQuestion.option_b);
      if (clip && !clip.includes("youtube.com")) preloadShowAudio([clip]);
    }
    setQuestionIndex((data.current_question_index as number) ?? 0);
    setRoundStartedAt((data.round_started_at as string) ?? null);
    qIndexRef.current = (data.current_question_index as number) ?? 0;
    if (data.picture_sub_phase === "question_visible" || data.picture_sub_phase === "image_only") {
      setPictureSubPhase(data.picture_sub_phase);
    }
    setRoundName((data.round_name as string) || "");
    setRoundNumber((data.round_number as number) || 1);
    setVenueName((data.venue_name as string) || null);
    const snapshot = data.event_snapshot as {
      event_date?: string | null; start_time?: string | null;
      venue?: {
        id?: string | null;
        hero_image_url?: string | null; hero_video_url?: string | null; venue_logo_url?: string | null;
        prize_information?: string | null; website?: string | null;
        social_links?: Record<string, string> | null;
        default_host_name?: string | null; host_photo_url?: string | null;
        default_quiz_day?: number | null; default_start_time?: string | null;
      } | null;
    } | null;
    const snapshotVenue = snapshot?.venue;
    setVenueHeroImageUrl(snapshotVenue?.hero_image_url || null);
    setVenueHeroVideoUrl(snapshotVenue?.hero_video_url || null);
    setVenueLogoUrl(snapshotVenue?.venue_logo_url || null);
    setVenueRecordId((data.venue_record_id as string) || snapshotVenue?.id || null);
    setVenuePrizeInfo(snapshotVenue?.prize_information || null);
    setVenueHostName(snapshotVenue?.default_host_name || null);
    setVenueHostPhotoUrl(snapshotVenue?.host_photo_url || null);
    setVenueSocialLinks(snapshotVenue?.social_links || {});
    // Prefer the actual booked date/time for this event; fall back to the
    // venue's usual recurring slot if this session wasn't created from a
    // Calendar event (e.g. a quick ad-hoc "go live").
    const scheduleDay = snapshot?.event_date ? new Date(snapshot.event_date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long" })
      : snapshotVenue?.default_quiz_day != null ? ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][snapshotVenue.default_quiz_day]
      : null;
    const scheduleTime = (snapshot?.start_time || snapshotVenue?.default_start_time || "").slice(0, 5) || null;
    setVenueScheduleText(scheduleDay && scheduleTime ? `${scheduleDay}s at ${scheduleTime}` : scheduleDay || scheduleTime);
    setHideLeaderboard(!!data.hide_leaderboard);
    setDisplayLeaderboard(displayLeaderboardVisible(data));
    setAllowPowerCards(data.allow_power_cards !== false);
    const hotSeat = readHotSeatState(data);
    setHotSeatStatus(hotSeat.status);
    setHotSeatTeam(hotSeat.team);
    setHotSeatLockedTeams(hotSeat.lockedTeams);
    const previousHotSeatStatus = prevHotSeatStatusRef.current;
    const previousHotSeatPhase = prevHotSeatPhaseRef.current;
    if (newPhase === "hot_seat" && hotSeat.status === "open" && (previousHotSeatStatus === "claimed" || previousHotSeatStatus === "submitted")) {
      // A claimed team returning to an open buzzer means its answer was wrong
      // or its clock expired. One deliberate failure cue replaces dead air.
      playSound("sad-trombone.mp3", 0.75);
    } else if (newPhase === "answer" && previousHotSeatPhase === "hot_seat" && hotSeat.team) {
      // The host only enters answer reveal directly from Hot Seat when the
      // seated team is correct (or every team has been exhausted). A retained
      // team identifies the successful path; the normal celebration phase will
      // then play that team's configured victory song as before.
      playSound("crowd-cheer.mp3", 0.65);
    }
    prevHotSeatStatusRef.current = hotSeat.status;
    prevHotSeatPhaseRef.current = newPhase;
    // Reveal used to play EVERY correct team's own theme song in turn, one
    // after another - the host has confirmed that's not what's wanted: only
    // the single fastest-correct team's theme should ever play, which the
    // celebration phase below already handles via fastestSong. This block is
    // now a no-op (kept only to still clear any leftover timeouts from an
    // older session/build) so no team's music plays during the reveal itself.
    const revealCorrectTeams: string[] = [];
    const revealKey = newPhase === "answer" ? `${data.current_question_index}` : null;
    if (
      newPhase === "answer" &&
      hotSeat.status !== "claimed" && hotSeat.status !== "submitted" &&
      revealCorrectTeams.length > 0 &&
      revealSongsPlayedForRef.current !== revealKey
    ) {
      revealSongsPlayedForRef.current = revealKey;
      revealSongsTimeoutsRef.current.forEach(clearTimeout);
      revealSongsTimeoutsRef.current = [];
      const SONG_SLOT_MS = 2600;
      revealCorrectTeams.forEach((teamName, i) => {
        const song = teamsRef.current.find(t => t.team_name === teamName)?.victory_song;
        if (!song) return;
        const t = setTimeout(() => {
          playShowAudio(victorySongAudioFile(song), { channel: "music", volume: 0.7 });
        }, i * SONG_SLOT_MS);
        revealSongsTimeoutsRef.current.push(t);
      });
    } else if (newPhase !== "answer" && revealSongsPlayedForRef.current !== null) {
      // Leaving the "answer" reveal (e.g. the host clicks straight through to
      // celebration) does NOT mean every team's reveal song has actually
      // played yet - they're deliberately staggered SONG_SLOT_MS apart so
      // several correct teams' songs don't all start at once. A still-pending
      // stagger timeout was previously left to fire on its own schedule
      // regardless of what phase the show had since moved into, so a team's
      // reveal song could suddenly start playing during celebration, or even
      // over the NEXT question - "team music playing at the wrong times".
      // Cancelling every outstanding timeout here guarantees reveal songs
      // only ever play during their own reveal.
      revealSongsTimeoutsRef.current.forEach(clearTimeout);
      revealSongsTimeoutsRef.current = [];
      revealSongsPlayedForRef.current = null;
    }
    if (newPhase === "hot_seat" && hotSeat.status === "claimed" && hotSeat.answerStartedAt) {
      const elapsed = Math.floor((Date.now() - new Date(hotSeat.answerStartedAt).getTime()) / 1000);
      startCountdown(Math.max(0, hotSeat.answerDuration - elapsed));
    } else if (newPhase === "hot_seat" && hotSeat.status === "open") {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(null);
    }
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
    setHardDeckStealWinners((data.hard_deck_steal_winners as string[]) || []);
    {
      const newHDStatus = (data.hard_deck_status as string) || "idle";
      const newHDPotential = (data.hard_deck_potential as number) || 0;
      const newHDTeam = (data.hard_deck_team as string) || null;
      if (newHDStatus !== prevHardDeckStatusRef.current) {
        if (newHDStatus === "decision") {
          // A correct higher/lower guess survived and the pot grew - every
          // other correct-answer moment in the show (question reveal,
          // Pursuit) gets an audible cheer, but Hard Deck was completely
          // silent between the win/lose sounds, which read as dead air
          // through most of the round.
          playSound("correct-chime.mp3", 0.55);
          if (hdCelebrationTimerRef.current) clearTimeout(hdCelebrationTimerRef.current);
          setHdCelebration({ type: "correct", amount: newHDPotential, key: Date.now() });
          hdCelebrationTimerRef.current = setTimeout(() => setHdCelebration(null), 2200);
        } else if (newHDStatus === "won") {
          // Previously only the max-pot win (>=40) got any sound at all
          // (an airhorn) - every other win, and EVERY win regardless of pot
          // size, played no music at all even though every team has a
          // configured victory song used everywhere else in the show on a
          // correct/winning moment. Play it here the same way, then the
          // airhorn as a brief accent on top for the top payout specifically.
          const wonTeam = teamsRef.current.find(t => t.team_name === newHDTeam);
          if (wonTeam?.victory_song) {
            stopShowAudio("music");
            playShowAudio(victorySongAudioFile(wonTeam.victory_song), { channel: "music", volume: 0.85 });
          }
          if (newHDPotential >= 40) {
            playSound("airhorn.mp3", 1.0);
          } else {
            playSound("crowd-cheer.mp3", 0.6);
          }
          if (hdCelebrationTimerRef.current) clearTimeout(hdCelebrationTimerRef.current);
          setHdCelebration({ type: "won", amount: newHDPotential, key: Date.now() });
          hdCelebrationTimerRef.current = setTimeout(() => setHdCelebration(null), 2600);
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
        if (p.status === "reveal") { playSound("correct-chime.mp3", 0.5); }
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
          // A sad trombone here made no sense - the "did any team finish" check
          // it relied on (race entry status "completed"/"eliminated") is dead
          // in the current model, where every team plays all 7 questions and
          // status always stays "active", so it fired on every single finish.
          // Instead: a lone winner (highest correct count, ties excluded) gets
          // their own configured victory song and their name on the board via
          // PursuitBoard's footer; a tie between two or more teams gets a
          // shared celebration - airhorn plus crowd cheer - since there's no
          // single team to spotlight.
          const names = teams.map(t => t.team_name);
          const highestStage = names.length ? Math.max(0, ...names.map(n => newRace[n]?.stage ?? 0)) : 0;
          const winners = highestStage > 0 ? names.filter(n => (newRace[n]?.stage ?? 0) === highestStage) : [];
          if (winners.length === 1) {
            const song = teamsRef.current.find(t => t.team_name === winners[0])?.victory_song;
            playSound("airhorn.mp3", 0.5);
            stopShowAudio("music");
            if (song) playShowAudio(victorySongAudioFile(song), { channel: "music", volume: 0.9 });
          } else {
            playSound("airhorn.mp3", 0.5);
            playSound("crowd-cheer.mp3", 0.7);
          }
        }
        prevPursuitStatusRef.current = p.status;
      }
      prevPursuitRaceRef.current = newRace;
    }
    setIntermissionOffers((data.intermission_offers as string) || "");
    setIntermissionWhatsapp((data.intermission_whatsapp as string) || "");
    setIntermissionOtherQuizzes((data.intermission_other_quizzes as string) || "");
    setIntermissionVenuePhotos((data.intermission_photos as string[]) || []);
    setSpinTargetIdx((data.spin_target_idx as number) ?? null);
    setSpinNonce((data.spin_nonce as number) ?? null);

    if (displayLeaderboardVisible(data)) {
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
        playShowAudio(victorySongAudioFile(fs), { channel: "music", volume: 0.8 });
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
    if (newPhase !== "hot_seat" && data.timer_started_at && data.timer_duration) {
      const started = new Date(data.timer_started_at as string).getTime();
      const duration = data.timer_duration as number;
      timerTotalRef.current = duration;
      const elapsed = Math.floor((Date.now() - started) / 1000);
      const remaining = Math.max(0, duration - elapsed);
      startCountdown(remaining);
    } else if (newPhase === "pursuit" && !data.timer_started_at) {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(null);
      stopShowAudio("timer");
    }
    // Only acknowledge snapshots which reached the end of the apply path.
    setAcknowledgedSnapshot(displaySnapshot(data));
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
    // The PIN button is the display's direct user gesture. Unlock every audio
    // channel here so later realtime cues and music clips may autoplay.
    void enableShowAudio().catch(() => {});
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
      // A team's photo is usually approved by the host well AFTER they've
      // joined (mid-quiz, from the Photo approval queue) - the local `teams`
      // cache above was only ever appended to on INSERT, so that later
      // photo_approved flip never reached the Display. The winner reveal's
      // photo gate (below) reads straight from this cache, so an approved
      // photo would never show for whoever answered fastest until the whole
      // page reconnected. Merging UPDATE events keeps every team row current.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "teams", filter: "session_pin=eq." + pinInput }, (payload) => {
        const updated = payload.new as { team_name: string };
        setTeams(prev => prev.map(t => t.team_name === updated.team_name ? { ...t, ...updated } : t));
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
    channel.subscribe(status => {
      if (status === "SUBSCRIBED") { hasSubscribedOnceRef.current = true; setRealtimeDown(false); }
      else if (hasSubscribedOnceRef.current && (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")) setRealtimeDown(true);
    });
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
      let q = supabase.from("answers")
        .select("team_name")
        .eq("session_pin", sessionPin)
        .eq("question_index", questionIndex)
        .or(`round_number.eq.${roundNumber},round_number.is.null`);
      // Scope to the current round only - see roundStartedAt above.
      if (roundStartedAt) q = q.gte("submitted_at", roundStartedAt);
      const { data } = await q;
      if (!active || !data) return;
      setLockedTeams([...new Set(data.map(row => row.team_name).filter(Boolean))]);
    };
    load();
    const id = window.setInterval(load, PLATFORM_CONFIG.polling.displayScoreboardMilliseconds);
    return () => { active = false; window.clearInterval(id); };
  }, [connected, sessionPin, phase, questionIndex, roundStartedAt, roundNumber]);

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
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "teams", filter: "session_pin=eq." + pinFromUrl }, (payload) => {
            const updated = payload.new as { team_name: string };
            setTeams(prev => prev.map(t => t.team_name === updated.team_name ? { ...t, ...updated } : t));
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
        channel.subscribe(status => {
          if (status === "SUBSCRIBED") { hasSubscribedOnceRef.current = true; setRealtimeDown(false); }
          else if (hasSubscribedOnceRef.current && (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")) setRealtimeDown(true);
        });
        });
      };
      tryAutoConnect(0);
    }
  }, [searchParams]);
  // The phases below each `return` their own JSX tree independently, so a
  // banner living inside any single one of them wouldn't show on the others.
  // Managed imperatively instead - appended straight to <body> - so a drop
  // shows on top of whichever phase happens to be live, without threading a
  // prop through every branch.
  useEffect(() => {
    if (typeof document === "undefined") return;
    let el = document.getElementById("qi-display-reconnect-banner");
    if (!connected || !realtimeDown) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.id = "qi-display-reconnect-banner";
      el.className = "qi-display-reconnect-banner";
      el.setAttribute("role", "status");
      el.textContent = "Reconnecting…";
      document.body.appendChild(el);
    }
    return () => { el?.remove(); };
  }, [connected, realtimeDown]);

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
  if (!displayLeaderboard && phase === "hard_deck") {
    const rankLabels: Record<number,string> = { 1:"A", 11:"J", 12:"Q", 13:"K" };
    const rankLabel = (r: number) => rankLabels[r] || String(r);
    // Matches HardDeckPanel's actual CARD_POINTS (flat 10 per correct card,
    // cumulative) - this used to be an escalating ladder [10,25,50,100],
    // replaced per the host's request for a flat 10/card payout.
    const LADDER = [10, 20, 30, 40];
    const nextRung = LADDER.find(v => v > hardDeckPotential) ?? LADDER[LADDER.length - 1];
    const inProgress = hardDeckStatus !== "idle" && hardDeckStatus !== "won" && hardDeckStatus !== "lost" && hardDeckStatus !== "wheel";
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
              {/* All revealed cards stay on screen so the room can see the
                  full progression through the round, not just whichever card
                  just flipped - the previous version replaced the single
                  visible card every reveal, losing that story. */}
              <div className="hd-cards-row">
                {hardDeckCards.map((c, i) => {
                  const red = c.suit === "♥" || c.suit === "♦";
                  return (
                    <div key={i} className={"bigcard" + (red ? " red" : "")}>
                      <div className="cv">{rankLabel(c.rank)}</div>
                      <div className="cs">{c.suit}</div>
                      <div className="cvb">{rankLabel(c.rank)}{c.suit}</div>
                    </div>
                  );
                })}
                {inProgress && (
                  <div className="bigcard back"><div className="q">?</div></div>
                )}
              </div>
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
                {hardDeckStatus === "lost" && <div style={{ textAlign:"center" }}><div style={{ font: "800 clamp(16px,2.4vw,30px) Inter", color: "var(--red)", letterSpacing: "0.14em" }}>BUST</div>{hardDeckStealWinners.length > 0 && <div style={{ marginTop:8, font:"800 clamp(13px,1.5vw,20px) Inter", color:"var(--green)" }}>STEAL · {hardDeckStealWinners.join(" · ")}</div>}</div>}
              </div>
              {hdCelebration && (
                <div key={hdCelebration.key} className={"hd-celebrate " + hdCelebration.type}>
                  {hdCelebration.type === "correct" ? "DOUBLED! →" : "+"}
                  <span className="hd-celebrate-amount">{hdCelebration.amount}</span>
                  {hdCelebration.type === "correct" ? "" : " POINTS"}
                </div>
              )}
              {hardDeckTeam && (
                <div className="hd-crowd">
                  <b>{hardDeckTeam.toUpperCase()}</b>{
                    hardDeckStatus === "decision" ? " — STICK OR GAMBLE?"
                    : hardDeckStatus === "awaiting_guess" ? " — HIGHER OR LOWER? · EVERYONE ELSE: PLAY FOR A STEAL"
                    : hardDeckStatus === "won" ? " BANKED IT"
                    : hardDeckStatus === "lost" ? " WENT BUST"
                    : ""}
                </div>
              )}
            </>
          )}
        </div>
        <QuizItBadge />
      </div>
    );
  }

  // THE PURSUIT — the race board is the hero (prototype v1.0). All race/scoring
  // logic stays in the state machine; the board is pure presentation.
  if (!displayLeaderboard && phase === "pursuit") {
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

  if (!displayLeaderboard && (phase === "waiting" || phase === "round_start" || phase === "round_end")) {
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
      <div className="fbl fbl-stage qi-display-stage qi-display-lobby">
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
            <div className={"lb-count" + (countPulsing ? " lb-count-pulse" : "")}><b>{teams.length} TEAM{teams.length === 1 ? "" : "S"}</b> IN THE ROOM</div>
            <div className="lb-crests">
              {teams.map((t) => (
                <div key={t.team_name} className={"lb-team" + (flaringTeams.has(t.team_name) ? " new" : "")}>
                  <div className="crest">{teamInitials(t.team_name)}</div>
                  <span>{t.team_name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="lb-cardstage lb-reel">
            <div className="lb-reel-title">{venueName ? `TONIGHT AT ${venueName.toUpperCase()}` : "TONIGHT'S SHOW"}</div>

            {currentReelScene === "venue" && (
              <div className="lb-reel-scene lb-reel-venue">
                {/* This animated title-card (logo pop, name sweep, tagline
                    fade) always plays, whether or not a Hero Video/Image has
                    been uploaded - it's the actual "animation at the
                    beginning" a Hero Video/Image was never a substitute for.
                    With media uploaded, it overlays the bottom of the frame
                    over a gradient scrim so both are visible together;
                    without media, it fills the frame over an animated
                    branded glow background instead of a blank prompt. */}
                {venueHeroVideoUrl && !venueHeroVideoFailed ? (
                  <video key={venueHeroVideoUrl} className="lb-reel-media" src={getMediaUrl(venueHeroVideoUrl) || undefined} autoPlay muted loop playsInline onError={() => setVenueHeroVideoFailed(true)} onLoadedData={() => setVenueHeroVideoFailed(false)} />
                ) : venueHeroImageUrl ? (
                  <img className="lb-reel-media" src={getMediaUrl(venueHeroImageUrl) || undefined} alt={venueName || "Venue"} />
                ) : (
                  <div className="lb-venue-intro-bg" />
                )}
                <div className={"lb-venue-intro" + ((venueHeroVideoUrl && !venueHeroVideoFailed) || venueHeroImageUrl ? " has-media" : "")}>
                  {venueLogoUrl && <img className="lb-venue-intro-logo" src={getMediaUrl(venueLogoUrl) || undefined} alt="" />}
                  <div className="lb-venue-intro-copy">
                    <div className="lb-venue-intro-name">{venueName || "TONIGHT'S QUIZ"}</div>
                    {venueScheduleText && <div className="lb-venue-intro-time">QUIZ NIGHT · {venueScheduleText}</div>}
                    {/* Matches the brand tagline used everywhere else in the
                        app ("Quiz-It · Powered by Mac Entertainment · by
                        Sonya Mac") - this card had drifted to a bare
                        "Powered by Quiz-It", the one place the brand line
                        was inverted. */}
                    <div className="lb-venue-intro-tagline">Quiz-It · Powered by Mac Entertainment · by Sonya Mac</div>
                  </div>
                  {/* venueHostName comes straight from the venue's admin
                      profile field (default_host_name) - nothing stops
                      someone typing their own login email in there, and it
                      would then get read out loud on a public venue TV
                      screen. No individual host's personal contact detail
                      should ever be displayed; everything is attributed to
                      Mac Entertainment instead. Anything containing "@" is
                      treated as unset rather than rendered. */}
                  {(() => {
                    const safeHostName = venueHostName && !venueHostName.includes("@") ? venueHostName : null;
                    if (!venueHostPhotoUrl && !safeHostName) return null;
                    return (
                      <div className="lb-venue-intro-host">
                        {venueHostPhotoUrl && <img src={getMediaUrl(venueHostPhotoUrl) || undefined} alt={safeHostName || "Quiz host"} />}
                        <div><small>YOUR HOST</small><strong>{safeHostName || "Mac Entertainment"}</strong></div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {currentReelScene === "offers" && intermissionOffers.trim() && (
              <div className="lb-reel-scene lb-reel-brand lb-reel-brand-offers">
                <div className="lb-reel-brand-panel">
                  {venueLogoUrl && <img className="lb-reel-brand-logo" src={getMediaUrl(venueLogoUrl) || undefined} alt="" />}
                  <div className="lb-cardkicker">TONIGHT AT {venueName?.toUpperCase() || "THE VENUE"}</div>
                  <div className="lb-reel-brand-body">{intermissionOffers}</div>
                </div>
              </div>
            )}

            {currentReelScene === "prizes" && (
              <div className="lb-reel-scene lb-reel-brand lb-reel-brand-prizes">
                <div className="lb-reel-brand-panel">
                  <div className="lb-cardkicker">TONIGHT&rsquo;S PRIZES</div>
                  <div className="lb-reel-brand-body">{venuePrizeInfo}</div>
                </div>
              </div>
            )}

            {currentReelScene === "social" && (
              <div className="lb-reel-scene lb-reel-brand lb-reel-brand-social">
                <div className="lb-reel-brand-panel">
                  {venueLogoUrl && <img className="lb-reel-brand-logo" src={getMediaUrl(venueLogoUrl) || undefined} alt="" />}
                  <div className="lb-cardkicker">FOLLOW THE VENUE</div>
                  <FitText className="lb-reel-brand-headline"><InstagramGlyph />{venueInstagramTag}</FitText>
                </div>
              </div>
            )}

            {currentReelScene === "tag-us" && (
              <div className="lb-reel-scene lb-reel-brand lb-reel-brand-social">
                <div className="lb-reel-brand-panel">
                  <div className="lb-cardkicker">SHARE THE NIGHT</div>
                  <FitText className="lb-reel-brand-headline"><InstagramGlyph />@macentertainmentuae</FitText>
                  <div className="lb-reel-brand-body">Tag us in your posts and stories!</div>
                </div>
              </div>
            )}

            {currentReelScene === "cards" && (
              <div className="lb-reel-scene">
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
            )}

            {currentReelScene === "photos" && approvedCustomerPhotos.length > 0 && (
              <div className="lb-reel-scene lb-reel-photos">
                {[0, 1, 2].map(slot => {
                  const photo = approvedCustomerPhotos[(floatingPhotoIdx + slot) % approvedCustomerPhotos.length];
                  if (!photo) return null;
                  return (
                    <div key={slot} className={`lb-float-photo lb-float-photo-${slot}`} style={{ animationDelay: `${slot * 1.3}s` }}>
                      <img src={photo} alt="Team photo" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="lb-foot">
            <div className="lb-start">SHOW STARTS SOON</div>
          </div>
        </div>
        <QuizItBadge />
      </div>
    );
  }

  // INTERMISSION
  if (!displayLeaderboard && phase === "intermission") {
    // venueOfferPhotos (the "Generic offers"/venue-offer rotation) is meant
    // for player handsets specifically, per the host - the Display's own
    // gallery uses intermissionVenuePhotos (the venue's own Display
    // Slides/Adverts, curated for the TV) plus approved customer photos.
    const galleryPhotos = [...intermissionVenuePhotos, ...approvedCustomerPhotos];
    const hasContent = intermissionOffers || intermissionWhatsapp || intermissionOtherQuizzes || galleryPhotos.length > 0;
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
        <div className="qi-display-intermission-title">{venueName ? venueName.toUpperCase() : "INTERMISSION"}</div>
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
        <IntermissionGallery photos={galleryPhotos} />
      </div>
    );
  }
  // SPIN TO WIN — approved Fable "summons frame": Bruno title + purple flood,
  // the earning honoured. The machine itself (SlotReels) is unchanged — same
  // props, nonce, scoring, audio and sync. Presentation-only wrapper.
  if (!displayLeaderboard && phase === "spin_to_win") {
    return (
      <div className="fbl fbl-stage qi-display-stage qi-display-spin">
        <PowerCardOverlays currentAnnounce={currentAnnounce} announceVisible={announceVisible} roundCardPlays={roundCardPlays} roundNumber={roundNumber} />
        <div className="qi-display-spin-heading">
          <div className="qi-display-spin-title">
            <span style={{ color:"#BE26C1" }}>SPIN</span> TO WIN
          </div>
          {fastestTeam && (
            <div key={"spin-winner-" + fastestTeam} className="qi-display-spin-winner-wrap">
              <div className="qi-display-spin-sparkle" />
              <div className="qi-display-eyebrow qi-display-fastest-eyebrow">{question?.question_type === "nearest_wins" ? "CLOSEST GUESS" : "FASTEST CORRECT ANSWER"}</div>
              <div className="qi-display-spin-winner qi-display-spin-winner-name">{fastestTeam.toUpperCase()}</div>
            </div>
          )}
        </div>
        <div className="qi-display-spin-machine">
          <SlotReels targetIdx={spinTargetIdx} spinNonce={spinNonce} teamName={fastestTeam || "Team"} victorySong={fastestSong || undefined} size="full" audioEnabled={true} />
        </div>
        <QuizItBadge />
      </div>
    );
  }
  // SCOREBOARD
  if (displayLeaderboard || phase === "scoreboard") {
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
        <QuizItBadge />
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
      const winnerTeamRow = winner ? teams.find(t => t.team_name === winner.team_name) : null;
      const winnerPhoto = winnerTeamRow?.photo_approved ? getMediaUrl(winnerTeamRow.photo_url) : null;
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
            <div className="wc-crest crest">
              {winnerPhoto ? <img src={winnerPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : (winner ? teamInitials(winner.team_name) : "?")}
              <div className="wc-crown">👑</div>
            </div>
            <div className="wc-name">{(winner?.team_name || "").toUpperCase()}</div>
            <div className="wc-champ">CHAMPIONS</div>
            <div className="wc-meta tnum">{(winner?.total_points ?? 0).toLocaleString()} POINTS</div>
            <div className="wc-photo">📸 GET UP HERE — YOUR PHOTO&rsquo;S WAITING</div>
          </div>
          <QuizItBadge />
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
        {/* One-off flash burst, keyed to fastestTeam so it re-fires every
            time a new round's celebration mounts, not just the first. */}
        {fastestTeam && <div key={"flash-" + fastestTeam} className="qi-display-celebration-flash" />}
        {fastestTeam ? (
          <div className="qi-display-celebration-content">
            <div className="qi-display-eyebrow qi-display-fastest-eyebrow">{question?.question_type === "nearest_wins" ? "CLOSEST GUESS" : "FASTEST CORRECT ANSWER"}</div>
            <div className="qi-display-fastest-team">
              {fastestTeam}
            </div>
            {/* Never shown until a host has approved this team's photo - see
                the 202607230002_photo_approval migration. */}
            {showWinnerPhoto && winnerTeam?.photo_url && winnerTeam?.photo_approved && (
              <div className="qi-display-fastest-photo">
                <div className="qi-display-fastest-shockwave" />
                <img src={winnerTeam.photo_url} alt={fastestTeam} />
              </div>
            )}
          </div>
        ) : (
          <div className="qi-display-no-winner">{question?.question_type === "multi_tap" ? "Nobody got all answers correct." : "No correct answers for this question"}</div>
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
    const isMultiTap = question.question_type === "multi_tap";
    const isSequence = question.question_type === "sequence";
    // Multi Tap's correct_answer is a comma-separated list of option letters
    // (e.g. "c,d,e") - same raw format multiple_choice uses for one letter -
    // so it needs the same letter-to-text mapping, just for several letters
    // joined together, instead of showing the bare letters on screen.
    const multiTapAllOptions = [{ key:"a", text:question.option_a },{ key:"b", text:question.option_b },{ key:"c", text:question.option_c },{ key:"d", text:question.option_d },{ key:"e", text:(question as unknown as { option_e?: string | null }).option_e },{ key:"f", text:(question as unknown as { option_f?: string | null }).option_f }];
    const correctText = isMulti
      ? (options.find(o => o.key.toLowerCase()===question.correct_answer.toLowerCase())?.text || question.correct_answer)
      : isMultiTap
      ? question.correct_answer.split(",").map(k => k.trim().toLowerCase()).map(k => multiTapAllOptions.find(o => o.key===k)?.text || k).filter(Boolean).join(", ")
      // Sequence's correct_answer is a comma-separated list of option LETTERS
      // ("a,b,c,d"), same as multi_tap - it needs the same letter-to-text
      // mapping, in order, joined together, instead of showing the bare
      // letters on the display screen.
      : isSequence
      ? question.correct_answer.split(",").map(k => k.trim().toLowerCase()).map(k => multiTapAllOptions.find(o => o.key===k)?.text || k).filter(Boolean).join(", ")
      : question.correct_answer;
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

  if (phase === "hot_seat" && question) {
    const eligibleTeams = Math.max(0, teams.length - hotSeatLockedTeams.length);
    return (
      <div className="qi-display-hot-seat" aria-live="polite">
        <div className="qi-display-hot-seat__meta">HOT SEAT · QUESTION {questionIndex + 1}</div>
        <h1>{question.question_text.replace(/^Play this track:\s*/i, "").replace(/^Show teams this image:\s*/i, "")}</h1>
        {hotSeatStatus === "open" ? (
          <div className="qi-display-hot-seat__call">
            <span>BUZZERS OPEN</span>
            <strong>WHO KNOWS IT?</strong>
            <small>{eligibleTeams} team{eligibleTeams === 1 ? "" : "s"} eligible</small>
          </div>
        ) : hotSeatTeam ? (
          <div className="qi-display-hot-seat__claim">
            <span>{hotSeatTeam}</span>
            <strong>TAKES THE HOT SEAT</strong>
            {hotSeatStatus === "submitted" ? <small>ANSWER LOCKED IN</small> : <div className="qi-display-hot-seat__timer">{timeLeft ?? HOT_SEAT_ANSWER_SECONDS}</div>}
          </div>
        ) : (
          <div className="qi-display-hot-seat__call"><strong>NO TEAMS REMAINING</strong><small>Eyes on the host</small></div>
        )}
        <QuizItBadge />
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
      const pTLeft = timeLeft ?? 0;
      return (
        <div className="qi-display-picture-question">
      <PowerCardOverlays currentAnnounce={currentAnnounce} announceVisible={announceVisible} roundCardPlays={roundCardPlays} roundNumber={roundNumber} />
          {/* Same final-5s red vignette + threshold every other question type
              uses (see qd-urgent below) - a Picture question previously had its
              own quieter timer chip (urgent only inside the last 3s, no glow),
              so a round mixing question types looked inconsistent depending on
              which question happened to be showing. */}
          <div className="qd-urgent" style={{ boxShadow: pTLeft > 0 && pTLeft <= 5
            ? `inset 0 0 ${110 + (6 - pTLeft) * 34}px ${18 + (6 - pTLeft) * 14}px rgba(255,59,78,${(0.12 + (6 - pTLeft) * 0.11).toFixed(3)})`
            : "none" }} />
          <div className="qi-display-picture-header">
            <div className="qi-display-question-number">QUESTION {questionIndex+1}</div>
            <div className="qi-display-picture-chip">PICTURE ROUND</div>
            <div style={{ flex:1 }} />
            {timeLeft !== null && timeLeft > 0 && (
              <div className={"qi-display-picture-timer" + (timeLeft<=5 ? " is-urgent" : "")}>{timeLeft}</div>
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
            <div style={{ margin: "2% 6%" }}><LiveAudioPlayer key={`${questionIndex}-${question.option_b || "audio"}`} question={question} /></div>
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
        <QuizItBadge />
      </div>
    );
  }

  // No phase/scene matched above - rather than showing a dead black screen to
  // the whole room (e.g. a brief window where the session updates before
  // current_question is populated), show a neutral branded holding screen so
  // it always reads as "still working" rather than "broken/frozen".
  return (
    <div className="fbl fbl-stage qi-display-stage" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", fontSize: "clamp(22px,4vw,34px)", letterSpacing: ".1em", color: "rgba(255,255,255,0.6)" }}>ONE MOMENT...</div>
      </div>
      <QuizItBadge />
    </div>
  );
}

// Persistent top-left corner mark, fixed on top of every phase regardless
// of which internal return branch renders - matches the same logo +
// wordmark used in the header on the host website (components/
// quiz-it-header.tsx). This is a DIFFERENT corner from QuizItBadge (which
// every phase renders individually, bottom-right), so it can't reintroduce
// the old duplicate-badge overlap that was previously removed from here.
function DisplayCornerMark() {
  return (
    // Stacked - logo on top, wordmark/producer/attribution centered
    // underneath - matching the host console header's layout exactly. This
    // was previously a side-by-side row (logo left, text block right,
    // left-aligned), a different arrangement from the host console's
    // stacked-and-centered one, so the "same" brand mark still looked like
    // two different layouts depending which screen you were on.
    <div className="qi-display-corner-mark">
      <Image src="/me-logo.jpg" alt="Mac Entertainment" width={58} height={58} className="qi-display-corner-mark__logo" />
      <BrandLockup compact />
      <div className="qi-display-corner-mark__by">by Sonya Mac</div>
    </div>
  );
}

export default function DisplayScreen() {
  return (
    <Suspense fallback={<div style={{ minHeight:"100vh", background:"#0d0225" }} />}>
      <div className="qi-display-shell">
        <DisplayScreenInner />
        <DisplayCornerMark />
        <DisplayFullscreenControl />
        <DisplayWakeControl />
      </div>
    </Suspense>
  );
}
