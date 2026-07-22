"use client";
import { useEffect, useState, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { HostShell, HostButton, HostInput, HostLabel, HostFrame, HostBody, HostPad, HostCrest, HostLoading, TopSpacer, Pill } from "@/components/fable/HostConsole";

const STAGE_BG = "radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";

type Team = {
  id: string;
  team_name: string;
  victory_song: string;
  session_pin: string;
  created_at: string;
};

type QuizOption = { id: string; name: string; quiz_rounds: { id: string }[] };
type PreparedEvent = { id: string; event_name: string; event_date: string; start_time: string; end_time: string | null; venue_record_id: string | null; quiz_definition_id: string; brand_kit: string | null; music_pack: string | null; sponsors: string[]; prizes: string | null; notes: string | null; special_offers: string | null; overrides: Record<string, unknown>; venue: { venue_name: string; venue_logo_url: string | null; address: string | null; hero_image_url?: string | null; gallery_images?: string[]; google_maps_url?: string | null; contact_name?: string | null; contact_email?: string | null; contact_phone?: string | null; website?: string | null; social_links?: Record<string,string>; food_offers?: string | null; drink_offers?: string | null; happy_hour?: string | null; prize_information?: string | null; sponsors?: string[]; brand_colours?: Record<string,string>; display_slides?: string[]; display_adverts?: string[]; default_brand_kit?: string | null; default_music_pack?: string | null } | null };

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

const HOST_STORAGE_KEY = "quizit_host_session";

export default function SessionPage() {
  const [pin, setPin] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [status, setStatus] = useState<"waiting" | "active" | "finished">("waiting");
  const [creating, setCreating] = useState(false);
  const [reconnectPin, setReconnectPin] = useState("");
  const [reconnectError, setReconnectError] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const [recentSessions, setRecentSessions] = useState<{ pin: string; status: string; created_at: string; teamCount: number }[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [restoringHost, setRestoringHost] = useState(true);
  const [intermissionOffers, setIntermissionOffers] = useState("");
  const [intermissionWhatsapp, setIntermissionWhatsapp] = useState("");
  const [intermissionOtherQuizzes, setIntermissionOtherQuizzes] = useState("");
  const [savingIntermission, setSavingIntermission] = useState(false);
  const [intermissionOpen, setIntermissionOpen] = useState(false);
  const [venueName, setVenueName] = useState("");
  const [venueLogoUrl, setVenueLogoUrl] = useState<string | null>(null);
  const [quizzes, setQuizzes] = useState<QuizOption[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState("");
  const [sessionQuizName, setSessionQuizName] = useState("");
  const [createError, setCreateError] = useState("");
  const [preparedEvent, setPreparedEvent] = useState<PreparedEvent | null>(null);

  useEffect(() => {
    createSupabaseBrowserClient().from("quizzes").select("id,name,quiz_rounds(id)").eq("archived", false).order("updated_at", { ascending: false }).then(({ data }) => setQuizzes((data ?? []) as QuizOption[]));
  }, []);

  useEffect(() => {
    const eventId = new URLSearchParams(window.location.search).get("event");
    if (!eventId) return;
    createSupabaseBrowserClient().from("events").select("id,event_name,event_date,start_time,end_time,venue_record_id,quiz_definition_id,brand_kit,music_pack,sponsors,prizes,notes,special_offers,overrides,venue:venues!events_venue_record_id_fkey(*)").eq("id", eventId).maybeSingle().then(({ data, error }) => {
      // A Calendar Event only schedules a quiz - it does not require one to
      // exist. This is the point where a valid assigned quiz actually becomes
      // mandatory, since a live session cannot run without round content.
      if (error || !data?.quiz_definition_id) { setCreateError(error?.message || "This event doesn't have a Quiz Plan assigned yet. Go back to the Calendar and attach one before launching."); return; }
      const venue = Array.isArray(data.venue) ? data.venue[0] : data.venue;
      const prepared = { ...data, venue: venue || null } as PreparedEvent;
      setPreparedEvent(prepared); setSelectedQuizId(prepared.quiz_definition_id); setVenueName(prepared.venue?.venue_name || ""); setVenueLogoUrl(prepared.venue?.venue_logo_url || null);
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = localStorage.getItem(HOST_STORAGE_KEY);
        if (!saved) { setRestoringHost(false); return; }
        const parsed = JSON.parse(saved);
        if (!parsed?.pin || !parsed?.sessionId) { setRestoringHost(false); return; }
        // Same staleness guard as the player join page - a quiz night is a bounded
        // event, so don't silently restore a session from hours/days ago just
        // because nobody explicitly marked it "finished".
        const MAX_HOST_SESSION_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours
        if (!parsed.savedAt || (Date.now() - parsed.savedAt) > MAX_HOST_SESSION_AGE_MS) {
          localStorage.removeItem(HOST_STORAGE_KEY);
          setRestoringHost(false);
          return;
        }
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.from("sessions").select("*").eq("id", parsed.sessionId).single();
        if (data && data.status !== "finished") {
          setPin(parsed.pin);
          setSessionId(parsed.sessionId);
          setStatus(data.status);
          setIntermissionOffers(data.intermission_offers || "");
          setIntermissionWhatsapp(data.intermission_whatsapp || "");
          setIntermissionOtherQuizzes(data.intermission_other_quizzes || "");
          setVenueName(data.venue_name || "");
          setVenueLogoUrl(data.venue_logo_url || null);
          setSelectedQuizId(data.quiz_id || "");
          const { data: teamData } = await supabase.from("teams").select("*").eq("session_pin", parsed.pin).order("created_at", { ascending: true });
          if (teamData) setTeams(teamData);
        } else {
          localStorage.removeItem(HOST_STORAGE_KEY);
        }
      } catch {
      } finally {
        setRestoringHost(false);
      }
    })();
  }, []);
  const loadTeams = useCallback(async (sessionPin: string) => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase
      .from("teams")
      .select("*")
      .eq("session_pin", sessionPin)
      .order("created_at", { ascending: true });
    if (data) setTeams(data);
  }, []);

  useEffect(() => {
    if (!pin) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("teams-" + pin)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "teams" }, (payload) => {
        const newTeam = payload.new as Team;
        if (newTeam.session_pin === pin) {
          setTeams(prev => prev.some(t => t.id === newTeam.id) ? prev : [...prev, newTeam]);
        }
      })
      .subscribe();
    // Safety-net polling in case realtime delivery is missed
    const pollInterval = setInterval(() => { loadTeams(pin); }, 4000);
    return () => { supabase.removeChannel(channel); clearInterval(pollInterval); };
  }, [pin, loadTeams]);

  async function createSession() {
    if (!selectedQuizId) { setCreateError("Select a quiz before creating the live session."); return; }
    setCreating(true);
    setCreateError("");
    const newPin = generatePin();
    const supabase = createSupabaseBrowserClient();
    const today = new Date().getDay();
    const { data: venueData } = preparedEvent ? { data: preparedEvent.venue } : await supabase.from("venues").select("*").eq("day_of_week", today).maybeSingle();
    const quizName = quizzes.find(quiz => quiz.id === selectedQuizId)?.name || "";
    const inheritedOffers = preparedEvent?.special_offers || [preparedEvent?.venue?.food_offers, preparedEvent?.venue?.drink_offers, preparedEvent?.venue?.happy_hour].filter(Boolean).join("\n");
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        pin: newPin,
        status: "waiting",
        quiz_id: selectedQuizId,
        event_id: preparedEvent?.id || null,
        venue_record_id: preparedEvent?.venue_record_id || null,
        quiz_plan_name: quizName,
        event_snapshot: preparedEvent ? { event_name: preparedEvent.event_name, event_date: preparedEvent.event_date, start_time: preparedEvent.start_time, end_time: preparedEvent.end_time, venue: preparedEvent.venue, brand_kit: preparedEvent.brand_kit || preparedEvent.venue?.default_brand_kit, music_pack: preparedEvent.music_pack || preparedEvent.venue?.default_music_pack, sponsors: preparedEvent.sponsors.length ? preparedEvent.sponsors : preparedEvent.venue?.sponsors, prizes: preparedEvent.prizes || preparedEvent.venue?.prize_information, offers: inheritedOffers, notes: preparedEvent.notes, overrides: preparedEvent.overrides, quiz_plan_id: selectedQuizId, quiz_plan_name: quizName } : { quiz_plan_id: selectedQuizId, quiz_plan_name: quizName },
        venue_name: venueData?.venue_name || null,
        venue_logo_url: venueData?.venue_logo_url || null,
        intermission_offers: inheritedOffers || null,
      })
      .select()
      .single();
    if (!error && data) {
      const { data: quizRounds, error: roundsError } = await supabase.from("quiz_rounds").select("*").eq("quiz_id", selectedQuizId).order("position");
      if (roundsError || !quizRounds?.length) {
        await supabase.from("sessions").delete().eq("id", data.id);
        setCreateError(roundsError?.message || "This quiz has no rounds. Add rounds in Quiz Builder first.");
        setCreating(false);
        return;
      }
      const { data: snapshots, error: snapshotError } = await supabase.from("session_rounds").insert(quizRounds.map(round => ({ session_id: data.id, source_quiz_round_id: round.id, source_round_id: round.source_round_id, position: round.position, name: round.name, round_type: round.round_type, difficulty: round.difficulty, questions: round.questions, hide_leaderboard: round.hide_leaderboard, allow_power_cards: round.allow_power_cards, notes: round.notes, sponsor: round.sponsor }))).select("id,position").order("position");
      if (snapshotError || !snapshots?.length) {
        await supabase.from("sessions").delete().eq("id", data.id);
        setCreateError(snapshotError?.message || "Could not snapshot this quiz.");
        setCreating(false);
        return;
      }
      await supabase.from("sessions").update({ current_session_round_id: snapshots[0].id }).eq("id", data.id);
      if (preparedEvent) await supabase.from("events").update({ status: "live", updated_at: new Date().toISOString() }).eq("id", preparedEvent.id);
      setPin(newPin);
      setSessionId(data.id);
      localStorage.setItem(HOST_STORAGE_KEY, JSON.stringify({ pin: newPin, sessionId: data.id, savedAt: Date.now() }));
      setTeams([]);
      setStatus("waiting");
      setIntermissionOffers(data.intermission_offers || "");
      setIntermissionWhatsapp(data.intermission_whatsapp || "");
      setIntermissionOtherQuizzes(data.intermission_other_quizzes || "");
      setVenueName(data.venue_name || "");
      setVenueLogoUrl(data.venue_logo_url || null);
      setSessionQuizName(quizzes.find(quiz => quiz.id === selectedQuizId)?.name || "");
    }
    if (error) setCreateError(error.message);
    setCreating(false);
  }

  async function saveIntermission() {
    if (!sessionId) return;
    setSavingIntermission(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({
      intermission_offers: intermissionOffers,
      intermission_whatsapp: intermissionWhatsapp,
      intermission_other_quizzes: intermissionOtherQuizzes,
      venue_name: venueName,
      venue_logo_url: venueLogoUrl,
    }).eq("id", sessionId);
    setSavingIntermission(false);
  }
  async function startQuiz() {
    if (!sessionId || !pin) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ status: "active" }).eq("id", sessionId);
    setStatus("active");
    window.location.href = "/host/quiz?pin=" + pin;
  }

  async function loadRecentSessions() {
    setLoadingRecent(true);
    setShowRecent(true);
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase
      .from("sessions")
      .select("pin, status, created_at")
      .neq("status", "finished")
      .order("created_at", { ascending: false })
      .limit(8);
    if (data) {
      const withCounts = await Promise.all(
        data.map(async (s) => {
          const { count } = await supabase.from("teams").select("*", { count: "exact", head: true }).eq("session_pin", s.pin);
          return { pin: s.pin, status: s.status, created_at: s.created_at, teamCount: count || 0 };
        })
      );
      setRecentSessions(withCounts);
    }
    setLoadingRecent(false);
  }

  async function reconnectToSession() {
    if (reconnectPin.trim().length !== 4 || reconnecting) return;
    setReconnecting(true);
    setReconnectError("");
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.from("sessions").select("*").eq("pin", reconnectPin.trim()).single();
    if (error || !data) {
      setReconnecting(false);
      setReconnectError("No session found with that PIN.");
      return;
    }
    setPin(data.pin);
    setSessionId(data.id);
    localStorage.setItem(HOST_STORAGE_KEY, JSON.stringify({ pin: data.pin, sessionId: data.id, savedAt: Date.now() }));
    setStatus(data.status);
    setIntermissionOffers(data.intermission_offers || "");
    setIntermissionWhatsapp(data.intermission_whatsapp || "");
    setIntermissionOtherQuizzes(data.intermission_other_quizzes || "");
    setVenueName(data.venue_name || "");
    setVenueLogoUrl(data.venue_logo_url || null);
    setSelectedQuizId(data.quiz_id || "");
    const { data: teamData } = await supabase.from("teams").select("*").eq("session_pin", data.pin).order("created_at", { ascending: true });
    if (teamData) setTeams(teamData);
    setReconnecting(false);
    setReconnectPin("");
  }

  async function endQuiz() {
    if (!sessionId) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ status: "finished" }).eq("id", sessionId);
    if (preparedEvent) await supabase.from("events").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", preparedEvent.id);
    setStatus("finished");
  }

  async function launchDisplay() {
    if (!pin) return;
    try {
      if ("getScreenDetails" in window) {
        const details = await (window as unknown as { getScreenDetails: () => Promise<{ screens: { isPrimary: boolean; left: number; top: number; width: number; height: number }[] }> }).getScreenDetails();
        const screens = details.screens;
        const target = screens.find((s) => !s.isPrimary) || screens[screens.length - 1];
        if (target && screens.length > 1) {
          window.open("/host/display?pin=" + pin, "display", "left=" + target.left + ",top=" + target.top + ",width=" + target.width + ",height=" + target.height);
          return;
        }
      }
    } catch {}
    window.open("/host/display?pin=" + pin, "display", "width=1920,height=1080");
  }

  const textareaStyle: React.CSSProperties = { width: "100%", padding: "11px 14px", borderRadius: 14, background: "#150A2E", color: "#fff", border: "1px solid #2E1A52", fontSize: 13, fontFamily: "'Inter',sans-serif", marginBottom: 10, outline: "none", resize: "vertical" };
  const host = typeof window !== "undefined" ? window.location.host : "quiz-it.macentertainmentuae.com";

  if (restoringHost) {
    return (
      <HostShell>
        <div style={{ minHeight: "100vh", background: STAGE_BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <HostLoading title="Session Recovery" note="Restoring your show — everything is safe." />
        </div>
      </HostShell>
    );
  }

  return (
    <HostShell>
      <div style={{ minHeight: "100vh", background: STAGE_BG, color: "#fff", padding: "24px 32px" }}>
        {/* TOP BAR — wordmark · breadcrumb · fixed nav */}
        <div className="fbh-top" style={{ border: "1px solid #2E1A52", borderRadius: 16, marginBottom: 24 }}>
          <img src="/me-logo.jpg" alt="ME" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} />
          <span className="fbh-wm" style={{ fontSize: 16 }}><span className="q">QUIZ-</span>IT</span>
          <span className="fbh-bc">Session Creation</span>
          <TopSpacer />
          <a className="fbh-btn" href="/host/events">Events</a>
          <a className="fbh-btn" href="/host/rounds">Rounds</a>
          <a className="fbh-btn" href="/host/quizzes">Quiz Plans</a>
          <a className="fbh-btn pri" href={"/host/quiz?pin=" + (pin || "")}>Quiz Controller</a>
          <a className="fbh-btn" href="/host/questions">Questions</a>
          <HostButton onClick={launchDisplay} disabled={!pin}>Launch Display</HostButton>
        </div>

        {/* EMPTY STATE — no session yet: create + recover */}
        {!pin && (
          <HostFrame>
            <HostBody>
              <HostPad>
                <div className="fbh-center" style={{ minHeight: 220 }}>
                  <div className="fbh-stage-title" style={{ fontSize: 17 }}>No Show Yet</div>
                  <div style={{ font: "400 13px 'Inter'", color: "#B9A8D9", margin: "8px 0 18px", lineHeight: 1.6, maxWidth: 380 }}>
                    {preparedEvent ? `${preparedEvent.event_name} · ${preparedEvent.venue?.venue_name || "Venue not assigned"}` : `Your first quiz night is one decision away. Teams join at ${host}/join`}
                  </div>
                  <div style={{ width: "100%", maxWidth: 420, marginBottom: 14, textAlign: "left" }}><HostLabel>Quiz Plan</HostLabel><select value={selectedQuizId} onChange={e => setSelectedQuizId(e.target.value)} disabled={!!preparedEvent} className="fbh-input" style={{ width: "100%", minHeight: 48 }}><option value="">Select a prepared Quiz Plan…</option>{quizzes.map(quiz => <option key={quiz.id} value={quiz.id} disabled={!quiz.quiz_rounds.length}>{quiz.name} ({quiz.quiz_rounds.length} rounds)</option>)}</select></div>
                  <HostButton variant="pri" big onClick={createSession} disabled={creating || !selectedQuizId}>
                    {creating ? "CREATING…" : "CREATE A SESSION"}
                  </HostButton>
                  {createError && <div role="alert" style={{ color: "#D94FDC", marginTop: 10 }}>{createError}</div>}
                  {!quizzes.length && <a className="fbh-btn" href="/host/quizzes" style={{ marginTop: 12 }}>Build your first quiz</a>}
                </div>

                <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #2E1A52", maxWidth: 460, marginInline: "auto" }}>
                  <HostLabel>Already have a session running?</HostLabel>
                  <div style={{ display: "flex", gap: 8 }}>
                    <HostInput
                      value={reconnectPin}
                      onChange={e => setReconnectPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      onKeyDown={e => e.key === "Enter" && reconnectToSession()}
                      placeholder="PIN"
                      maxLength={4}
                      style={{ width: 140, textAlign: "center", letterSpacing: "0.4em", fontVariantNumeric: "tabular-nums", fontSize: 18 }}
                    />
                    <HostButton onClick={reconnectToSession} disabled={reconnectPin.length !== 4 || reconnecting}>
                      {reconnecting ? "RECONNECTING…" : "RECONNECT"}
                    </HostButton>
                  </div>
                  {reconnectError && <div style={{ marginTop: 10, font: "600 12px 'Inter'", color: "#D94FDC" }}>{reconnectError}</div>}

                  {!showRecent ? (
                    <button onClick={loadRecentSessions} style={{ marginTop: 14, background: "transparent", border: "none", color: "#D94FDC", font: "600 12px 'Inter'", textDecoration: "underline", cursor: "pointer" }}>
                      Don&apos;t know the PIN? Show recent sessions
                    </button>
                  ) : (
                    <div style={{ marginTop: 16 }}>
                      {loadingRecent ? (
                        <div style={{ font: "400 12px 'Inter'", color: "#6B5A8E", textAlign: "center" }}>Loading…</div>
                      ) : recentSessions.length === 0 ? (
                        <div style={{ font: "400 12px 'Inter'", color: "#6B5A8E", textAlign: "center" }}>No recent active sessions found.</div>
                      ) : (
                        recentSessions.map(s => (
                          <button key={s.pin} onClick={() => { setReconnectPin(s.pin); reconnectToSession(); }}
                            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", marginBottom: 6, borderRadius: 12, background: "#150A2E", border: "1px solid #2E1A52", color: "#fff", cursor: "pointer" }}>
                            <span style={{ font: "700 15px 'Inter'", letterSpacing: "0.16em", fontVariantNumeric: "tabular-nums" }}>{s.pin}</span>
                            <span style={{ font: "400 12px 'Inter'", color: "#B9A8D9" }}>{s.teamCount} team{s.teamCount === 1 ? "" : "s"} &middot; {s.status} &middot; {new Date(s.created_at).toLocaleString()}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </HostPad>
            </HostBody>
          </HostFrame>
        )}

        {/* ACTIVE SESSION */}
        {pin && (
          <div>
            {/* PIN HERO */}
            <div style={{ background: "#150A2E", border: "1px solid #8A1B8D", borderRadius: 24, padding: 28, marginBottom: 20, textAlign: "center", boxShadow: "0 0 40px rgba(190,38,193,0.25)" }}>
              <div style={{ font: "600 13px 'Inter'", letterSpacing: "0.24em", color: "#B9A8D9", marginBottom: 10 }}>TEAMS JOIN AT {host}/join WITH PIN</div>
              <div style={{ font: "800 clamp(56px,10vw,96px)/1 'Inter'", letterSpacing: "0.14em", color: "#fff", textShadow: "0 0 46px rgba(190,38,193,0.55)", fontVariantNumeric: "tabular-nums" }}>{pin}</div>
              <div style={{ marginTop: 16, display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
                <span style={{ font: "600 12px 'Inter'", color: "#6B5A8E", letterSpacing: "0.16em" }}>STATUS</span>
                <Pill live={status === "active"}>{status.toUpperCase()}</Pill>
              </div>
              {sessionQuizName && <div style={{ marginTop: 10, color: "#B9A8D9", font: "600 13px 'Inter'" }}>{sessionQuizName}</div>}
            </div>

            {/* INTERMISSION PANEL (collapsible) */}
            <div className="fbh-panel">
              <div onClick={() => setIntermissionOpen(o => !o)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                <h4 style={{ font: "800 13.5px 'Inter'", margin: 0 }}>Intermission Screen</h4>
                <span style={{ font: "600 12px 'Inter'", color: "#D94FDC" }}>{intermissionOpen ? "Hide ▴" : "Edit ▾"}</span>
              </div>
              {intermissionOpen && (
                <>
                  <div style={{ font: "400 12px 'Inter'", color: "#B9A8D9", margin: "12px 0" }}>Shown automatically between rounds on the display and player phones.</div>
                  <textarea value={intermissionOffers} onChange={e => setIntermissionOffers(e.target.value)} placeholder="Venue offers…" rows={2} style={textareaStyle} />
                  <input value={intermissionWhatsapp} onChange={e => setIntermissionWhatsapp(e.target.value)} placeholder="WhatsApp number or link" style={{ ...textareaStyle, resize: undefined }} />
                  <textarea value={intermissionOtherQuizzes} onChange={e => setIntermissionOtherQuizzes(e.target.value)} placeholder="Other quiz nights…" rows={2} style={textareaStyle} />
                  <HostButton variant="pri" onClick={saveIntermission} disabled={savingIntermission}>{savingIntermission ? "SAVING…" : "SAVE INTERMISSION CONTENT"}</HostButton>
                </>
              )}
            </div>

            {/* TEAMS PANEL */}
            <div className="fbh-panel">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h4 style={{ font: "800 15px 'Inter'", margin: 0 }}>Teams Joined <span style={{ color: "#D94FDC" }}>{teams.length}</span></h4>
                <HostButton onClick={() => loadTeams(pin)} style={{ height: 36 }}>Refresh</HostButton>
              </div>
              {teams.length === 0 ? (
                <div style={{ textAlign: "center", color: "#6B5A8E", padding: "28px 0", font: "400 14px 'Inter'" }}>Waiting for teams to join…</div>
              ) : (
                teams.map((team, i) => (
                  <div key={team.id} className="fbh-answer-row">
                    <span className="ord">{i + 1}</span>
                    <HostCrest initials={team.team_name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase()} size={22} />
                    <span className="nm">{team.team_name}</span>
                    <span className="ans">{team.victory_song?.replace(/\s*SQS\s*$/i, "").replace(/[-_]+$/, "").replace(/[-_]/g, " ").trim()}</span>
                  </div>
                ))
              )}
            </div>

            {/* ACTIONS */}
            <div style={{ display: "flex", gap: 12 }}>
              {status === "waiting" && (
                <HostButton variant="pri" big onClick={startQuiz} disabled={teams.length === 0} style={{ flex: 1 }}>
                  START QUIZ ({teams.length} TEAMS)
                </HostButton>
              )}
              {status === "active" && (
                <HostButton big onClick={endQuiz} style={{ flex: 1 }}>END QUIZ</HostButton>
              )}
              <HostButton big onClick={createSession}>NEW SESSION</HostButton>
            </div>
          </div>
        )}
      </div>
    </HostShell>
  );
}
