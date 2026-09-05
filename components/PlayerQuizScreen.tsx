'use client';
import React, { useEffect, useState, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMediaUrl } from "@/lib/getMediaUrl";
import { fetchActiveVenueOffers } from "@/lib/venueOffers";
import { UnoPlayerCards } from "@/components/UnoCards";
import { AnswerKeypad } from "@/components/AnswerKeypad";
import { SlotReels } from "@/components/SlotReels";
import { SpinWheel, buildTeamSegments } from "@/components/SpinWheel";
import { PursuitPhase, PursuitRace, readPursuitState, readRace, readQIndex, pursuitTotalPoints, PURSUIT_TOTAL_QUESTIONS } from "@/lib/quiz/pursuit";
import { Crest } from "@/components/fable/HandsetStates";
import { teamInitials } from "@/components/TeamBadge";
import { PlayerShell, PlayerStatusBar, PlayerResultBanner } from "@/components/player/PlayerUI";
import { TeamPhotoUpload } from "@/components/player/TeamPhotoUpload";
import { PLATFORM_CONFIG } from "@/lib/platform/config";
import { platformLogger } from "@/lib/platform/logger";
import { HOT_SEAT_ANSWER_SECONDS, readHotSeatState, type HotSeatStatus } from "@/lib/quiz/hotSeat";
import { isAnswerCorrect } from "@/lib/quiz/answerScoring";

type Question = {
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  option_e: string | null;
  option_f: string | null;
  correct_answer: string;
};

type Phase = "waiting" | "question" | "hot_seat" | "answer" | "celebration" | "hard_deck" | "intermission" | "spin_to_win" | "quiz_end" | "pursuit";
type UpcomingQuiz = { venue_name: string; event_date: string; start_time: string };

function formatUpcomingDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
}
function formatUpcomingTime(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit" }).format(date);
}

// Auto-built from the host's own Calendar (see app/host/session/page.tsx
// snapshotting sessions.upcoming_quizzes at session creation) - no extra
// upload work for the host, per the "auto-generated" requirement. Cycles
// one card at a time rather than a static list, since this is meant to read
// as a graphic moment during the break, not a text listing.
function UpcomingQuizzesCard({ quizzes }: { quizzes: UpcomingQuiz[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (quizzes.length < 2) return;
    const id = window.setInterval(() => setIndex(current => (current + 1) % quizzes.length), 4500);
    return () => window.clearInterval(id);
  }, [quizzes.length]);
  if (quizzes.length === 0) return null;
  const quiz = quizzes[index % quizzes.length];
  return (
    <div style={{ padding: "16px 18px", borderRadius: 14, background: "rgba(190,38,193,0.1)", border: "1.5px solid rgba(190,38,193,0.4)", width: "100%", maxWidth: 340, textAlign: "center" as const }}>
      <div style={{ fontSize: 11, color: "#D94FDC", letterSpacing: 2, marginBottom: 8 }}>COMING UP</div>
      <div style={{ fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", fontSize: 20, color: "#fff", letterSpacing: 1, marginBottom: 4 }}>{quiz.venue_name}</div>
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}>{formatUpcomingDate(quiz.event_date)} · {formatUpcomingTime(quiz.start_time)}</div>
    </div>
  );
}

interface Props {
  teamName: string;
  sessionPin: string;
}

function SequenceQuestion({ options, onSubmit, submitted }: { options: string[]; onSubmit: (ans: string) => void; submitted: boolean }) {
  const [picked, setPicked] = useState<number[]>([]);
  const purple = "#BE26C1";
  const font = "'Inter', sans-serif";
  if (submitted) return null;

  function tapItem(i: number) {
    if (picked.includes(i)) return;
    setPicked(prev => [...prev, i]);
  }
  function resetPicks() { setPicked([]); }
  function submitOrder() {
    const ordered = picked.map(i => options[i]);
    onSubmit(ordered.join(", "));
  }
  const allPicked = picked.length === options.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 4 }}>TAP IN THE CORRECT ORDER</div>
      {options.map((item, i) => {
        const pickedIndex = picked.indexOf(i);
        const isPicked = pickedIndex !== -1;
        return (
          <button key={i} type="button" onClick={() => tapItem(i)} disabled={isPicked}
            style={{
              display: "flex", alignItems: "center", gap: 14, minHeight: 58, padding: "12px 16px", borderRadius: 14,
              background: isPicked ? "rgba(190,38,193,0.22)" : "#1D1140",
              border: "1px solid " + (isPicked ? "#D94FDC" : "#3A2668"),
              boxShadow: isPicked ? "0 0 14px rgba(217,79,220,0.3)" : "none",
              textAlign: "left" as const, cursor: isPicked ? "default" : "pointer", width: "100%",
            }}>
            <span style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
              background: isPicked ? "#8A1B8D" : "#0A0118",
              border: "1px solid " + (isPicked ? "#D94FDC" : "#8A1B8D"),
              color: isPicked ? "#fff" : "#6B5A8E",
              fontWeight: 800, fontSize: 16,
            }}>
              {isPicked ? pickedIndex + 1 : ""}
            </span>
            <span style={{ flex: 1, color: "#fff", font: "700 17px 'Inter'" }}>{item}</span>
          </button>
        );
      })}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button type="button" onClick={resetPicks} disabled={picked.length === 0}
          style={{ flex: 1, minHeight: 56, borderRadius: 14, background: "#150A2E", border: "1px solid #2E1A52", color: picked.length ? "#fff" : "rgba(255,255,255,0.3)", font: "700 15px 'Inter'", cursor: picked.length ? "pointer" : "default" }}>
          RESET
        </button>
        <button type="button" onClick={submitOrder} disabled={!allPicked}
          style={{ flex: 2, minHeight: 56, borderRadius: 14, background: allPicked ? purple : "#150A2E", color: allPicked ? "#fff" : "rgba(255,255,255,0.3)", border: allPicked ? "1px solid #D94FDC" : "1px solid #2E1A52", boxShadow: allPicked ? "0 0 18px rgba(190,38,193,0.35)" : "none", font: "800 18px 'Inter'", letterSpacing: 1, cursor: allPicked ? "pointer" : "default" }}>
          LOCK IN ORDER
        </button>
      </div>
    </div>
  );
}

function PictureQuestion({ imageUrl, questionText, onSubmit, questionIndex, timeLeft, purple, font, bg, teamName, sessionPin, roundNumber, allowPowerCards, points, submitted }: {
  imageUrl: string; questionText: string; submitted: boolean; answerText: string;
  setAnswerText: (v: string) => void; onSubmit: (a: string) => void;
  questionIndex: number; timeLeft: number | null; purple: string; font: string; bg: string;
  teamName: string; sessionPin: string; roundNumber: number; allowPowerCards: boolean;
  points?: number;
}) {
  const [imageDismissed, setImageDismissed] = React.useState(false);
  const [imageFailed, setImageFailed] = React.useState(false);
  React.useEffect(() => {
    setImageDismissed(false);
    setImageFailed(false);
  }, [questionIndex, imageUrl]);

  return (
    <div className="qi-player-state qi-player-question-screen" style={{ height:"100dvh", overflow:"hidden", background:bg, display:"flex", flexDirection:"column", boxSizing:"border-box", fontFamily:font, color:"#fff" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, minHeight:44, marginBottom:8, flexShrink:0 }}>
        <div style={{ fontSize:11, color:"#B9A8D9" }}>Q{questionIndex+1} · PICTURE</div>
        {points !== undefined && <div style={{ color:purple, fontWeight:800 }}>{points} pts</div>}
        {timeLeft !== null && timeLeft > 0 && (
          <div style={{ marginLeft:"auto", flexShrink:0, width:44, height:44, borderRadius:"50%", border:"2px solid currentColor", display:"grid", placeItems:"center", fontSize:19, fontWeight:800, color:timeLeft<=3?"#ef4444":purple }}>
            {timeLeft}
          </div>
        )}
      </div>
      {/* Only the centre swaps; the same header and card footer remain mounted. */}
      <div style={{ flex:"1 1 0", minHeight:0, overflowY:"auto", display:"flex", flexDirection:"column" }}>
        {!imageDismissed ? (
          <button type="button" aria-label="Hide picture and answer" onClick={() => setImageDismissed(true)}
            style={{ flex:1, minHeight:0, width:"100%", border:0, background:"transparent", color:purple, padding:0, display:"flex", flexDirection:"column", alignItems:"center", gap:12, cursor:"pointer" }}>
            {!imageFailed ? (
              <img src={imageUrl} alt="Quiz picture" onError={() => setImageFailed(true)} style={{ flex:1, minHeight:0, width:"100%", objectFit:"contain", borderRadius:14 }} />
            ) : (
              <div style={{ flex:1, display:"grid", placeItems:"center", color:"#B9A8D9" }}>Image could not be loaded — listen for the host</div>
            )}
            <span style={{ flexShrink:0, padding:8, fontWeight:800 }}>TAP PICTURE TO ANSWER →</span>
          </button>
        ) : (
          <>
            <div className="qi-player-question-text">{questionText}</div>
            {!submitted ? <AnswerKeypad mode="text" onSubmit={onSubmit} /> : (
              <div style={{ padding:18, borderRadius:12, background:"rgba(190,38,193,0.15)", textAlign:"center" }}>
                <strong style={{ color:purple }}>Answer submitted!</strong>
                <div style={{ marginTop:6, color:"#B9A8D9" }}>Waiting for host…</div>
              </div>
            )}
          </>
        )}
      </div>
      <div style={{ flexShrink:0, paddingTop:8, paddingBottom:24 }}>
        {allowPowerCards
          ? <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} roundNumber={roundNumber} compact enabled={allowPowerCards} />
          : <div className="qi-player-cards-paused">Power Cards unavailable this round</div>}
      </div>
    </div>
  );
}

export function PlayerQuizScreen({ teamName, sessionPin }: Props) {
  // Prevent the outer document from scrolling while the gameplay screen is
  // mounted. Plain `overflow:hidden` on body is NOT reliably honoured by iOS
  // Safari (a well-documented mobile Safari limitation) - position:fixed on
  // the body is the technique that actually works cross-browser, including
  // iOS. Scoped to this component only, fully restored on unmount (including
  // scroll position), so no other screen is affected.
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width };
    body.style.position = "fixed";
    body.style.top = -scrollY + "px";
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [tappedItems, setTappedItems] = useState<string[]>([]);
  const [mySubmittedDisplay, setMySubmittedDisplay] = useState("");
  const [error, setError] = useState("");
  const [blockUntil, setBlockUntil] = useState<string | null>(null);
  const [blockTeam, setBlockTeam] = useState<string | null>(null);
  const [blockSecondsLeft, setBlockSecondsLeft] = useState(0);
  const [answerText, setAnswerText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [hotSeatStatus, setHotSeatStatus] = useState<HotSeatStatus>("idle");
  const [hotSeatTeam, setHotSeatTeam] = useState<string | null>(null);
  const [hotSeatLockedTeams, setHotSeatLockedTeams] = useState<string[]>([]);
  const [buzzing, setBuzzing] = useState(false);
  const [fastestTeamName, setFastestTeamName] = useState<string | null>(null);
  const [fastestSongName, setFastestSongName] = useState<string | null>(null);
  const [fastestPoints, setFastestPoints] = useState(0);
  const [showScoreboardOnPhone, setShowScoreboardOnPhone] = useState(false);
  const [hideLeaderboard, setHideLeaderboard] = useState(false);
  const [allowPowerCards, setAllowPowerCards] = useState(true);
  const [phoneScoreboardData, setPhoneScoreboardData] = useState<{team_name:string; total_points:number}[]>([]);
  const [activeSessionRoundId, setActiveSessionRoundId] = useState<string | null>(null);
  const [scoreVisibilityRound, setScoreVisibilityRound] = useState<{ id: string; dangerZone: boolean } | null>(null);
  useEffect(() => {
    if (!activeSessionRoundId) return;
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    const refresh = async () => {
      const { data } = await supabase.from("session_rounds")
        .select("danger_zone_enabled").eq("id", activeSessionRoundId).single();
      if (!cancelled && data) setScoreVisibilityRound({ id: activeSessionRoundId, dangerZone: !!data.danger_zone_enabled });
    };
    void refresh();
    const interval = setInterval(refresh, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeSessionRoundId]);
  const [spinTargetIdx, setSpinTargetIdx] = useState<number | null>(null);
  const [spinNonce, setSpinNonce] = useState<number | null>(null);
  const [hardDeckTeam, setHardDeckTeam] = useState<string | null>(null);
  const [hardDeckStatus, setHardDeckStatus] = useState<string>("idle");
  const [roundNumber, setRoundNumber] = useState<number>(1);
  // Hide while resolving a new round too, so Danger Zone never flashes a score.
  const hideRunningPoints = !!activeSessionRoundId &&
    (scoreVisibilityRound?.id !== activeSessionRoundId || scoreVisibilityRound.dangerZone);
  const myRunningPoints = hideRunningPoints ? undefined : (phoneScoreboardData.find(s => s.team_name === teamName)?.total_points ?? 0);
  const [roundName, setRoundName] = useState("");
  // The team's own photo (uploaded at join), shown in the status bar crest
  // instead of the initial-letter badge - but ONLY once a host has approved
  // it (teams.photo_approved). A photo can be approved any time after join,
  // so this polls rather than fetching once, the same interval as the
  // heartbeat above, instead of adding a separate realtime channel just for
  // this.
  const [teamPhotoUrl, setTeamPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function fetchPhoto() {
      const { data } = await createSupabaseBrowserClient()
        .from("teams")
        .select("photo_url, photo_approved")
        .eq("session_pin", sessionPin)
        .eq("team_name", teamName)
        .maybeSingle();
      if (cancelled) return;
      setTeamPhotoUrl(data?.photo_approved ? (data?.photo_url as string) || null : null);
    }
    fetchPhoto();
    const interval = setInterval(fetchPhoto, PLATFORM_CONFIG.polling.playerHeartbeatMilliseconds);
    return () => { cancelled = true; clearInterval(interval); };
  }, [sessionPin, teamName]);
  const [hardDeckGuess, setHardDeckGuess] = useState<string | null>(null);
  const [stickGamblePressed, setStickGamblePressed] = useState<string | null>(null);
  const [spinOffered, setSpinOffered] = useState(false);
  const [spinChoice, setSpinChoice] = useState<string|null>(null);
  const [hardDeckPotential, setHardDeckPotential] = useState(0);
  const [hardDeckCards, setHardDeckCards] = useState<{rank:number; suit:string}[]>([]);
  const [hardDeckWheelTarget, setHardDeckWheelTarget] = useState<number | null>(null);
  const [hardDeckWheelSpinning, setHardDeckWheelSpinning] = useState(false);
  // THE PURSUIT — handset mirror of pursuit_status + the current question index.
  // During the "question"/"reveal" sub-phases the handset reuses the normal
  // question / answer screens (see the render conditions below).
  const [pursuitStatus, setPursuitStatus] = useState<PursuitPhase>("idle");
  const [pursuitQIndex, setPursuitQIndex] = useState(-1);
  const [pursuitRace, setPursuitRace] = useState<PursuitRace>({});
  const [connectionLost, setConnectionLost] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string>("waiting");
  const [allTeamNames, setAllTeamNames] = useState<string[]>([]);
  const [intermissionOffers, setIntermissionOffers] = useState("");
  const [intermissionWhatsapp, setIntermissionWhatsapp] = useState("");
  const [intermissionOtherQuizzes, setIntermissionOtherQuizzes] = useState("");
  const [venueRecordId, setVenueRecordId] = useState<string | null>(null);
  // Venue Offers / Display Graphics uploaded on the Venues page - rotates on
  // the player's own handset during intermission, same images as the
  // Display screen shows. Offers change rarely (set up ahead of a show), so
  // a one-shot fetch per intermission is enough.
  const [venueOfferPhotos, setVenueOfferPhotos] = useState<string[]>([]);
  const [offerPhotoIdx, setOfferPhotoIdx] = useState(0);
  useEffect(() => {
    if (phase !== "intermission") { setVenueOfferPhotos([]); return; }
    let cancelled = false;
    fetchActiveVenueOffers(venueRecordId).then(urls => { if (!cancelled) { setVenueOfferPhotos(urls); setOfferPhotoIdx(0); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, venueRecordId]);
  useEffect(() => {
    if (venueOfferPhotos.length < 2) return;
    const id = window.setInterval(() => setOfferPhotoIdx(i => (i + 1) % venueOfferPhotos.length), 6000);
    return () => window.clearInterval(id);
  }, [venueOfferPhotos.length]);
  const [upcomingQuizzes, setUpcomingQuizzes] = useState<UpcomingQuiz[]>([]);
  const [quizEndRevealedCount, setQuizEndRevealedCount] = useState(0);
  const [quizEndTrophyVisible, setQuizEndTrophyVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastQIndexRef = useRef(-1);
  const lastQTextRef = useRef("");
  const lastPhaseRef = useRef<string>("");
  // Mirrors the display's spin handling: force this handset into the
  // spin_to_win phase as soon as a spin (spin_choice="spin" + a fresh
  // spin_nonce) is seen, independent of whether the `phase` column write was
  // delivered. Without this, a dropped realtime phase update left the handset
  // showing the question/celebration answer-feedback screen during a spin -
  // i.e. the selected contestant appearing to have "answered incorrectly"
  // when no question was in play. Handled-once per nonce so the return trip to
  // "celebration" (nonce cleared) isn't re-forced back into the spin.
  const spinNonceHandledRef = useRef<number | null>(null);
  const connectionFailuresRef = useRef(0);
  // DIAGNOSTIC ONLY (temporary): timestamp of the first failure in the current
  // run of consecutive fetchSession failures, used only for log timing.
  const firstFailureAtRef = useRef<number | null>(null);


  // Fable handset stage: violet-black (--stage-deep) with a single low bloom.
  // Applied via every branch's `background:bg`, so all handset stages share the
  // approved show language without touching layout or logic.
  const bg = "radial-gradient(ellipse 70% 40% at 50% 38%, rgba(190,38,193,0.12), transparent 70%), #0A0118";
  const purple = "#BE26C1";
  const font = "'Inter', sans-serif";

  // Keep screen awake
  useEffect(() => {
    if (!blockUntil) { setBlockSecondsLeft(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(blockUntil).getTime() - Date.now()) / 1000));
      setBlockSecondsLeft(remaining);
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [blockUntil]);
  // Keep the phone awake while the quiz session is ACTIVE. The Screen Wake Lock
  // is auto-released by the OS whenever the tab is hidden or the screen turns
  // off, so it must be re-acquired on visibility/focus and when the sentinel
  // fires its own 'release' event - otherwise the phone starts sleeping mid-game.
  // Released on unmount (player leaves) and when the session ends (status
  // "finished"), which re-runs this effect and skips re-acquiring.
  useEffect(() => {
    const active = sessionStatus !== "finished";
    let sentinel: WakeLockSentinel | null = null;
    let pending = false;
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: string) => Promise<WakeLockSentinel> } };
    async function acquire() {
      if (!active || disposed || pending || document.visibilityState !== "visible" || !nav.wakeLock || (sentinel && !sentinel.released)) return;
      pending = true;
      try {
        const next = await nav.wakeLock.request("screen");
        if (disposed) { await next.release(); return; }
        sentinel = next;
        next.addEventListener("release", () => {
          if (sentinel === next) sentinel = null;
          // iOS can release a lock during transient browser UI changes. Avoid a
          // tight request loop, then restore it while the quiz is still visible.
          if (!disposed && active && document.visibilityState === "visible") retryTimer = setTimeout(acquire, 750);
        });
      } catch {} finally { pending = false; }
    }
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    if (active) {
      acquire();
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("focus", acquire);
      window.addEventListener("pageshow", acquire);
      document.addEventListener("pointerdown", acquire, { passive: true });
    }
    const watchdog = window.setInterval(acquire, 15000);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", acquire);
      window.removeEventListener("pageshow", acquire);
      document.removeEventListener("pointerdown", acquire);
      window.clearInterval(watchdog);
      if (retryTimer) clearTimeout(retryTimer);
      if (sentinel) { sentinel.release().catch(() => {}); sentinel = null; }
    };
  }, [sessionStatus]);
  // iOS Safari may expose the Wake Lock API but still release/ignore it. Keep
  // the tiny muted-video fallback active as a second layer on every handset,
  // not only browsers where navigator.wakeLock is undefined.
  useEffect(() => {
    if (sessionStatus === "finished") return;
    const video = document.createElement("video");
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("loop", "");
    video.setAttribute("preload", "auto");
    video.setAttribute("aria-hidden", "true");
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.src = "/keep-awake.mp4";
    // Keep it technically rendered: iOS may suspend display:none, zero-size,
    // fully transparent, or off-screen media even while play() says it ran.
    video.style.cssText = "position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:-1;";
    document.body.appendChild(video);
    const resume = () => { if (document.visibilityState === "visible" && video.paused) video.play().catch(() => {}); };
    resume();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("pointerdown", resume, { passive: true });
    document.addEventListener("touchstart", resume, { passive: true });
    const watchdog = window.setInterval(resume, 10000);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("pointerdown", resume);
      document.removeEventListener("touchstart", resume);
      window.clearInterval(watchdog);
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (video.parentNode) video.parentNode.removeChild(video);
    };
  }, [sessionStatus]);
  const applySessionDataRef = useRef<(data: Record<string, unknown>) => void>(() => {});

  useEffect(() => {
    applySessionDataRef.current = applySessionData;
  });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function fetchSession() {
      const { data, error: fetchError } = await supabase
        .from("sessions")
        .select("current_session_round_id, phase, status, round_name, current_question, current_question_index, timer_started_at, timer_duration, fastest_team, fastest_song, fastest_points, hard_deck_team, hard_deck_status, hard_deck_potential, hard_deck_cards, hard_deck_wheel_target, hard_deck_wheel_spinning, hard_deck_guess, spin_offered, spin_choice, spin_target_idx, spin_nonce, intermission_offers, intermission_whatsapp, intermission_other_quizzes, venue_record_id, block_until, block_team, show_scoreboard, scoreboard_data, hide_leaderboard, allow_power_cards, quiz_end_revealed_count, quiz_end_trophy_visible, pursuit_status, pursuit_data, is_final_round, hot_seat_status, hot_seat_team, hot_seat_locked_teams, hot_seat_answer_started_at, hot_seat_answer_duration")
        .eq("pin", sessionPin)
        .single();
      if (fetchError) {
        connectionFailuresRef.current += 1;
        if (firstFailureAtRef.current === null) firstFailureAtRef.current = Date.now();
        // DIAGNOSTIC ONLY (temporary): capture the actual PostgREST/network error
        // driving connectionLost, plus browser lifecycle state at the moment of
        // failure. No thresholds/behaviour changed - see connectionLost logic below.
        platformLogger.warn("player-session-poll", "fetchSession failed", {
          failureCount: connectionFailuresRef.current,
          errorCode: fetchError.code,
          errorMessage: fetchError.message,
          errorDetails: fetchError.details,
          errorHint: fetchError.hint,
          sessionPin,
          visibilityState: typeof document !== "undefined" ? document.visibilityState : "unknown",
          online: typeof navigator !== "undefined" ? navigator.onLine : "unknown",
        });
        if (connectionFailuresRef.current >= 3) {
          // DIAGNOSTIC ONLY (temporary): identify this trip as coming from
          // session polling, not answer submission (the other setConnectionLost(true) site).
          platformLogger.error("player-session-poll", "connectionLost triggered by session polling", {
            failureCount: connectionFailuresRef.current,
            sessionPin,
            visibilityState: typeof document !== "undefined" ? document.visibilityState : "unknown",
            online: typeof navigator !== "undefined" ? navigator.onLine : "unknown",
          });
          setConnectionLost(true);
        }
      }
      if (data) {
        // DIAGNOSTIC ONLY (temporary): log recovery after one or more prior failures.
        if (connectionFailuresRef.current > 0) {
          const elapsedMs = firstFailureAtRef.current !== null ? Date.now() - firstFailureAtRef.current : null;
          platformLogger.info("player-session-poll", "fetchSession recovered after failures", {
            previousFailureCount: connectionFailuresRef.current,
            elapsedSinceFirstFailureMs: elapsedMs,
            visibilityState: typeof document !== "undefined" ? document.visibilityState : "unknown",
            online: typeof navigator !== "undefined" ? navigator.onLine : "unknown",
          });
        }
        connectionFailuresRef.current = 0;
        firstFailureAtRef.current = null;
        setConnectionLost(false);
        applySessionDataRef.current(data as Record<string, unknown>);
      }
    }

    async function fetchTeamOrder() {
      const { data: teamRows } = await supabase.from("teams").select("team_name").eq("session_pin", sessionPin).order("created_at", { ascending: true });
      if (teamRows) setAllTeamNames(teamRows.map((t: { team_name: string }) => t.team_name));
    }

    fetchSession();
    fetchTeamOrder();

    // Polling every 500ms to keep handset in sync
    const pollInterval = setInterval(fetchSession, PLATFORM_CONFIG.polling.playerSessionMilliseconds);
    // Re-poll the team order too. A handset that connected before some teams had
    // joined would otherwise keep a shorter/stale list, so the SAME Hard Deck
    // wheel index would point to a DIFFERENT team than on other phones. Refetching
    // (ordered by created_at, identical query on every device) keeps every handset
    // on the exact same team list the wheel is built from.
    const teamPollInterval = setInterval(fetchTeamOrder, PLATFORM_CONFIG.polling.playerTeamOrderMilliseconds);

    // Mobile browsers throttle or fully pause setInterval (and can drop the
    // realtime websocket) while the phone screen is locked or the tab is
    // backgrounded - a player who steps away mid-question can come back to
    // stale state with no question visible until the next natural event. Force
    // an immediate resync the instant the tab/page becomes visible or focused
    // again, instead of waiting on a timer that may not have been running.
    const onVisible = () => { if (document.visibilityState === "visible") { fetchSession(); fetchTeamOrder(); } };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", fetchSession);

    // DIAGNOSTIC ONLY (temporary): trace browser lifecycle events so a
    // reproduction can be lined up against the fetchSession failure/recovery
    // logs above. Logging only - no behaviour here.
    const logLifecycle = (event: string) => {
      platformLogger.info("player-lifecycle", event, {
        sessionPin,
        visibilityState: typeof document !== "undefined" ? document.visibilityState : "unknown",
        online: typeof navigator !== "undefined" ? navigator.onLine : "unknown",
      });
    };
    const onVisibilityChangeLog = () => logLifecycle("visibilitychange");
    const onFocusLog = () => logLifecycle("focus");
    const onBlurLog = () => logLifecycle("blur");
    const onOnlineLog = () => logLifecycle("online");
    const onOfflineLog = () => logLifecycle("offline");
    document.addEventListener("visibilitychange", onVisibilityChangeLog);
    window.addEventListener("focus", onFocusLog);
    window.addEventListener("blur", onBlurLog);
    window.addEventListener("online", onOnlineLog);
    window.addEventListener("offline", onOfflineLog);

    const channel = supabase
      .channel("player-session-" + sessionPin)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "sessions",
      }, (payload) => {
        if (payload.new && (payload.new as Record<string, unknown>).pin === sessionPin) {
          applySessionDataRef.current(payload.new as Record<string, unknown>);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnectionLost(false);
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") fetchSession();
      });

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
      clearInterval(teamPollInterval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", fetchSession);
      document.removeEventListener("visibilitychange", onVisibilityChangeLog);
      window.removeEventListener("focus", onFocusLog);
      window.removeEventListener("blur", onBlurLog);
      window.removeEventListener("online", onOnlineLog);
      window.removeEventListener("offline", onOfflineLog);
    };
  }, [sessionPin]);

  // Presence heartbeat. Separate from the session poll above so it never
  // interacts with connectionLost/retry logic - this only tells the host
  // diagnostics panel "this handset is actually still here," it doesn't
  // affect gameplay state. Writes teams.last_seen_at on an interval and
  // immediately whenever the tab becomes visible/focused again, since that's
  // exactly when a real reconnect after backgrounding needs to be reflected.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    async function sendHeartbeat() {
      const { error } = await supabase
        .from("teams")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("session_pin", sessionPin)
        .eq("team_name", teamName);
      if (error && !cancelled) {
        platformLogger.warn("player-heartbeat", "heartbeat write failed", {
          errorCode: error.code,
          errorMessage: error.message,
          sessionPin,
        });
      }
    }

    sendHeartbeat();
    const heartbeatInterval = setInterval(sendHeartbeat, PLATFORM_CONFIG.polling.playerHeartbeatMilliseconds);
    const onHeartbeatVisible = () => { if (document.visibilityState === "visible") sendHeartbeat(); };
    document.addEventListener("visibilitychange", onHeartbeatVisible);
    window.addEventListener("focus", sendHeartbeat);

    return () => {
      cancelled = true;
      clearInterval(heartbeatInterval);
      document.removeEventListener("visibilitychange", onHeartbeatVisible);
      window.removeEventListener("focus", sendHeartbeat);
    };
  }, [sessionPin, teamName]);

  function applySessionData(data: Record<string, unknown>) {
    setSessionStatus((data.status as string) || "waiting");
    const newPhase = (data.phase as Phase) || "waiting";
    const newQ = data.current_question as Question | null;
    const newIdx = (data.current_question_index as number) ?? 0;
    const ft = (data.fastest_team as string) || null;
    const spinChoiceVal = (data.spin_choice as string) || null;
    const spinNonceVal = (data.spin_nonce as number) ?? null;

    if (spinChoiceVal === "spin" && spinNonceVal !== null && spinNonceHandledRef.current !== spinNonceVal) {
      spinNonceHandledRef.current = spinNonceVal;
      setPhase("spin_to_win");
    } else {
      setPhase(newPhase);
    }
    setQuestion(newQ);
    setFastestTeamName(ft);
    setFastestSongName((data.fastest_song as string) || null);
    setFastestPoints((data.fastest_points as number) || 0);
    setRoundNumber((data.round_number as number) || 1);
    setRoundName((data.round_name as string) || "");
    const leaderboardHidden = !!data.hide_leaderboard;
    setHideLeaderboard(leaderboardHidden);
    setAllowPowerCards(data.allow_power_cards !== false);
    const hotSeat = readHotSeatState(data);
    setHotSeatStatus(hotSeat.status);
    setHotSeatTeam(hotSeat.team);
    setHotSeatLockedTeams(hotSeat.lockedTeams);
    setBuzzing(false);
    if (newPhase === "hot_seat" && hotSeat.status === "claimed" && hotSeat.team === teamName && hotSeat.answerStartedAt) {
      const elapsed = Math.floor((Date.now() - new Date(hotSeat.answerStartedAt).getTime()) / 1000);
      startCountdown(Math.max(0, hotSeat.answerDuration - elapsed));
    } else if (newPhase === "hot_seat" && hotSeat.status === "open") {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(null);
    }
    setShowScoreboardOnPhone(!leaderboardHidden && !!data.show_scoreboard);
    setPhoneScoreboardData((data.scoreboard_data as {team_name:string; total_points:number}[]) || []);
    setActiveSessionRoundId((data.current_session_round_id as string) || null);
    setSpinTargetIdx((data.spin_target_idx as number) ?? null);
    setSpinNonce((data.spin_nonce as number) ?? null);
    setBlockUntil((data.block_until as string) || null);
    setBlockTeam((data.block_team as string) || null);
    setHardDeckTeam((data.hard_deck_team as string) || null);
    {
      const newHDStatus = (data.hard_deck_status as string) || "idle";
      if (newHDStatus !== "decision") setStickGamblePressed(null);
      setHardDeckStatus(newHDStatus);
    }
    setHardDeckCards((data.hard_deck_cards as {rank:number; suit:string}[]) || []);
    setHardDeckWheelTarget((data.hard_deck_wheel_target as number) ?? null);
    setHardDeckWheelSpinning(!!data.hard_deck_wheel_spinning);
    setHardDeckPotential((data.hard_deck_potential as number) || 0);
    setHardDeckGuess((data.hard_deck_guess as string) || null);
    // THE PURSUIT — hydrate handset mirror (pursuit_status + current question idx).
    const pursuitState = readPursuitState(data);
    const newPursuitStatus = pursuitState.status;
    setPursuitStatus(newPursuitStatus);
    setPursuitQIndex(readQIndex(pursuitState));
    setPursuitRace(readRace(pursuitState));
    setSpinOffered(!!data.spin_offered);
    setSpinChoice((data.spin_choice as string) || null);
    setIntermissionOffers((data.intermission_offers as string) || "");
    setIntermissionWhatsapp((data.intermission_whatsapp as string) || "");
    setIntermissionOtherQuizzes((data.intermission_other_quizzes as string) || "");
    setVenueRecordId((data.venue_record_id as string) || null);
    setUpcomingQuizzes((data.upcoming_quizzes as UpcomingQuiz[]) || []);
    setQuizEndRevealedCount((data.quiz_end_revealed_count as number) || 0);
    setQuizEndTrophyVisible(!!data.quiz_end_trophy_visible);

    // Reset answer state when phase changes to question, question index changes, OR the question content itself changes (e.g. host used Dump Question to swap content without changing the index)
    const newQText = newQ?.question_text || "";
    // The Pursuit reuses the normal question screen: treat its "question" sub-phase
    // as an effective "question" phase so answer state resets between race questions.
    const inPursuitQuestion = newPhase === "pursuit" && newPursuitStatus === "question";
    const effPhase = inPursuitQuestion ? "question" : newPhase;
    if ((effPhase === "question" || newPhase === "hot_seat") && (newIdx !== lastQIndexRef.current || lastPhaseRef.current !== effPhase || newQText !== lastQTextRef.current)) {
      lastQIndexRef.current = newIdx;
      lastQTextRef.current = newQText;
      setQuestionIndex(newIdx);
      setSelectedAnswer("");
      setAnswerText("");
      setSubmitted(false);
      setTappedItems([]);
      setMySubmittedDisplay("");
    }
    if (newPhase === "hot_seat" && hotSeat.status === "submitted" && hotSeat.team === teamName) {
      setSubmitted(true);
      setMySubmittedDisplay("Answer submitted");
    }
    lastPhaseRef.current = effPhase;

    if (newPhase !== "hot_seat" && data.timer_started_at && data.timer_duration) {
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
    }, PLATFORM_CONFIG.timers.tickMilliseconds);
  }

  async function submitAnswer(answer: string, retryCount = 0) {
    if (submitted || !answer.trim()) return;
    if (phase === "hot_seat" && hotSeatTeam !== teamName) {
      setError("Only the team in the Hot Seat can answer.");
      return;
    }
    if (phase === "pursuit" && pursuitRace[teamName]?.status !== "active") {
      setError("Your Pursuit run is complete. You can watch the race from here.");
      return;
    }
    if (timeLeft !== null && timeLeft <= -2) {
      setError("Time's up! No more answers accepted for this question.");
      setTimeout(() => setError(""), 2500);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    // AUTHORITATIVE late-answer rejection. The local `timeLeft` is derived from an
    // interval that can lag when the tab is backgrounded or wifi drops, so on the
    // first attempt we re-read the session's timer/phase straight from the DB and
    // reject if the answering window has actually closed. This does not rely on the
    // phone UI being disabled. (A DB-level RLS/trigger would be even stronger but
    // requires a Supabase policy change, which is out of scope for this pass.)
    if (retryCount === 0) {
      const { data: live } = await supabase.from("sessions")
        .select("phase, current_question_index, timer_started_at, timer_duration, hot_seat_team, hot_seat_answer_started_at, hot_seat_answer_duration")
        .eq("pin", sessionPin).maybeSingle();
      if (live) {
        const phase = live.phase as string;
        const answering = phase === "question" || phase === "timer" || phase === "pursuit" || phase === "hot_seat";
        const movedOn = (phase === "question" || phase === "timer" || phase === "hot_seat")
          && typeof live.current_question_index === "number"
          && live.current_question_index !== questionIndex;
        const started = live.timer_started_at ? new Date(live.timer_started_at as string).getTime() : null;
        const dur = typeof live.timer_duration === "number" ? live.timer_duration : null;
        // 1.5s network grace, matching the existing client-side allowance.
        const hotSeatStarted = live.hot_seat_answer_started_at ? new Date(live.hot_seat_answer_started_at as string).getTime() : null;
        const hotSeatDuration = typeof live.hot_seat_answer_duration === "number" ? live.hot_seat_answer_duration : HOT_SEAT_ANSWER_SECONDS;
        const expired = phase === "hot_seat"
          ? hotSeatStarted !== null && Date.now() > hotSeatStarted + hotSeatDuration * 1000 + 1500
          : started !== null && dur !== null && Date.now() > started + dur * 1000 + 1500;
        const wrongHotSeatTeam = phase === "hot_seat" && live.hot_seat_team !== teamName;
        if (!answering || movedOn || expired || wrongHotSeatTeam) {
          setError("Time's up! No more answers accepted for this question.");
          setTimeout(() => setError(""), 2500);
          return;
        }
      }
    }
    // Optimistically show locked-in, but verify the write actually succeeded -
    // on flaky venue wifi the insert can silently fail while the UI still says "locked in".
    setSubmitted(true);
    const { error } = await supabase.from("answers").insert({
      session_pin: sessionPin,
      team_name: teamName,
      question_index: questionIndex,
      answer_text: answer.trim(),
    });
    if (error) {
      if (retryCount < 2) {
        // Quick silent retry first (covers brief connection blips)
        setTimeout(() => { setSubmitted(false); submitAnswer(answer, retryCount + 1); }, 800);
      } else {
        setSubmitted(false);
        // DIAGNOSTIC ONLY (temporary): identify this trip as coming from
        // answer submission, not session polling (the other setConnectionLost(true) site).
        // No answer content logged.
        platformLogger.error("player-answer-submit", "connectionLost triggered by answer submission", {
          retryCount,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
          errorHint: error.hint,
          sessionPin,
          visibilityState: typeof document !== "undefined" ? document.visibilityState : "unknown",
          online: typeof navigator !== "undefined" ? navigator.onLine : "unknown",
        });
        setConnectionLost(true);
        setError("Connection lost. Close and reopen the keypad to reconnect.");
      }
    }
  }

  async function claimHotSeat() {
    if (buzzing || hotSeatStatus !== "open" || hotSeatLockedTeams.includes(teamName)) return;
    setBuzzing(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("claim_hot_seat", {
      p_session_pin: sessionPin,
      p_team_name: teamName,
    });
    if (error) {
      setError("Buzz could not be registered. Tap again.");
      setBuzzing(false);
      return;
    }
    const result = data as { claimed?: boolean } | null;
    if (!result?.claimed) {
      setError("Another team got there first.");
      setTimeout(() => setError(""), 1800);
    }
    setBuzzing(false);
  }

  async function submitHardDeckGuess(guess: "higher" | "lower") {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ hard_deck_guess: guess }).eq("pin", sessionPin);
  }

  async function submitHardDeckStick() {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ hard_deck_status: "won" }).eq("pin", sessionPin);
  }

  async function submitHardDeckGamble() {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ hard_deck_status: "awaiting_guess" }).eq("pin", sessionPin);
  }

  async function chooseSpin() {
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.from("sessions").update({ spin_choice: "spin" }).eq("pin", sessionPin);
    if (err) {
      platformLogger.error("player", "Spin choice failed", { error: err });
      setError("Could not register your spin choice - please try again.");
      setTimeout(() => setError(""), 4000);
    }
  }

  async function choosePass() {
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.from("sessions").update({ spin_choice: "pass" }).eq("pin", sessionPin);
    if (err) {
      platformLogger.error("player", "Pass choice failed", { error: err });
      setError("Could not register your choice - please try again.");
      setTimeout(() => setError(""), 4000);
    }
  }

  function getCorrectAnswerText(q: Question): string {
    if (q.question_type === "multiple_choice") {
      const key = q.correct_answer.toLowerCase();
      const map: Record<string, string | null> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d };
      return map[key] || q.correct_answer;
    }
    if (q.question_type === "sequence") {
      const map: Record<string, string | null> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d };
      const order = q.correct_answer.split(",").map(s => s.trim().toLowerCase());
      const texts = order.map(key => map[key]).filter((t): t is string => !!t);
      if (texts.length === order.length) return texts.join(", ");
      return q.correct_answer;
    }
    return q.correct_answer;
  }

  const PowerCards = () => (
    allowPowerCards ? <div style={{ flexShrink: 0, paddingTop: 10, paddingBottom: 4, borderTop: "1px solid rgba(255,255,255,0.06)", background: bg }}>
      <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} roundNumber={roundNumber} compact={true} enabled={allowPowerCards} />
    </div> : <div className="qi-player-cards-paused">Power Cards unavailable this round</div>
  );

  if (connectionLost) {
    return (
      <PlayerShell className="qi-player-recovery">
        <PlayerStatusBar teamName={teamName} roundName={roundName} powerCardsEnabled={allowPowerCards} photoUrl={teamPhotoUrl} points={myRunningPoints} />
        <PlayerResultBanner tone="neutral" title="CONNECTION LOST">Close and reopen the keypad to reconnect.</PlayerResultBanner>
        <button className="qi-player-reconnect" onClick={() => window.location.reload()}>RECONNECT</button>
      </PlayerShell>
    );
  }

  if (phase === "pursuit" && pursuitStatus === "question" && pursuitRace[teamName]?.status !== "active") {
    const entry = pursuitRace[teamName];
    const stage = entry?.stage ?? 0;
    return (
      <PlayerShell className="qi-player-pursuit-observer">
        <PlayerStatusBar teamName={teamName} roundName={roundName} powerCardsEnabled={false} photoUrl={teamPhotoUrl} points={myRunningPoints} />
        <div className="qi-player-observer-label">OBSERVATION ONLY</div>
        <h1>{entry?.status === "completed" ? "FINISHED" : "ELIMINATED"}</h1>
        <div className="qi-player-observer-score"><span>Banked score</span><strong>{pursuitTotalPoints(stage)}</strong></div>
        <div className="qi-player-observer-progress">Race progress: {stage} of {PURSUIT_TOTAL_QUESTIONS}</div>
        <p>Stay connected and watch the remaining teams race.</p>
      </PlayerShell>
    );
  }

  if (showScoreboardOnPhone && !hideLeaderboard && phase !== "quiz_end") {
    const sorted = [...phoneScoreboardData].sort((a,b) => b.total_points - a.total_points);
    return (
      <PlayerShell className="qi-player-leaderboard">
        <PlayerStatusBar teamName={teamName} roundName={roundName} powerCardsEnabled={allowPowerCards} photoUrl={teamPhotoUrl} points={myRunningPoints} />
        <div style={{ fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", fontSize: 18, color: purple, letterSpacing: ".24em", textAlign: "center" as const, marginBottom: 20, textShadow: "0 0 24px rgba(190,38,193,.5)" }}>LEADERBOARD</div>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
          {sorted.map((s, i) => (
            <div key={s.team_name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 16, background: s.team_name === teamName ? "rgba(190,38,193,0.2)" : "rgba(255,255,255,0.05)", border: s.team_name === teamName ? "1.5px solid " + purple : "1px solid rgba(46,26,82,0.9)", boxShadow: "0 2px 6px rgba(5,0,13,0.4)" }}>
              <span style={{ fontWeight: 800, color: i === 0 ? "#E8C36A" : i === 1 ? "#C9CDD6" : i === 2 ? "#C08A5A" : "rgba(255,255,255,0.4)", minWidth: 24, fontVariantNumeric: "tabular-nums" }}>{i+1}.</span>
              <span style={{ flex: 1, fontWeight: 700 }}>{s.team_name}</span>
              <span style={{ fontWeight: 900, color: purple, fontSize: 18 }}>{s.total_points}</span>
            </div>
          ))}
        </div>
      </PlayerShell>
    );
  }
  if (phase === "spin_to_win") {
    const isWinner = fastestTeamName === teamName;
    // The host now moves the session into this phase as soon as they click
    // "Offer Spin to Win" - before the winning team has actually chosen
    // Spin or Pass (see doOfferSpinToWin in app/host/quiz/page.tsx). This
    // used to be handled entirely under phase "celebration", where the
    // isWinner/spinOffered/!spinChoice block below the celebration screen
    // rendered the Spin/Pass choice - but that phase never lands anymore
    // while a spin is offered, so the winning team's phone jumped straight
    // to the (choice-less) spinning-wheel view with no way to actually pick
    // Spin or Pass. Show the same choice UI here instead, gated on there
    // being no choice yet and no result yet (spinTargetIdx still null).
    if (isWinner && !spinChoice && spinTargetIdx === null) {
      return (
        <div className="qi-player-state qi-player-spin-choice" style={{ height: "100dvh", overflow: "hidden", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 24, textAlign: "center" as const }}>
          <div style={{ fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", fontSize: 24, letterSpacing: ".12em", textShadow: "0 0 24px rgba(190,38,193,.6)" }}><span style={{ color: "#BE26C1" }}>SPIN</span> TO WIN</div>
          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(255,59,78,0.12)", border: "1px solid rgba(255,59,78,0.5)", color: "#FF3B4E", font: "600 13px 'Inter'", textAlign: "center" as const }}>{error}</div>
          )}
          <button onClick={chooseSpin} style={{ width: "min(64vw,260px)", aspectRatio: "1", borderRadius: "50%", background: "radial-gradient(circle at 50% 40%, rgba(217,79,220,0.35), #150A2E 72%)", border: "2px solid #D94FDC", color: "#fff", font: "800 34px 'Inter'", letterSpacing: ".2em", cursor: "pointer", boxShadow: "0 0 46px rgba(190,38,193,0.5)" }}>SPIN</button>
          <button onClick={choosePass} style={{ width: "100%", maxWidth: 320, minHeight: 64, borderRadius: 16, background: "#150A2E", border: "1px solid #2E1A52", color: "#B9A8D9", font: "700 18px 'Inter'", letterSpacing: ".2em", cursor: "pointer" }}>PASS</button>
        </div>
      );
    }
    return (
      <div className="qi-player-state qi-player-spin" style={{ height: "100dvh", overflow: "hidden", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, gap: 12, textAlign: "center" as const }}>
        {!isWinner && (
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
            {fastestTeamName ? fastestTeamName + " is spinning..." : "Spinning..."}
          </div>
        )}
        {/* Every player sees their own synced mini wheel - not just the spinning team -
            so remote players who can't see the venue display still see the result live. */}
        <div style={{ width: "100%" }}>
          <SlotReels targetIdx={spinTargetIdx} spinNonce={spinNonce} teamName={fastestTeamName || teamName} victorySong={isWinner ? (fastestSongName || undefined) : undefined} size="compact" audioEnabled={false} />
        </div>
      </div>
    );
  }
  if (sessionStatus === "finished") {
    return (
      <div className="qi-player-state qi-player-session-complete">
        <div className="qi-finish-brand"><span>QUIZ</span>-IT<small>Powered by Mac Entertainment</small></div>
        <section className="qi-finish-card" aria-label="Quiz complete">
          <div className="qi-finish-emblem" aria-hidden="true">✦</div>
          <div className="qi-finish-eyebrow">QUIZ COMPLETE</div>
          <h1>That&apos;s<br />a wrap!</h1>
          <div className="qi-finish-team">{teamName}</div>
          <p>Thanks for bringing your team<br />and playing along.</p>
          <div className="qi-finish-signoff">Good company. Great quiz.</div>
        </section>
        <p className="qi-finish-note">Enjoy the rest of your evening.<br />See you at the next quiz!</p>
      </div>
    );
  }
  if (phase === "hard_deck") {
    const isSelected = hardDeckTeam === teamName;
    const rankLabels: Record<number,string> = { 1:"A", 11:"J", 12:"Q", 13:"K" };
    const rankLabel = (r: number) => rankLabels[r] || String(r);
    return (
      <div className="qi-player-state qi-player-hard-deck" style={{ height: "100dvh", overflow: "hidden", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 16, textAlign: "center" as const }}>
        <PlayerStatusBar teamName={teamName} roundName="The Hard Deck" powerCardsEnabled={false} photoUrl={teamPhotoUrl} points={myRunningPoints} />
        <div style={{ fontFamily: "'Bruno Ace SC', sans-serif", fontSize: (hardDeckTeam && hardDeckStatus !== "wheel") ? 14 : 20, color: (hardDeckTeam && hardDeckStatus !== "wheel") ? "rgba(190,38,193,0.5)" : purple, letterSpacing: (hardDeckTeam && hardDeckStatus !== "wheel") ? 2 : 3, fontWeight: (hardDeckTeam && hardDeckStatus !== "wheel") ? 600 : 400 }}>THE HARD DECK</div>

        {/* Everyone sees the same team-select wheel and card faces, not just text -
            so remote players who can't see the venue display can still follow along. */}
        {hardDeckStatus === "wheel" && hardDeckWheelTarget !== null && (
          <div style={{ width: "100%", maxWidth: 280 }}>
            <SpinWheel
              segments={buildTeamSegments(allTeamNames)}
              onResult={() => {}}
              size={240}
              forceResultIndex={hardDeckWheelTarget}
              autoSpin={hardDeckWheelSpinning}
              allowManualSpin={false}
            />
          </div>
        )}

        {hardDeckTeam && hardDeckStatus !== "wheel" && (
          <div style={{ fontSize: isSelected ? 28 : 20, color: isSelected ? "#D94FDC" : "#fff", fontWeight: 800, letterSpacing: 1 }}>
            {isSelected ? "IT'S YOU" : hardDeckTeam}
          </div>
        )}

        {hardDeckCards.length > 0 && (() => {
          // Card size used to be a single fixed viewport-relative size tuned so
          // all FIVE cards could eventually fit across a phone with no
          // horizontal overflow - but that made it tiny and lost in empty
          // space on gates 1-4, when only 1-4 cards are actually on screen.
          // Scale the cap up as the count shrinks, so early gates get a much
          // bigger card and only the full five-card spread uses the small size.
          const n = hardDeckCards.length;
          const widthCap = n <= 1 ? 190 : n === 2 ? 160 : n === 3 ? 130 : n === 4 ? 105 : 90;
          const heightCap = Math.round(widthCap * 1.42);
          const widthVw = n <= 1 ? 42 : n === 2 ? 34 : n === 3 ? 26 : n === 4 ? 20 : 16;
          const heightVw = Math.round(widthVw * 1.42);
          const rankFontCap = n <= 1 ? 56 : n === 2 ? 48 : n === 3 ? 38 : n === 4 ? 32 : 28;
          const suitFontCap = Math.round(rankFontCap * 1.2);
          return (
            <div style={{ padding: "clamp(8px,3vw,16px)", borderRadius: 18, maxWidth: "96vw", boxSizing: "border-box" as const, background: "linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))", border: "1px solid rgba(190,38,193,0.25)", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05), inset 0 -1px 16px rgba(0,0,0,0.4), 0 0 24px rgba(190,38,193,0.15)" }}>
              <div style={{ display: "flex", gap: "clamp(4px,1.5vw,12px)", justifyContent: "center", flexWrap: "nowrap" as const }}>
                {hardDeckCards.map((c, i) => (
                  <div key={i} style={{ width: `min(${widthCap}px,${widthVw}vw)`, height: `min(${heightCap}px,${heightVw}vw)`, flexShrink: 0, borderRadius: 12, background: "linear-gradient(160deg, #ffffff 0%, #f2f2f5 100%)", border: "1px solid rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: `min(${rankFontCap}px,${Math.round(widthVw*0.35)}vw)`, fontWeight: 900, color: (c.suit === "♥" || c.suit === "♦") ? "#dc2626" : "#111", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -8px 12px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(212,175,90,0.3)" }}>
                    <div>{rankLabel(c.rank)}</div>
                    <div style={{ fontSize: `min(${suitFontCap}px,${Math.round(widthVw*0.42)}vw)` }}>{c.suit}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {!isSelected && hardDeckStatus !== "wheel" && (
          <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.65)" }}>
            {hardDeckStatus === "awaiting_guess" ? "Higher or Lower?" : hardDeckStatus === "decision" ? "Stick or Gamble?" : ""}
          </div>
        )}

        {isSelected && hardDeckStatus === "awaiting_guess" && (
          <div style={{ display: "flex", gap: 16, width: "100%", maxWidth: 380 }}>
            <button
              onClick={() => submitHardDeckGuess("higher")}
              disabled={!!hardDeckGuess}
              style={{
                flex: 1, minHeight: 132, borderRadius: 18, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                background: hardDeckGuess === "higher" ? "rgba(232,195,106,0.28)" : "#1D1140",
                border: hardDeckGuess === "higher" ? "3px solid #E8C36A" : "2px solid rgba(232,195,106,0.7)",
                color: "#fff", cursor: hardDeckGuess ? "default" : "pointer",
                transform: hardDeckGuess === "higher" ? "scale(1.04)" : "scale(1)",
                opacity: hardDeckGuess && hardDeckGuess !== "higher" ? 0.35 : 1,
                transition: "all 0.15s ease",
              }}
            ><span aria-hidden style={{ fontSize: 40, lineHeight: 1, color: "#E8C36A" }}>▲</span><span style={{ font: "800 26px 'Inter'", letterSpacing: ".06em" }}>HIGHER</span></button>
            <button
              onClick={() => submitHardDeckGuess("lower")}
              disabled={!!hardDeckGuess}
              style={{
                flex: 1, minHeight: 132, borderRadius: 18, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                background: hardDeckGuess === "lower" ? "rgba(190,38,193,0.32)" : "#1D1140",
                border: hardDeckGuess === "lower" ? "3px solid #D94FDC" : "2px solid #8A1B8D",
                color: "#fff", cursor: hardDeckGuess ? "default" : "pointer",
                boxShadow: hardDeckGuess === "lower" ? "0 0 18px rgba(190,38,193,0.4)" : "none",
                transform: hardDeckGuess === "lower" ? "scale(1.04)" : "scale(1)",
                opacity: hardDeckGuess && hardDeckGuess !== "lower" ? 0.35 : 1,
                transition: "all 0.15s ease",
              }}
            ><span aria-hidden style={{ fontSize: 40, lineHeight: 1, color: "#D94FDC" }}>▼</span><span style={{ font: "800 26px 'Inter'", letterSpacing: ".06em" }}>LOWER</span></button>
          </div>
        )}
        {isSelected && hardDeckStatus === "decision" && (
          <>
            <div style={{ font: "700 18px 'Inter'", color: "#E8C36A" }}>You have {hardDeckPotential} points!</div>
            <div style={{ display: "flex", gap: 16, width: "100%", maxWidth: 360 }}>
              <button
                onClick={() => { setStickGamblePressed("stick"); submitHardDeckStick(); }}
                disabled={!!stickGamblePressed}
                style={{
                  flex: 1, minHeight: 80, borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                  background: stickGamblePressed === "stick" ? "rgba(232,195,106,0.25)" : "#150A2E",
                  border: stickGamblePressed === "stick" ? "2px solid #E8C36A" : "1px solid rgba(232,195,106,0.55)",
                  color: "#fff", cursor: stickGamblePressed ? "default" : "pointer",
                  transform: stickGamblePressed === "stick" ? "scale(1.04)" : "scale(1)",
                  opacity: stickGamblePressed && stickGamblePressed !== "stick" ? 0.4 : 1,
                  transition: "all 0.15s ease",
                }}
              ><span style={{ font: "800 18px 'Inter'", letterSpacing: ".08em" }}>STICK</span><span style={{ font: "600 11px 'Inter'", color: "#B9A8D9", letterSpacing: ".1em" }}>BANK {hardDeckPotential}</span></button>
              <button
                onClick={() => { setStickGamblePressed("gamble"); submitHardDeckGamble(); }}
                disabled={!!stickGamblePressed}
                style={{
                  flex: 1, minHeight: 80, borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                  background: stickGamblePressed === "gamble" ? "rgba(190,38,193,0.3)" : "#150A2E",
                  border: stickGamblePressed === "gamble" ? "2px solid #D94FDC" : "1px solid #8A1B8D",
                  color: "#fff", cursor: stickGamblePressed ? "default" : "pointer",
                  boxShadow: stickGamblePressed === "gamble" ? "0 0 18px rgba(190,38,193,0.35)" : "none",
                  transform: stickGamblePressed === "gamble" ? "scale(1.04)" : "scale(1)",
                  opacity: stickGamblePressed && stickGamblePressed !== "gamble" ? 0.4 : 1,
                  transition: "all 0.15s ease",
                }}
              ><span style={{ font: "800 18px 'Inter'", letterSpacing: ".08em" }}>GAMBLE</span><span style={{ font: "600 11px 'Inter'", color: "#B9A8D9", letterSpacing: ".1em" }}>NEXT CARD</span></button>
            </div>
          </>
        )}
        {hardDeckStatus === "won" && (
          <div style={{ font: "800 22px 'Inter'", color: "#2EE06E", letterSpacing: 0.5 }}>{isSelected ? "You won" : hardDeckTeam + " won"} {hardDeckPotential} points!</div>
        )}
        {hardDeckStatus === "lost" && (
          <div style={{ font: "800 22px 'Inter'", color: "#FF3B4E", letterSpacing: 0.5 }}>{isSelected ? "Bust — better luck next time!" : hardDeckTeam + " busted!"}</div>
        )}
      </div>
    );
  }

  // THE PURSUIT — non-question sub-phases only. The "question" and "reveal"
  // sub-phases fall through to the normal question / answer screens below (their
  // render conditions include the pursuit sub-phase), so every team answers the
  // pursuit question exactly as it answers any other — no special screens.
  if (phase === "pursuit" && pursuitStatus !== "question" && pursuitStatus !== "reveal") {
    const message =
      pursuitStatus === "intro" ? "Seven questions. One wrong answer and you're out. Get ready!"
      : pursuitStatus === "advance" ? "Runners are moving — watch the big screen!"
      : pursuitStatus === "complete" || pursuitStatus === "results" ? "That's the finish. Final standings on the big screen."
      : "The Pursuit is starting soon…";
    return (
      <div className="qi-player-state qi-player-pursuit" style={{ height: "100dvh", overflow: "hidden", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 16, textAlign: "center" as const, fontFamily: font }}>
        <PlayerStatusBar teamName={teamName} roundName="The Pursuit" powerCardsEnabled={false} photoUrl={teamPhotoUrl} points={myRunningPoints} />
        {/* Was hardcoded to #38bdf8 (blue) - not the app's purple/magenta
            brand color at all, and out of step with the same title on the
            Display board (which uses the brand purple + glow). */}
        <div style={{ fontFamily: "'Bruno Ace SC', sans-serif", fontSize: 22, color: "#D94FDC", textShadow: "0 0 24px rgba(190,38,193,0.5)", letterSpacing: 3 }}>THE PURSUIT</div>
        {pursuitQIndex >= 0 && pursuitStatus === "advance" && (
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.6)" }}>QUESTION {pursuitQIndex + 1} / {PURSUIT_TOTAL_QUESTIONS}</div>
        )}
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", maxWidth: 300 }}>{message}</div>
      </div>
    );
  }

  if (phase === "intermission") {
    const hasContent = intermissionOffers || intermissionWhatsapp || intermissionOtherQuizzes || venueOfferPhotos.length > 0;
    return (
      <div className="qi-player-state qi-player-intermission" style={{ height: "100dvh", overflow: "hidden", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 16, textAlign: "center" as const, fontFamily: font }}>
        <div style={{ fontSize: 22, color: purple, letterSpacing: 4, fontWeight: 700 }}>INTERMISSION</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>Next round starting soon...</div>
        {!hasContent && (
          <img src="/me-logo.jpg" alt="ME" style={{ width: 70, height: 70, borderRadius: "50%", border: "2px solid " + purple, marginTop: 12 }} />
        )}
        {venueOfferPhotos.length > 0 && (
          <div style={{ width: "100%", maxWidth: 340, aspectRatio: "1", borderRadius: 14, overflow: "hidden", border: "1.5px solid rgba(190,38,193,0.4)", position: "relative", background: "rgba(0,0,0,0.35)" }}>
            <img key={venueOfferPhotos[offerPhotoIdx]} src={getMediaUrl(venueOfferPhotos[offerPhotoIdx]) || venueOfferPhotos[offerPhotoIdx]} alt="Offer" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
            {venueOfferPhotos.length > 1 && (
              <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 5 }}>
                {venueOfferPhotos.map((_, i) => (
                  <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i === offerPhotoIdx ? purple : "rgba(255,255,255,0.35)" }} />
                ))}
              </div>
            )}
          </div>
        )}
        {intermissionOffers && (
          <div style={{ padding: "16px 18px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(190,38,193,0.4)", width: "100%", maxWidth: 340 }}>
            <div style={{ fontSize: 11, color: purple, letterSpacing: 2, marginBottom: 6 }}>TONIGHT'S OFFERS</div>
            <div style={{ fontSize: 15, color: "#fff", lineHeight: 1.4 }}>{intermissionOffers}</div>
          </div>
        )}
        {intermissionWhatsapp && (
          <div style={{ padding: "16px 18px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(190,38,193,0.4)", width: "100%", maxWidth: 340 }}>
            <div style={{ fontSize: 11, color: purple, letterSpacing: 2, marginBottom: 10 }}>JOIN OUR WHATSAPP</div>
            <img src={"https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=" + encodeURIComponent(intermissionWhatsapp)} alt="WhatsApp QR" style={{ width: 140, height: 140, borderRadius: 10, background: "#fff", padding: 6 }} />
          </div>
        )}
        {intermissionOtherQuizzes && (
          <div style={{ padding: "16px 18px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(190,38,193,0.4)", width: "100%", maxWidth: 340 }}>
            <div style={{ fontSize: 11, color: purple, letterSpacing: 2, marginBottom: 6 }}>MORE QUIZ NIGHTS</div>
            <div style={{ fontSize: 14, color: "#fff", lineHeight: 1.4 }}>{intermissionOtherQuizzes}</div>
          </div>
        )}
        <UpcomingQuizzesCard quizzes={upcomingQuizzes} />
        <TeamPhotoUpload sessionPin={sessionPin} teamName={teamName} />
      </div>
    );
  }
  if (phase === "celebration") {
    const isWinnerForSpin = fastestTeamName === teamName;
    if (isWinnerForSpin && spinOffered && !spinChoice) {
      return (
        <div className="qi-player-state qi-player-spin-choice" style={{ height: "100dvh", overflow: "hidden", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 24, textAlign: "center" as const }}>
          <div style={{ fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", fontSize: 24, letterSpacing: ".12em", textShadow: "0 0 24px rgba(190,38,193,.6)" }}><span style={{ color: "#BE26C1" }}>SPIN</span> TO WIN</div>
          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(255,59,78,0.12)", border: "1px solid rgba(255,59,78,0.5)", color: "#FF3B4E", font: "600 13px 'Inter'", textAlign: "center" as const }}>{error}</div>
          )}
          <button onClick={chooseSpin} style={{ width: "min(64vw,260px)", aspectRatio: "1", borderRadius: "50%", background: "radial-gradient(circle at 50% 40%, rgba(217,79,220,0.35), #150A2E 72%)", border: "2px solid #D94FDC", color: "#fff", font: "800 34px 'Inter'", letterSpacing: ".2em", cursor: "pointer", boxShadow: "0 0 46px rgba(190,38,193,0.5)" }}>SPIN</button>
          <button onClick={choosePass} style={{ width: "100%", maxWidth: 320, minHeight: 64, borderRadius: 16, background: "#150A2E", border: "1px solid #2E1A52", color: "#B9A8D9", font: "700 18px 'Inter'", letterSpacing: ".2em", cursor: "pointer" }}>PASS</button>
        </div>
      );
    }
    const isWinner = fastestTeamName === teamName;
    const confettiColors = ["#BE26C1","#fbbf24","#22c55e","#38bdf8","#f87171","#a78bfa"];
    return (
      <div className="qi-player-state qi-player-celebration" style={{ height: "100dvh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: font, position: "relative", overflow: "hidden" }}>
        {myRunningPoints !== undefined && <div style={{ color: "#D94FDC", fontWeight: 800, marginBottom: 12 }}>Your team total: {myRunningPoints} pts</div>}
        <style>{`
          @keyframes fall { 0% { transform: translateY(-20px) rotate(0deg); opacity:1; } 100% { transform: translateY(110vh) rotate(720deg); opacity:0; } }
          @keyframes flash { 0%,100%{opacity:1} 50%{opacity:0.15} }
        `}</style>
        {isWinner && Array.from({length: 24}).map((_, i) => (
          <div key={i} style={{
            position: "absolute", top: "-10px",
            left: (4 + (i * 17) % 92) + "%",
            width: 8 + (i % 4) * 3, height: 8 + (i % 3) * 3,
            borderRadius: i % 3 === 0 ? "50%" : 2,
            background: confettiColors[i % confettiColors.length],
            animation: `fall ${1.5 + (i % 8) * 0.3}s ease-in ${(i % 6) * 0.2}s infinite`,
            opacity: 0.9, pointerEvents: "none" as const,
          }} />
        ))}
        {fastestTeamName && (
          <>
            {isWinner && spinOffered && !spinChoice && (
              <div style={{ marginBottom: 20, textAlign: "center" as const }}>
                <div style={{ fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", fontSize: 16, color: "#D94FDC", marginBottom: 12, letterSpacing: ".1em" }}>SPIN TO WIN?</div>
                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                  <button onClick={chooseSpin} style={{ padding: "14px 28px", borderRadius: 14, background: "#BE26C1", border: "1px solid #D94FDC", color: "#fff", font: "700 16px 'Inter'", letterSpacing: ".08em", cursor: "pointer", boxShadow: "0 0 18px rgba(190,38,193,0.35)" }}>SPIN</button>
                  <button onClick={choosePass} style={{ padding: "14px 28px", borderRadius: 14, background: "#150A2E", border: "1px solid #2E1A52", color: "#B9A8D9", font: "700 16px 'Inter'", letterSpacing: ".08em", cursor: "pointer" }}>PASS</button>
                </div>
              </div>
            )}
            {isWinner && spinChoice === "spin" && (
              <div style={{ font: "700 16px 'Inter'", color: "#B9A8D9", marginBottom: 20, textAlign: "center" as const }}>Spinning… watch the big screen!</div>
            )}
            {isWinner && spinChoice === "pass" && (
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 20, textAlign: "center" as const }}>You passed on the spin</div>
            )}
          <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", letterSpacing: 3, textAlign: "center", lineHeight: 1.2, marginBottom: 20, animation: "flash 0.8s ease-in-out infinite", textShadow: "0 0 20px rgba(255,255,255,0.6)" }}>FASTEST<br/>CORRECT ANSWER</div>
          </>
        )}
        {isWinner ? (
          <>
            <div style={{ fontSize: 42, fontWeight: 900, color: purple, letterSpacing: 2, textAlign: "center", textShadow: "0 0 40px rgba(190,38,193,0.8)", margin: "8px 0" }}>{fastestTeamName}</div>
            <div style={{ font: "800 18px 'Inter'", color: "#E8C36A", letterSpacing: 2, marginBottom: 24 }}>{"That's you!"}</div>
            {/* Only show a points award when points were genuinely awarded. A
                "+0" is never a success state — show a neutral line instead.
                fastest_points comes from the session row the host writes AFTER
                the score is committed, so this reflects the stored award, not a
                pre-calculated estimate. */}
            {fastestPoints > 0 ? (
              <div style={{ padding: "20px 40px", borderRadius: 20, background: "rgba(46,224,110,0.15)", border: "2px solid rgba(46,224,110,0.5)", marginBottom: 32, textAlign: "center" }}>
                <div style={{ font: "700 12px 'Inter'", letterSpacing: 3, color: "#2EE06E", marginBottom: 4 }}>POINTS AWARDED</div>
                <div style={{ font: "900 56px 'Inter'", color: "#2EE06E", textShadow: "0 0 20px rgba(46,224,110,0.6)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>+{fastestPoints}</div>
              </div>
            ) : (
              <div style={{ font: "700 18px 'Inter'", color: "#B9A8D9", marginBottom: 32, textAlign: "center" }}>No points this time</div>
            )}
          </>
        ) : (() => {
          const correctText = question ? getCorrectAnswerText(question) : "";
          // Codex #12: was a naive exact-string compare of the DISPLAY text
          // against the correct DISPLAY text - only ever right for multiple
          // choice by coincidence (where both sides happen to be the same
          // option text), and wrong for multi_tap (which displays comma-
          // joined option text but stores comma-joined keys) or anything
          // fuzzy-matched by scoring (a typo'd but accepted text answer would
          // show as "incorrect" here despite having scored points). Reuses
          // the same isAnswerCorrect verdict as the main reveal screen above.
          const submittedAnswerText = question
            ? (question.question_type === "multiple_choice" ? selectedAnswer
              : question.question_type === "multi_tap" ? tappedItems.join(",")
              : mySubmittedDisplay)
            : "";
          const myAnswerCorrect = !!question && !!submittedAnswerText && isAnswerCorrect({ answer_text: submittedAnswerText }, question);
          return (
            <>
              <div className="qi-player-outcome-heading">{myAnswerCorrect ? "Correct answer" : mySubmittedDisplay ? "Not quite this time" : "No answer submitted"}</div>
              {question && <div className="qi-player-outcome-question">{question.question_text}</div>}
              {fastestTeamName && (
                <div style={{ fontSize: 32, fontWeight: 900, color: purple, letterSpacing: 2, textAlign: "center", textShadow: "0 0 24px rgba(190,38,193,0.6)", marginBottom: 16 }}>{fastestTeamName}</div>
              )}
              {myAnswerCorrect ? (
                <>
                <div style={{ fontSize: 16, color: "#22c55e", fontWeight: 700, marginBottom: 6 }}>Your answer was correct</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 24 }}>{fastestTeamName ? "Just not the fastest this time" : "Nice work!"}</div>
                </>
              ) : (
                <div className="qi-player-answer-comparison" style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                  <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ fontSize: 10, letterSpacing: 1, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>YOUR ANSWER</div>
                    <div style={{ fontSize: 14, color: "#fff" }}>{mySubmittedDisplay || "(no answer submitted)"}</div>
                  </div>
                  <div style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ fontSize: 10, letterSpacing: 1, color: "rgba(134,239,172,0.7)", marginBottom: 4 }}>CORRECT ANSWER</div>
                    <div style={{ fontSize: 14, color: "#86efac" }}>{correctText}</div>
                  </div>
                </div>
              )}
            </>
          );
        })()}
        {allowPowerCards ? <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} roundNumber={roundNumber} compact={true} enabled={allowPowerCards} /> : <div className="qi-player-cards-paused">Power Cards unavailable this round</div>}
      </div>
    );
  }

  if (phase === "hot_seat" && question && hotSeatTeam === teamName && !submitted && timeLeft !== null && timeLeft <= 0) {
    return (
      <div className="qi-player-state qi-player-hot-seat">
        <PlayerStatusBar teamName={teamName} roundName={roundName || "Hot Seat"} powerCardsEnabled={false} photoUrl={teamPhotoUrl} points={myRunningPoints} />
        <div className="qi-player-hot-seat__state is-locked"><strong>TIME&apos;S UP</strong><span>The host will reopen the buzz.</span></div>
      </div>
    );
  }

  if (phase === "hot_seat" && question && hotSeatTeam !== teamName) {
    const lockedOut = hotSeatLockedTeams.includes(teamName);
    const buzzOpen = hotSeatStatus === "open" && !lockedOut;
    return (
      <div className="qi-player-state qi-player-hot-seat">
        <PlayerStatusBar teamName={teamName} roundName={roundName || "Hot Seat"} powerCardsEnabled={false} photoUrl={teamPhotoUrl} points={myRunningPoints} />
        <div className="qi-player-hot-seat__question">{question.question_text.replace(/^Play this track:\s*/i, "").replace(/^Show teams this image:\s*/i, "")}</div>
        {buzzOpen ? (
          <button type="button" className="qi-player-hot-seat__buzz" onClick={claimHotSeat} disabled={buzzing}>
            {buzzing ? "BUZZING…" : "BUZZ"}
          </button>
        ) : lockedOut ? (
          <div className="qi-player-hot-seat__state is-locked"><strong>LOCKED OUT</strong><span>Another team can still take the Hot Seat.</span></div>
        ) : hotSeatTeam ? (
          <div className="qi-player-hot-seat__state"><strong>{hotSeatTeam}</strong><span>TAKES THE HOT SEAT</span></div>
        ) : (
          <div className="qi-player-hot-seat__state"><strong>BUZZERS CLOSED</strong><span>Eyes on the host.</span></div>
        )}
        {error && <div className="qi-player-hot-seat__error" role="alert">{error}</div>}
      </div>
    );
  }

  if ((phase === "answer" || (phase === "pursuit" && pursuitStatus === "reveal")) && question) {
    const correctText = getCorrectAnswerText(question);
    // Codex #12: this used to compute an authoritative verdict ONLY for
    // multiple choice (comparing the picked letter key to the correct key),
    // and every other type — text/number/sequence/multi_tap/picture/audio —
    // just showed the correct answer next to "Your answer: ..." with no
    // CORRECT/INCORRECT verdict, leaving the player to work out for
    // themselves whether they'd got it right. isAnswerCorrect is now the same
    // function autoScore uses to award points (lib/quiz/answerScoring.ts), so
    // reusing it here for every type can never disagree with the real score -
    // it just needs the exact string that was actually submitted for
    // answer_text, which differs by type (MC/multi_tap submit key(s), the
    // rest submit the same display text shown in mySubmittedDisplay).
    const submittedAnswerText = question.question_type === "multiple_choice"
      ? selectedAnswer
      : question.question_type === "multi_tap"
        ? tappedItems.join(",")
        : mySubmittedDisplay;
    const verdict = submitted && submittedAnswerText
      ? isAnswerCorrect({ answer_text: submittedAnswerText }, question)
      : null;
    return (
      <div className={"fbl fbl-phone qi-player-state qi-player-answer" + (verdict === true ? " is-correct" : verdict === false ? " is-incorrect" : "")} style={{ height: "100dvh", overflow: "hidden", display: "flex", flexDirection: "column", padding: 20 }}>
        <PlayerStatusBar teamName={teamName} roundName={roundName} powerCardsEnabled={allowPowerCards} photoUrl={teamPhotoUrl} points={myRunningPoints} />
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" as const, display: "flex", flexDirection: "column" }}>
        {verdict === true ? (
          /* The player's whole moment: did I get it? — one dominant answer. */
          <div style={{ position: "relative", zIndex: 2, margin: "auto 0", textAlign: "center" }}>
            <PlayerResultBanner tone="correct" title="CORRECT">{correctText}</PlayerResultBanner>
          </div>
        ) : (
          <>
            <div style={{ position: "relative", zIndex: 2, fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", fontSize: 14, letterSpacing: ".14em", color: "#B9A8D9", marginBottom: 12 }}>
              {verdict === false ? "INCORRECT" : "ANSWER REVEALED"}
            </div>
            <div style={{ position: "relative", zIndex: 2, font: "700 clamp(15px,4.2vw,17px) 'Inter'", lineHeight: 1.4, marginBottom: 16, color: "rgba(255,255,255,0.6)" }}>{question.question_text.replace(/^Play this track:\s*/i, "").replace(/^Show teams this image:\s*/i, "")}</div>
            <div style={{ position: "relative", zIndex: 2, padding: "18px 20px", borderRadius: 16, background: "rgba(46,224,110,0.15)", border: "1px solid rgba(46,224,110,0.5)", marginBottom: 14 }}>
              <div style={{ font: "700 13px 'Inter'", color: "#2EE06E", letterSpacing: ".18em", marginBottom: 6 }}>CORRECT ANSWER</div>
              <div style={{ font: "800 clamp(24px,7vw,32px) 'Inter'", color: "#2EE06E" }}>{correctText}</div>
            </div>
            {submitted && (
              <div style={{ position: "relative", zIndex: 2, font: "600 14px 'Inter'", color: verdict === false ? "#FF3B4E" : "#B9A8D9", marginBottom: 12 }}>
                Your answer: {mySubmittedDisplay || "(no answer submitted)"}
              </div>
            )}
          </>
        )}
        </div>
        <PowerCards />
      </div>
    );
  }

  if ((phase === "question" || (phase === "hot_seat" && hotSeatTeam === teamName) || (phase === "pursuit" && pursuitStatus === "question")) && question) {
    const isPicture = question.question_type === "picture";
    const isMultiChoice = question.question_type === "multiple_choice";
    const isSequence = question.question_type === "sequence";
    const isMultiTap = question.question_type === "multi_tap";
    const imageUrl = isPicture ? getMediaUrl(question.option_b) : null;

    const isBlocked = !!blockUntil && blockTeam !== teamName && new Date(blockUntil).getTime() > Date.now();
    if (isBlocked && !submitted) {
      return (
        <div className="qi-player-state qi-player-timeout" style={{ height: "100dvh", overflow: "hidden", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 12, textAlign: "center" as const, fontFamily: font }}>
          <div style={{ fontSize: 40 }}>TIME-OUT</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}>{blockTeam} played Time-Out</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", marginTop: 8 }}>{blockSecondsLeft}s</div>
        </div>
      );
    }
    // PICTURE ROUND - show image full screen, tap to dismiss
    if (isPicture && imageUrl) {
      return <PictureQuestion
        imageUrl={imageUrl}
        questionText={question.question_text.replace(/^Show teams this image:\s*/i, "")}
        submitted={submitted}
        answerText={answerText}
        setAnswerText={setAnswerText}
        onSubmit={submitAnswer}
        questionIndex={questionIndex}
        timeLeft={timeLeft}
        purple={purple}
        font={font}
        bg={bg}
        teamName={teamName}
        sessionPin={sessionPin}
        roundNumber={roundNumber}
        allowPowerCards={allowPowerCards}
        points={myRunningPoints}
      />;
    }
    const options = [
      { key: "a", text: question.option_a },
      { key: "b", text: question.option_b },
      { key: "c", text: question.option_c },
      { key: "d", text: question.option_d },
    ].filter(o => o.text) as { key: string; text: string }[];
    const seqItems = [question.option_a, question.option_b, question.option_c, question.option_d].filter(Boolean) as string[];
    const multiTapOptions = [
      { key: "a", text: question.option_a },
      { key: "b", text: question.option_b },
      { key: "c", text: question.option_c },
      { key: "d", text: question.option_d },
      { key: "e", text: question.option_e },
      { key: "f", text: question.option_f },
    ].filter(o => o.text) as { key: string; text: string }[];

    return (
      <div className="qi-player-state qi-player-question-screen" data-answer-type={question.question_type} style={{ height: "100dvh", background: bg, display: "flex", flexDirection: "column", padding: "14px 16px", fontFamily: font, color: "#fff", boxSizing: "border-box" as const, overflow: "hidden" }}>
        <PlayerStatusBar teamName={teamName} roundName={roundName} powerCardsEnabled={allowPowerCards} photoUrl={teamPhotoUrl} points={myRunningPoints} />
        <div className="qi-player-timer-row" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexShrink: 0 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,0.3)" }}>Q{questionIndex + 1}</div>
          {timeLeft !== null && timeLeft > 0 && (
            <div style={{ marginLeft: "auto", width: 44, height: 44, borderRadius: "50%", background: timeLeft <= 3 ? "rgba(239,68,68,0.3)" : "rgba(190,38,193,0.2)", border: "2px solid " + (timeLeft <= 3 ? "#ef4444" : purple), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 800, color: timeLeft <= 3 ? "#ef4444" : purple }}>
              {timeLeft}
            </div>
          )}
        </div>
        {/* The timer stays outside the scroll area, below the team header. */}
        <div className="qi-player-question-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div className="qi-player-question-text">{question.question_text.replace(/^Play this track:\s*/i, "").replace(/^Show teams this image:\s*/i, "")}</div>
        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.5)", color: "#ef4444", fontSize: 13, marginBottom: 10, textAlign: "center" as const }}>{error}</div>
        )}

        {isMultiChoice && (
          <div className="fbl" style={{ marginBottom: 10 }}>
            {options.map(opt => {
              const isSelected = selectedAnswer === opt.key;
              const dim = !!selectedAnswer && !isSelected;
              return (
                <div key={opt.key} className={"opt" + (isSelected ? " sel" : "") + (dim ? " dim" : "")}
                  onClick={() => { if (!submitted) setSelectedAnswer(opt.key); }}>
                  <div className="chip">{opt.key.toUpperCase()}</div>{opt.text}
                </div>
              );
            })}
            {!submitted && (
              <>
                <div className={"lockbar" + (selectedAnswer ? "" : " disabled")}
                  onClick={() => { if (!selectedAnswer) return; const opt = options.find(o => o.key === selectedAnswer); setMySubmittedDisplay(opt?.text || selectedAnswer); submitAnswer(selectedAnswer); }}>
                  {selectedAnswer ? "LOCK IT IN" : "SELECT AN ANSWER"}
                </div>
                {selectedAnswer && <div className="lk-note">Speed bonus draining — lock to bank it</div>}
              </>
            )}
            {submitted && <div className="lk-note" style={{ color: "var(--green)", letterSpacing: "0.2em", fontSize: 13 }}>ANSWER LOCKED IN ✓</div>}
          </div>
        )}

        {isMultiTap && (
          <div className="fbl" style={{ marginBottom: 16 }}>
            <div className="qi-player-multitap-grid" style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {multiTapOptions.map(opt => {
                const isTapped = tappedItems.includes(opt.key);
                return (
                  <button key={opt.key} type="button" className={"qi-player-answer-button" + (isTapped ? " is-selected" : "")}
                    onClick={() => { if (!submitted) setTappedItems(prev => isTapped ? prev.filter(k => k !== opt.key) : [...prev, opt.key]); }}
                    style={{ minHeight: 62, padding: "clamp(10px,1.8dvh,18px) 16px", borderRadius: 14, border: "1px solid", borderColor: isTapped ? "#D94FDC" : "#3A2668", background: isTapped ? "rgba(190,38,193,0.28)" : "#1D1140", boxShadow: isTapped ? "0 0 16px rgba(217,79,220,0.35)" : "none", color: "#fff", textAlign: "left" as const, cursor: submitted ? "default" : "pointer", display: "flex", alignItems: "center", gap: 14, opacity: submitted && !isTapped ? 0.35 : 1 }}>
                    <span style={{ width: "clamp(28px,6dvh,44px)", height: "clamp(28px,6dvh,44px)", borderRadius: 8, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: isTapped ? "#8A1B8D" : "#0A0118", border: "1px solid " + (isTapped ? "#D94FDC" : "#8A1B8D"), color: isTapped ? "#fff" : "#D94FDC", font: "800 clamp(13px,2.6dvh,19px) 'Inter'" }}>{opt.key.toUpperCase()}</span>
                    <span style={{ flex: 1 }}>{opt.text}</span>
                    {isTapped && <span style={{ fontSize: "clamp(16px,3dvh,22px)", color: submitted ? "#2EE06E" : "#D94FDC" }}>{submitted ? "✓" : "●"}</span>}
                  </button>
                );
              })}
            </div>
            {!submitted && (
              <div className={"lockbar" + (tappedItems.length > 0 ? "" : " disabled")}
                onClick={() => { if (tappedItems.length === 0) return; const texts = tappedItems.map(k => multiTapOptions.find(o => o.key === k)?.text || k).join(", "); setMySubmittedDisplay(texts); submitAnswer(tappedItems.join(",")); }}>
                {tappedItems.length > 0 ? `LOCK IN ${tappedItems.length} ANSWER${tappedItems.length === 1 ? "" : "S"}` : "TAP YOUR ANSWERS"}
              </div>
            )}
            {submitted && <div className="lk-note" style={{ color: "var(--green)", letterSpacing: "0.2em", fontSize: 13 }}>ANSWERS LOCKED IN ✓</div>}
          </div>
        )}

        {isSequence && (
          <SequenceQuestion options={seqItems} onSubmit={(text) => { setMySubmittedDisplay(text); submitAnswer(text); }} submitted={submitted} />
        )}

        {!isMultiChoice && !isSequence && !isMultiTap && !submitted && (
          <div style={{ marginBottom: 16 }}>
            <AnswerKeypad mode={question.question_type === "number" ? "number" : "text"} onSubmit={(text) => { setMySubmittedDisplay(text); submitAnswer(text); }} />
          </div>
        )}

        {submitted && (
          <PlayerResultBanner tone="locked" title="LOCKED IN ✓">{mySubmittedDisplay || "Waiting for the reveal"}</PlayerResultBanner>
        )}
        </div>
        {phase === "hot_seat" ? <div className="qi-player-cards-paused">You are in the Hot Seat</div> : allowPowerCards ? (
          <div style={{ flexShrink: 0, paddingTop: 10, paddingBottom: 4, borderTop: "1px solid rgba(255,255,255,0.06)", background: bg }}>
            <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} roundNumber={roundNumber} compact={true} enabled={allowPowerCards} />
          </div>
        ) : <div className="qi-player-cards-paused">Power Cards unavailable this round</div>}
      </div>
    );
  }

  // FINALE — podium / final-standings reveal. The handset must follow the same
  // current-session finale phase as the Display instead of dropping back to the
  // lobby "You are In!" confirmation. It shows an "Eyes Up" watch-the-screen
  // state during the live reveal, then this team's own final position once the
  // podium (trophy) is shown.
  if (phase === "quiz_end") {
    const sortedFinal = [...phoneScoreboardData].sort((a, b) => b.total_points - a.total_points);
    const myIndex = sortedFinal.findIndex(s => s.team_name === teamName);
    const myRank = myIndex >= 0 ? myIndex + 1 : null;
    const myScore = myIndex >= 0 ? sortedFinal[myIndex].total_points : null;
    const revealComplete = quizEndTrophyVisible || (sortedFinal.length > 0 && quizEndRevealedCount >= sortedFinal.length);
    const myRankRevealed = myRank !== null && (quizEndTrophyVisible || (sortedFinal.length - quizEndRevealedCount) < myRank);
    const ordinal = (n: number) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
    return (
      <div className="fbl fbl-phone qi-player-state qi-player-finale" style={{ height: "100dvh", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 14, textAlign: "center" as const }}>
        <div style={{ position: "relative", zIndex: 2, font: "700 13px 'Inter'", letterSpacing: 4, color: "#B9A8D9" }}>{revealComplete ? "FINAL RESULTS" : "FINAL STANDINGS"}</div>
        {!myRankRevealed ? (
          <>
            <Crest initials={teamInitials(teamName)} size={72} dim />
            <div style={{ position: "relative", zIndex: 2, font: "800 26px 'Inter'", color: purple, letterSpacing: 2 }}>EYES UP</div>
            <div style={{ position: "relative", zIndex: 2, font: "600 15px 'Inter'", color: "#B9A8D9" }}>Watch the big screen for the results…</div>
          </>
        ) : (
          <>
            <Crest initials={teamInitials(teamName)} size={teamPhotoUrl ? (myRank === 1 ? 148 : 128) : (myRank === 1 ? 104 : 84)} gold={!!myRank && myRank <= 3} photoUrl={getMediaUrl(teamPhotoUrl)} />
            {/* Rank is the single thing the player wants — make it the hero. */}
            <div style={{ position: "relative", zIndex: 2, font: "900 clamp(46px,17vw,80px) 'Inter'", color: myRank && myRank <= 3 ? "#E8C36A" : "#fff", lineHeight: 1, textShadow: myRank && myRank <= 3 ? "0 0 30px rgba(232,195,106,.5)" : "none" }}>{myRank ? ordinal(myRank) : "—"}</div>
            <div style={{ position: "relative", zIndex: 2, font: "800 24px 'Inter'", color: "#fff", letterSpacing: 1 }}>{teamName}</div>
            {myScore !== null && (
              <div style={{ position: "relative", zIndex: 2, padding: "14px 34px", borderRadius: 16, background: "rgba(190,38,193,0.15)", border: "2px solid rgba(190,38,193,0.45)", marginTop: 4 }}>
                <div style={{ font: "700 11px 'Inter'", letterSpacing: 3, color: "#B9A8D9", marginBottom: 4 }}>FINAL SCORE</div>
                <div style={{ font: "900 46px 'Inter'", color: "#D94FDC", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{myScore}</div>
              </div>
            )}
            <div style={{ position: "relative", zIndex: 2, font: "400 13px 'Inter'", color: "#6B5A8E", marginTop: 8 }}>Full results on the big screen</div>
          </>
        )}
      </div>
    );
  }

  // WAITING (lobby) — approved Fable handset "WAITING" state: crest birth,
  // team name, waiting line + room count. Power-card selector preserved below.
  return (
    <div className="fbl fbl-phone qi-player-state qi-player-waiting" style={{ height: "100dvh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <PlayerStatusBar teamName={teamName} roundName={roundName} powerCardsEnabled={allowPowerCards} photoUrl={teamPhotoUrl} points={myRunningPoints} />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 14, textAlign: "center", position: "relative", zIndex: 2 }}>
        <Crest initials={teamInitials(teamName)} size={teamPhotoUrl ? 148 : 88} photoUrl={getMediaUrl(teamPhotoUrl)} />
        <div style={{ font: "800 clamp(22px,6.6vw,30px) 'Inter'", color: "#fff" }}>{teamName}</div>
        <div style={{ font: "600 clamp(15px,4.6vw,18px) 'Inter'", color: "#B9A8D9", lineHeight: 1.45 }}>
          Waiting for your host…
          {allTeamNames.length > 0 && (
            <>
              <br />
              {allTeamNames.length} team{allTeamNames.length === 1 ? "" : "s"} in the room tonight
            </>
          )}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", padding: "0 14px 10px" }}>
        <TeamPhotoUpload sessionPin={sessionPin} teamName={teamName} />
      </div>
      {/* Bottom padding reserves room for the fixed "Quiz-It · Powered by..."
          brand pill (join-form.tsx, position:fixed bottom:10) that sits on
          top of every phase screen - without it, the power cards' own
          "X OF Y CARDS REMAINING" caption sat flush against the viewport
          bottom and visually collided with that pill. */}
      <div style={{ paddingBottom: 46 }}>
        {allowPowerCards ? <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} roundNumber={roundNumber} compact enabled={allowPowerCards} /> : <div className="qi-player-cards-paused">Power Cards unavailable this round</div>}
      </div>
    </div>
  );
}
