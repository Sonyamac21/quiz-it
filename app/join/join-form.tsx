"use client";
import { PlayerQuizScreen } from "@/components/PlayerQuizScreen";
import { useState, useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { playShowAudio, stopShowAudio, victorySongAudioFile } from "@/lib/audio/showAudio";
import { prepareParticipantPhoto } from "@/lib/images/prepareParticipantPhoto";

const STORAGE_KEY = "quizit_player_session";

// The victory song list used to be hardcoded here, with several garbled
// legacy-filename titles (e.g. "CC American GIrls SQS") and no way to fix a
// title or add a new track without a code change. It now lives in the
// victory_songs table, managed from the Victory Songs page in Host tools -
// see app/host/victory-songs/page.tsx. `file_ref` is what actually gets
// played/stored on the team row; `title` is what the player sees.
type VictorySong = { id: string; title: string; file_ref: string };

export function JoinForm() {
  const [step, setStep] = useState<"pin" | "name" | "song" | "photo">("pin");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [selectedSong, setSelectedSong] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionPin, setSessionPin] = useState("");
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectName, setReconnectName] = useState("");
  const [reconnectError, setReconnectError] = useState("");
  const [reconnectLoading, setReconnectLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [takenSongs, setTakenSongs] = useState<string[]>([]);
  const [songs, setSongs] = useState<VictorySong[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await createSupabaseBrowserClient()
        .from("victory_songs")
        .select("id,title,file_ref")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      setSongs((data || []) as VictorySong[]);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (!saved) { setRestoring(false); return; }
        const parsed = JSON.parse(saved);
        if (!parsed?.teamName || !parsed?.sessionPin) { setRestoring(false); return; }
        const MAX_SESSION_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours - a quiz night is a bounded event
        const isStale = !parsed.savedAt || (Date.now() - parsed.savedAt) > MAX_SESSION_AGE_MS;
        if (isStale) {
          sessionStorage.removeItem(STORAGE_KEY);
          setRestoring(false);
          return;
        }
        const supabase = createSupabaseBrowserClient();
        const [{ data: session }, { data: team }] = await Promise.all([
          supabase.from("sessions").select("status").eq("pin", parsed.sessionPin).single(),
          supabase.from("teams").select("team_name").eq("session_pin", parsed.sessionPin).eq("team_name", parsed.teamName).maybeSingle(),
        ]);
        if (session && session.status !== "finished" && team) {
          setTeamName(parsed.teamName);
          setSessionPin(parsed.sessionPin);
          setDone(true);
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      } catch {
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  const filtered = songs.filter(s => !takenSongs.includes(s.file_ref) && s.title.toLowerCase().includes(search.toLowerCase()));

  async function handlePinNext(value: string = pin) {
    if (!value.trim() || value.length !== 4) { setPinError("Please enter a 4-digit PIN"); return; }
    setPinLoading(true);
    setPinError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("sessions")
        .select("id, status")
        .eq("pin", value.trim())
        .single();
      // Dignified wrong-PIN per the design: empty the slots, one soft line, no red/shake.
      if (error || !data) { setPin(""); setPinError("That PIN isn't live — check the big screen."); return; }
      if (data.status === "finished") { setPin(""); setPinError("This quiz has already ended."); return; }
      setStep("name");
    } catch { setPin(""); setPinError("Something went wrong. Try again."); }
    finally { setPinLoading(false); }
  }

  function pinPress(d: string) {
    if (pinLoading || pin.length >= 4) return;
    if (pinError) setPinError("");
    const next = pin + d;
    setPin(next);
    if (next.length === 4) setTimeout(() => handlePinNext(next), 140); // auto-submit on 4th digit
  }
  function pinBack() { if (pinError) setPinError(""); setPin(prev => prev.slice(0, -1)); }

  async function handleReconnect() {
    if (!reconnectName.trim()) { setReconnectError("Enter your team name"); return; }
    setReconnectError("");
    setReconnectLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const normalised = reconnectName.trim().toLowerCase();
      const { data } = await supabase.from("teams").select("team_name").eq("session_pin", pin);
      const match = data?.find(t => (t.team_name || "").trim().toLowerCase() === normalised);
      if (!match) {
        setReconnectError("Team not found for this PIN - check the spelling, or register as a new team below.");
        setReconnectLoading(false);
        return;
      }
      setTeamName(match.team_name);
      setSessionPin(pin);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ teamName: match.team_name, sessionPin: pin, savedAt: Date.now() }));
      setDone(true);
    } catch {
      setReconnectError("Something went wrong. Please try again.");
    } finally {
      setReconnectLoading(false);
    }
  }

  async function handleNameNext() {
    if (!teamName.trim()) { setError("Please enter your team name"); return; }
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.from("teams").select("victory_song").eq("session_pin", pin);
      if (data) setTakenSongs(data.map(t => t.victory_song).filter(Boolean));
    } catch {}
    setStep("song");
  }

  function playPreview(fileRef: string) {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    playShowAudio(victorySongAudioFile(fileRef), { channel: "music", volume: 0.5 });
    previewTimerRef.current = setTimeout(() => stopShowAudio("music"), 8000);
  }

  useEffect(() => () => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    stopShowAudio("music");
  }, []);

  useEffect(() => () => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  }, [photoPreviewUrl]);

  function handleSongNext() {
    if (!selectedSong) { setError("Please pick your victory song!"); return; }
    setError("");
    setStep("photo");
  }

  function handlePhotoSelect(file: File) {
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  }

  async function handleJoin() {
    setLoading(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const normalisedName = teamName.trim().toLowerCase();
      const { data: existingTeams } = await supabase.from("teams").select("team_name").eq("session_pin", pin);
      if (existingTeams && existingTeams.some(t => (t.team_name || "").trim().toLowerCase() === normalisedName)) {
        setError("That team name is already taken in this quiz! Please pick a different one.");
        setStep("name");
        setLoading(false);
        return;
      }
      const { data: existingSongs } = await supabase.from("teams").select("victory_song").eq("session_pin", pin);
      if (existingSongs && existingSongs.some(t => t.victory_song === selectedSong)) {
        setError("That song was just taken by another team! Please pick a different one.");
        setSelectedSong("");
        setStep("song");
        setLoading(false);
        return;
      }
      let photoUrl: string | null = null;
      if (photoFile) {
        const preparedPhoto = await prepareParticipantPhoto(photoFile);
        const path = pin + "-" + teamName.trim().replace(/\s+/g, "-").toLowerCase() + "-" + Date.now() + ".jpg";
        const { error: uploadError } = await supabase.storage.from("team-photos").upload(path, preparedPhoto, {
          contentType: "image/jpeg",
          cacheControl: "3600",
        });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("team-photos").getPublicUrl(path);
          photoUrl = urlData?.publicUrl || null;
        }
      }
      const { error: dbError } = await supabase.from("teams").insert({
        team_name: teamName.trim(),
        name: teamName.trim(),
        victory_song: selectedSong,
        session_pin: pin,
        photo_url: photoUrl,
      });
      if (dbError) {
        // Postgres unique_violation (23505) means another team's insert won
        // the race for this song (or name) between our pre-check and now —
        // the pre-check above is only a fast UX filter, this DB constraint
        // is the real guarantee. Send the team back to pick again instead
        // of silently creating a duplicate.
        if (dbError.code === "23505") {
          setError("That song was just taken by another team! Please pick a different one.");
          setSelectedSong("");
          setStep("song");
          setLoading(false);
          return;
        }
        throw dbError;
      }
      setSessionPin(pin);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ teamName: teamName.trim(), sessionPin: pin, savedAt: Date.now() }));
      setDone(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

    if (restoring) {
      return <div className="qi-player-loading" role="status"><span aria-hidden="true" />Reconnecting…</div>;
    }
    if (done) {
      return (
        <div className="qi-player-live-root">
          {/* Trim here to match how team_name is written everywhere else
              (join insert, sessionStorage restore) - an untrimmed name here
              caused answers to be written under a slightly different string
              than the team's DB row, so the host's per-team "waiting..."
              status silently never matched even though the aggregate
              answered-count (which doesn't compare names) looked correct. */}
          <PlayerQuizScreen teamName={teamName.trim()} sessionPin={sessionPin} />
          {/* Persistent branding overlay - sits on top of every phase screen
              PlayerQuizScreen renders internally, instead of needing to be
              threaded through each of its many separate return branches. */}
          <div style={{
            position: "fixed", bottom: 10, right: 12, zIndex: 9999,
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 10px", borderRadius: 999,
            background: "rgba(13,2,37,0.6)", border: "1px solid rgba(190,38,193,0.3)",
            pointerEvents: "none" as const,
          }}>
            <img src="/me-logo.jpg" alt="ME" style={{ width: 16, height: 16, borderRadius: "50%" }} />
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: 0.3 }}>
              <span style={{ fontFamily: "'Bruno Ace SC',sans-serif" }}>Quiz-It</span><span style={{ fontFamily: "'Inter',sans-serif" }}> · Powered by Mac Entertainment · by Sonya Mac</span>
            </span>
          </div>
        </div>
      );
    }

  if (step === "pin") {
    return (
      <div className="fbl qi-player-join-card qi-player-pin" style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column" }}>
        <div className="pj-wm wm"><span className="q">QUIZ-</span>IT</div>
        <div className="pj-title">Enter tonight&rsquo;s PIN</div>
        <div className="pj-slots">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={"pj-slot" + (i < pin.length ? " filled" : i === pin.length && !pinLoading ? " next" : "")}>{pin[i] ?? ""}</div>
          ))}
        </div>
        {pinError
          ? <div className="pj-err">{pinError}</div>
          : <div className="pj-hint">{pinLoading ? "Checking…" : "It's the big number on the screen."}</div>}
        <div className="pj-pad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(k => (
            <button key={k} type="button" className="pj-key" onClick={() => pinPress(k)} aria-label={`Enter ${k}`}>{k}</button>
          ))}
          <button type="button" className="pj-key ghost" onClick={pinBack} aria-label="Delete last digit">⌫</button>
          <button type="button" className="pj-key" onClick={() => pinPress("0")} aria-label="Enter 0">0</button>
          <span className="pj-key ghost" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (step === "name") {
    return (
      <div className="qi-player-join-card qi-player-form-card" style={{ display:"flex", flexDirection:"column", gap:16, width:"100%", maxWidth:440 }}>
        <label style={{ fontFamily:"'Inter',sans-serif", fontSize:16, letterSpacing:2, color:"rgba(190,38,193,0.9)" }}>Team Name</label>
        <input
          value={teamName}
          onChange={e => setTeamName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleNameNext()}
          placeholder="Enter your team name..."
          autoFocus
          style={{ padding:"14px 18px", borderRadius:12, background:"rgba(255,255,255,0.1)", color:"#fff", border:"1.5px solid rgba(190,38,193,0.6)", fontSize:22, fontFamily:"'Inter',sans-serif", outline:"none", letterSpacing:1 }}
        />
        {error && <p style={{ color:"#FF5555", fontSize:15, fontFamily:"'Inter',sans-serif", letterSpacing:1 }}>{error}</p>}
        <button
          type="button"
          onClick={handleNameNext}
          style={{ padding:"14px", borderRadius:12, background:"#BE26C1", color:"#fff", border:"none", fontSize:16, fontFamily:"'Inter',sans-serif", letterSpacing:3, cursor:"pointer", boxShadow:"0 2px 12px rgba(0,0,0,0.3)" }}
        >
          Next
        </button>

        <div style={{ textAlign:"center", marginTop:4 }}>
          <button
            type="button"
            onClick={() => { setReconnecting(r => !r); setReconnectError(""); }}
            style={{ background:"none", border:"none", color:"rgba(255,255,255,0.45)", fontSize:13, textDecoration:"underline", cursor:"pointer", fontFamily:"'Inter',sans-serif" }}
          >
            Already joined? Reconnect instead
          </button>
        </div>

        {reconnecting && (
          <div style={{ display:"flex", flexDirection:"column", gap:10, padding:16, borderRadius:12, background:"rgba(255,255,255,0.05)", border:"1.5px solid rgba(190,38,193,0.4)" }}>
            <label style={{ fontFamily:"'Inter',sans-serif", fontSize:13, letterSpacing:1, color:"rgba(255,255,255,0.6)" }}>Your existing team name</label>
            <input
              value={reconnectName}
              onChange={e => setReconnectName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleReconnect()}
              placeholder="Enter your team name..."
              style={{ padding:"12px 16px", borderRadius:10, background:"rgba(255,255,255,0.1)", color:"#fff", border:"1.5px solid rgba(190,38,193,0.5)", fontSize:18, fontFamily:"'Inter',sans-serif", outline:"none" }}
            />
            {reconnectError && <p style={{ color:"#FF5555", fontSize:13, fontFamily:"'Inter',sans-serif", letterSpacing:0.5 }}>{reconnectError}</p>}
            <button
              type="button"
              onClick={handleReconnect}
              disabled={reconnectLoading}
              style={{ padding:"12px", borderRadius:10, background:"rgba(190,38,193,0.3)", color:"#fff", border:"1px solid #BE26C1", fontSize:14, fontFamily:"'Inter',sans-serif", letterSpacing:2, cursor:"pointer" }}
            >
              {reconnectLoading ? "Reconnecting..." : "Reconnect"}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (step === "song") {
  return (
    <div className="qi-player-join-card qi-player-form-card" style={{ display:"flex", flexDirection:"column", gap:12, width:"100%", maxWidth:520 }}>
      <div style={{ fontFamily:"'Inter',sans-serif", fontSize:16, letterSpacing:2, color:"rgba(190,38,193,0.9)" }}>Choose Your Victory Song</div>
      <div style={{ fontFamily:"'Inter',sans-serif", fontSize:14, letterSpacing:1, color:"rgba(255,255,255,0.7)" }}>This plays when you win! Tap to preview.</div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search songs..."
        style={{ padding:"10px 14px", borderRadius:10, background:"rgba(255,255,255,0.1)", color:"#fff", border:"1.5px solid rgba(190,38,193,0.5)", fontSize:20, fontFamily:"'Inter',sans-serif", outline:"none" }}
      />

      <div style={{ maxHeight:340, overflowY:"auto", display:"flex", flexDirection:"column", gap:6, paddingRight:4 }}>
        {filtered.map(song => (
          <button
            type="button"
            key={song.id}
            onClick={() => { setSelectedSong(song.file_ref); playPreview(song.file_ref); }}
            aria-pressed={selectedSong === song.file_ref}
            style={{
              width:"100%",
              textAlign:"left",
              padding:"12px 16px",
              borderRadius:10,
              background: selectedSong === song.file_ref ? "rgba(190,38,193,0.2)" : "#0f0f1a",
              border: selectedSong === song.file_ref ? "1px solid #BE26C1" : "1px solid rgba(255,255,255,0.07)",
              color: selectedSong === song.file_ref ? "#fff" : "rgba(255,255,255,0.6)",
              fontFamily:"'Inter',sans-serif",
              fontSize:16,
              letterSpacing:1,
              cursor:"pointer",
              display:"flex",
              alignItems:"center",
              justifyContent:"space-between",
              boxShadow: selectedSong === song.file_ref ? "0 0 12px rgba(190,38,193,0.3)" : "none",
              transition:"all 0.15s",
            }}
          >
            <span>{song.title}</span>
            {selectedSong === song.file_ref && <span style={{ color:"#BE26C1", fontSize:14 }}>♪</span>}
          </button>
        ))}
      </div>

      {error && <p style={{ color:"#FF5555", fontSize:16, fontFamily:"'Inter',sans-serif", letterSpacing:1 }}>{error}</p>}

      <button
        type="button"
        onClick={handleSongNext}
        disabled={!selectedSong}
        style={{ padding:"14px", borderRadius:12, background: selectedSong ? "#BE26C1" : "#1a1a2e", color: selectedSong ? "#fff" : "rgba(255,255,255,0.3)", border:"none", fontSize:15, fontFamily:"'Inter',sans-serif", letterSpacing:3, cursor: selectedSong ? "pointer" : "default", boxShadow: selectedSong ? "0 2px 12px rgba(0,0,0,0.3)" : "none", transition:"all 0.2s" }}
      >
        Next
      </button>
    </div>
  );
  }

  return (
    <div className="qi-player-join-card qi-player-form-card" style={{ display:"flex", flexDirection:"column", gap:16, width:"100%", maxWidth:440, alignItems:"center" }}>
      <div style={{ fontFamily:"'Inter',sans-serif", fontSize:16, letterSpacing:2, color:"rgba(190,38,193,0.9)" }}>Add a Team Photo</div>
      <div style={{ fontFamily:"'Inter',sans-serif", fontSize:13, letterSpacing:1, color:"rgba(255,255,255,0.6)", textAlign:"center" as const }}>Optional — shown when you win, and on the shareable results graphic!</div>

      {photoPreviewUrl ? (
        <img src={photoPreviewUrl} alt="Team" style={{ width:160, height:160, borderRadius:"50%", objectFit:"cover", border:"3px solid #BE26C1" }} />
      ) : (
        <div style={{ width:160, height:160, borderRadius:"50%", background:"rgba(255,2,255,0.06)", border:"2px dashed rgba(190,38,193,0.5)", display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(255,255,255,0.3)", fontSize:13, textAlign:"center" as const, fontFamily:"'Inter',sans-serif" }}>No photo yet</div>
      )}

      <label style={{ padding:"12px 24px", borderRadius:12, background:"rgba(190,38,193,0.2)", border:"1.5px solid #BE26C1", color:"#fff", fontSize:14, fontFamily:"'Inter',sans-serif", letterSpacing:1, cursor:"pointer" }}>
        {photoFile ? "Change Photo" : "Choose Photo"}
        <input type="file" accept="image/*" capture="environment" style={{ display:"none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoSelect(f); }} />
      </label>

      {error && <p style={{ color:"#FF5555", fontSize:15, fontFamily:"'Inter',sans-serif", letterSpacing:1 }}>{error}</p>}

      <button
        type="button"
        onClick={handleJoin}
        disabled={loading}
        style={{ width:"100%", padding:"14px", borderRadius:12, background:"#BE26C1", color:"#fff", border:"none", fontSize:15, fontFamily:"'Inter',sans-serif", letterSpacing:3, cursor:"pointer", boxShadow:"0 2px 12px rgba(0,0,0,0.3)" }}
      >
        {loading ? "Joining..." : "Join Game"}
      </button>
      <button
        type="button"
        onClick={handleJoin}
        disabled={loading}
        style={{ width:"100%", padding:"10px", borderRadius:12, background:"transparent", border:"1px solid rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.5)", fontSize:13, fontFamily:"'Inter',sans-serif", letterSpacing:2, cursor:"pointer" }}
      >
        Skip Photo
      </button>
    </div>
  );
}
