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

export default function SessionPage() {
  const [pin, setPin] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [status, setStatus] = useState<"waiting" | "active" | "finished">("waiting");
  const [creating, setCreating] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

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
          setTeams(prev => [...prev, newTeam]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [pin]);

  async function createSession() {
    setCreating(true);
    const newPin = generatePin();
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("sessions")
      .insert({ pin: newPin, status: "waiting" })
      .select()
      .single();
    if (!error && data) {
      setPin(newPin);
      setSessionId(data.id);
      setTeams([]);
      setStatus("waiting");
    }
    setCreating(false);
  }

  async function startQuiz() {
    if (!sessionId) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ status: "active" }).eq("id", sessionId);
    setStatus("active");
  }

  async function endQuiz() {
    if (!sessionId) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ status: "finished" }).eq("id", sessionId);
    setStatus("finished");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#07030f", color: "#fff", padding: "24px", fontFamily: "sans-serif", maxWidth: "800px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#1a0530", border: "2px solid #BE26C1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#BE26C1", fontWeight: 700 }}>ME</div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#BE26C1", letterSpacing: 4 }}>Quiz Session</div>
          <div style={{ fontSize: 11, color: "rgba(190,38,193,0.6)", letterSpacing: 2 }}>Quiz-It powered by Mac Entertainment</div>
        </div>
        <div style={{ flex: 1 }} />
        <a href="/host/rounds" style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(190,38,193,0.4)", color: "#BE26C1", textDecoration: "none", fontSize: 12, letterSpacing: 2 }}>Rounds</a>
      </div>

      {!pin && (
        <div style={{ textAlign: "center", marginTop: 80 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, letterSpacing: 4 }}>Ready to start?</div>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 32 }}>Create a session to get your PIN. Teams joiat quiz-it-six.vercel.app/join</div>
          <button onClick={createSession} disabled={creating} style={{ padding: "16px 48px", borderRadius: 12, background: "#BE26C1", color: "#fff", border: "none", fontSize: 18, letterSpacing: 4, cursor: "pointer" }}>
            {creating ? "Creating..." : "Create Session"}
          </button>
        </div>
      )}

      {pin && (
        <div>
          <div style={{ background: "#0d0520", border: "2px solid #BE26C1", borderRadius: 16, padding: 24, marginBottom: 24, textAlign: "center" }}>
            <div style={{ fontSize: 11, letterSpacing: 4, color: "rgba(190,38,193,0.6)", marginBottom: 8 }}>TEAMS JOIN AT quiz-it-six.vercel.app/join WITH PIN</div>
            <div style={{ fontSize: 80, fontWeight: 700, letterSpacing: 16, color: "#fff", textShadow: "0 0 30px rgba(190,38,193,0.8)", fontFamily: "monospace" }}>{pin}</div>
            <div style={{ marginTop: 12, fontSize: 12, color: "#555" }}>
              Status: <span style={{ color: status === "waiting" ? "#fbbf24" : status === "active" ? "#22c55e" : "#ef4444", fontWeight: 700 }}>{status.toUpperCase()}</span>
            </div>
          </div>

          <div style={{ background: "#0d0520", border: "1px solid rgba(190,38,193,0.25)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Teams Joined <span style={{ color: "#BE26C1" }}>{teams.length}</span></div>
              <button onClick={() => loadTeams(pin)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(190,38,193,0.4)", background: "transparent", color: "#BE26C1", cursor: "pointer", fontSize: 12 }}>Refresh</button>
            </div>

            {teams.length === 0 && (
              <div style={{ textAlign: "center", color: "#555", padding: "32px 0", fontSize: 13 }}>
                Waiting for teams to join...
              </div>
            )}

            {teams.map((team, i) => (
              <div key={team.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, background: "#0f0f1a", marginBottom: 6 }}>
                <span style={{ color: "#BE26C1", fontWeight: 700, minWidth: 24 }}>{i + 1}.</span>
                <span style={{ fontWeight: 600, flex: 1 }}>{team.team_name}</span>
                <span style={{ fontSize: 11, color: "#555" }}>{team.victory_song?.replace(/[-_]SQS$/i, "").replace(/[-_]+$/, "").trim()}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            {status === "waiting" && (
              <button onClick={startQuiz} disabled={teams.length === 0} style={{ flex: 1, padding: 14, borderRadius: 10, background: teams.length > 0 ? "#22c55e" : "#1a1a1a", color: teams.length > 0 ? "#fff" : "#444", border: "none", fontSize: 16, letterSpacing: 4, cursor: teams.length > 0 ? "pointer" : "not-allowed" }}>
                Start Quiz ({teams.length} teams)
              </button>
            )}
            {status === "active" && (
              <button onClick={endQuiz} style={{ flex: 1, padding: 14, borderRadius: 10, background: "#ef4444", color: "#fff", border: "none", fontSize: 16, letterSpacing: 4, cursor: "pointer" }}>
                End Quiz
              </button>
            )}
            <button onClick={createSession} style={{ padding: "14px 24px", borderRadius: 10, background: "transparent", border: "1px solid #333", color: "#555", fontSize: 13, cursor: "pointer" }}>
              New Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
