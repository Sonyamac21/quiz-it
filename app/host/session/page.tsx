"use client";
import { useEffect, useState, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Team = {
  id: string;
  team_name: string;
  victory_song: string;
  session_pin: string;
  created_at: string;
};

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

const HOST_STORAGE_KEY = "quizit_host_session";

export default function SessionPage() {
  const [pin, setPin] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [status, setStatus] = useState<"waiting" | "active" | "finished">("waiting");
  const [creating, setCreating] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [restoringHost, setRestoringHost] = useState(true);
  const [intermissionOffers, setIntermissionOffers] = useState("");
  const [intermissionWhatsapp, setIntermissionWhatsapp] = useState("");
  const [intermissionOtherQuizzes, setIntermissionOtherQuizzes] = useState("");
  const [savingIntermission, setSavingIntermission] = useState(false);
  const [intermissionOpen, setIntermissionOpen] = useState(false);
  const [venueName, setVenueName] = useState("");
  const [venueLogoUrl, setVenueLogoUrl] = useState<string | null>(null);

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
    setCreating(true);
    const newPin = generatePin();
    const supabase = createSupabaseBrowserClient();
    const today = new Date().getDay();
    const { data: venueData } = await supabase.from("venues").select("*").eq("day_of_week", today).maybeSingle();
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        pin: newPin,
        status: "waiting",
        venue_name: venueData?.venue_name || null,
        venue_logo_url: venueData?.venue_logo_url || null,
      })
      .select()
      .single();
    if (!error && data) {
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
    }
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

  async function endQuiz() {
    if (!sessionId) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ status: "finished" }).eq("id", sessionId);
    setStatus("finished");
  }

  if (restoringHost) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #1a0535 0%, #0d0225 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontFamily: "sans-serif" }}>
        Reconnecting...
      </div>
    );
  }
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #1a0535 0%, #0d0225 100%)", color: "#fff", padding: "32px 48px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <img src="/me-logo.jpg" alt="ME" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover" }} />
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#BE26C1", letterSpacing: 4 }}>Quiz Session</div>
          <div style={{ fontSize: 14, color: "rgba(190,38,193,0.8)", letterSpacing: 2 }}>Quiz-It powered by Mac Entertainment</div>
        </div>
        <div style={{ flex: 1 }} />
        <a href="/host/rounds" style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid rgba(190,38,193,0.6)", color: "#BE26C1", textDecoration: "none", fontSize: 14, letterSpacing: 2 }}>Rounds</a>
        <a href={"/host/quiz?pin=" + (pin || "")} style={{ padding: "10px 20px", borderRadius: 8, background: "#BE26C1", color: "#fff", textDecoration: "none", fontSize: 14, letterSpacing: 2 }}>Quiz Controller</a>
          <a href="/host/questions" style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid rgba(190,38,193,0.6)", color: "#BE26C1", textDecoration: "none", fontSize: 14, letterSpacing: 2 }}>Questions</a>
          <button onClick={async () => {
              if (!pin) return;
              try {
                if ("getScreenDetails" in window) {
                  const details = await (window as any).getScreenDetails();
                  const screens = details.screens;
                  const target = screens.find((s: any) => !s.isPrimary) || screens[screens.length - 1];
                  if (target && screens.length > 1) {
                    window.open("/host/display?pin=" + pin, "display", "left=" + target.left + ",top=" + target.top + ",width=" + target.width + ",height=" + target.height);
                    return;
                  }
                }
              } catch {}
              window.open("/host/display?pin=" + pin, "display", "width=1920,height=1080");
            }} disabled={!pin}
            style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid rgba(190,38,193,0.6)", background: "transparent", color: pin ? "#BE26C1" : "rgba(190,38,193,0.3)", fontSize: 14, letterSpacing: 2, cursor: pin ? "pointer" : "not-allowed" }}>Launch Display Screen</button>
      </div>

      {!pin && (
        <div style={{ textAlign: "center", marginTop: 80 }}>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, letterSpacing: 4, color: "#fff" }}>Ready to start?</div>
          <div style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", marginBottom: 40, lineHeight: 1.6 }}>Create a session to get your PIN.<br/>Teams join at {typeof window !== "undefined" ? window.location.host : "quiz-it.macentertainmentuae.com"}/join</div>
          <button onClick={createSession} disabled={creating} style={{ padding: "18px 56px", borderRadius: 12, background: "#BE26C1", color: "#fff", border: "none", fontSize: 20, letterSpacing: 4, cursor: "pointer", boxShadow: "0 0 30px rgba(190,38,193,0.5)" }}>
            {creating ? "Creating..." : "Create Session"}
          </button>
        </div>
      )}

      {pin && (
        <div>
          <div style={{ background: "rgba(45,10,94,0.7)", border: "2px solid #BE26C1", borderRadius: 16, padding: 28, marginBottom: 24, textAlign: "center", boxShadow: "0 0 40px rgba(190,38,193,0.3)" }}>
            <div style={{ fontSize: 15, letterSpacing: 3, color: "rgba(255,255,255,0.8)", marginBottom: 10 }}>TEAMS JOIN AT {typeof window !== "undefined" ? window.location.host : "quiz-it.macentertainmentuae.com"}/join WITH PIN</div>
            <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: 20, color: "#fff", textShadow: "0 0 40px rgba(190,38,193,0.9)", fontFamily: "monospace", lineHeight: 1 }}>{pin}</div>
            <div style={{ marginTop: 16, fontSize: 16, color: "rgba(255,255,255,0.7)" }}>
              Status: <span style={{ color: status === "waiting" ? "#fbbf24" : status === "active" ? "#22c55e" : "#ef4444", fontWeight: 700, fontSize: 18 }}>{status.toUpperCase()}</span>
            </div>
          </div>

          <div style={{ background: "rgba(45,10,94,0.5)", border: "1px solid rgba(190,38,193,0.4)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div onClick={() => setIntermissionOpen(o => !o)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>Intermission Screen</div>
              <span style={{ fontSize: 14, color: "#BE26C1" }}>{intermissionOpen ? "Hide \u25B4" : "Edit \u25BE"}</span>
            </div>
            {intermissionOpen && (
              <>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 12, marginBottom: 12 }}>Shown automatically between rounds on the display and player phones.</div>
                <textarea value={intermissionOffers} onChange={e => setIntermissionOffers(e.target.value)} placeholder="Venue offers..." rows={2} style={{ width:"100%", padding:"10px 12px", borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff", border:"1px solid rgba(190,38,193,0.3)", fontSize:14, marginBottom:10, fontFamily:"sans-serif" }} />
                <input value={intermissionWhatsapp} onChange={e => setIntermissionWhatsapp(e.target.value)} placeholder="WhatsApp number or link" style={{ width:"100%", padding:"10px 12px", borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff", border:"1px solid rgba(190,38,193,0.3)", fontSize:14, marginBottom:10 }} />
                <textarea value={intermissionOtherQuizzes} onChange={e => setIntermissionOtherQuizzes(e.target.value)} placeholder="Other quiz nights..." rows={2} style={{ width:"100%", padding:"10px 12px", borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff", border:"1px solid rgba(190,38,193,0.3)", fontSize:14, marginBottom:10, fontFamily:"sans-serif" }} />
                <button onClick={saveIntermission} disabled={savingIntermission} style={{ padding:"8px 18px", borderRadius:8, background:"rgba(190,38,193,0.3)", border:"1px solid #BE26C1", color:"#fff", fontSize:13, cursor:"pointer" }}>{savingIntermission ? "Saving..." : "Save Intermission Content"}</button>
              </>
            )}
          </div>

          <div style={{ background: "rgba(45,10,94,0.5)", border: "1px solid rgba(190,38,193,0.4)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>Teams Joined <span style={{ color: "#BE26C1" }}>{teams.length}</span></div>
              <button onClick={() => loadTeams(pin)} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid rgba(190,38,193,0.6)", background: "transparent", color: "#BE26C1", cursor: "pointer", fontSize: 14, letterSpacing: 1 }}>Refresh</button>
            </div>

            {teams.length === 0 && (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", padding: "32px 0", fontSize: 16 }}>
                Waiting for teams to join...
              </div>
            )}

            {teams.map((team, i) => (
              <div key={team.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.08)", marginBottom: 8, border: "1px solid rgba(190,38,193,0.2)" }}>
                <span style={{ color: "#BE26C1", fontWeight: 700, minWidth: 28, fontSize: 18 }}>{i + 1}.</span>
                <span style={{ fontWeight: 600, flex: 1, fontSize: 18, color: "#fff" }}>{team.team_name}</span>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}>{team.victory_song?.replace(/\s*SQS\s*$/i, "").replace(/[-_]+$/, "").replace(/[-_]/g, " ").trim()}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            {status === "waiting" && (
              <button onClick={startQuiz} disabled={teams.length === 0} style={{ flex: 1, padding: 16, borderRadius: 10, background: teams.length > 0 ? "#22c55e" : "#1a1a1a", color: teams.length > 0 ? "#fff" : "#555", border: "none", fontSize: 18, letterSpacing: 4, cursor: teams.length > 0 ? "pointer" : "not-allowed", boxShadow: teams.length > 0 ? "0 0 20px rgba(34,197,94,0.4)" : "none" }}>
                Start Quiz ({teams.length} teams)
              </button>
            )}
            {status === "active" && (
              <button onClick={endQuiz} style={{ flex: 1, padding: 16, borderRadius: 10, background: "#ef4444", color: "#fff", border: "none", fontSize: 18, letterSpacing: 4, cursor: "pointer" }}>
                End Quiz
              </button>
            )}
            <button onClick={createSession} style={{ padding: "16px 24px", borderRadius: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)", fontSize: 15, cursor: "pointer" }}>
              New Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
