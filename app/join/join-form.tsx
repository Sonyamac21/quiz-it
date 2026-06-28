"use client";
import { PlayerQuizScreen } from "@/components/PlayerQuizScreen";
import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const STORAGE_KEY = "quizit_player_session";

const SONGS = [
  "BELIEVE-Cher-",
  "BREAKEVEN-The Script SQS",
  "Basement Jax Where's your head at SQS",
  "Be my Lover-La Bouche SQS",
  "Boom Boom Boom-Outhere Brothers SQS",
  "Boomfunk Freestyler SQS",
  "CC American GIrls SQS",
  "COCO JAMBO-MR PRESIDENT-",
  "Capella U Got 2 Let The Music SQS",
  "Cardi B I Like it Like That SQS",
  "Castles In The Sky - Ian Van Dahl SQS",
  "Chemical Bros Hey Boy Hey Girl SQS",
  "Come On Eileen-Dexys Midnight Runners-",
  "D Bedd Gotta Get Through This SQS",
  "DANGER ZONE-KENNY LOGGINS-",
  "DISTURBIA-Rihanna-",
  "Destiny's Child Bootylicious SQS",
  "Drake - Massive SQS",
  "Drake Fancy SQS",
  "Dua Be the One SQS",
  "Ed Sheeran - Shivers SQS",
  "Elton John & Dua Lipa - Cold Heart SQS",
  "Eve Who that girl SQS",
  "Ezra Blame it on me SQS",
  "FINAL COUNTDOWN-EUROPE-",
  "GETTIN JIGGY WIT IT-Will Smith-",
  "GHETTO SUPERSTAR-MYA, Wyclef Jean-",
  "Gala Freed from Desire SQS",
  "Get Ur Freak On-MISSY ELLIOTT-",
  "Girlfriend-AVRIL LAVIGNE SQS",
  "Guetta Just one last time SQS",
  "Hey Baby-DJ Otzi-",
  "I Dont Feel Like Dancin-Scissor Sisters SQS",
  "I Want You Back-NSync-",
  "IVE HAD THE TIME OF MY LIFE-BILL MEDLEY, JENNIFER WARNES-",
  "Imagine Dragons Thunder SQS",
  "JAI HO-PUSSYCAT DOLLS-",
  "Just Dance-Lady Gaga SQS",
  "KYGO & Whitney Higher Love",
  "Karma Chameleon-CULTURE CLUB-",
  "King of my Castle-Wamdue Project SQS",
  "LOVIN EACH DAY-Ronan Keating-",
  "Lizzo Good as Hell",
  "MAMBO NO 5-LOU BEGA-",
  "MAN I FEEL LIKE A WOMAN-Shania Twain-",
  "MARIA MARIA-SANTANA, THE PRODUCT GB-",
  "MC Hammer Cant touch this SQS",
  "MMMBOP-HANSON-",
  "OMI Cheerleader",
  "Outhere Bros Boom Boom Boom SQS",
  "Pink Trouble SQS",
  "Played Alive-Safri-Duo SQS",
  "Pretty Green Eyes",
  "Raise your glass-Pink SQS",
  "Rui Da Silva Touch me SQS",
  "SET YOU FREE-N-Trance-",
  "SHM Don't you worry child SQS",
  "Sash Equador SQS",
  "Shakira Whenever, Wherever SQS",
  "Tina Turner It Takes Two SQS",
];

function cleanName(filename: string) {
  return filename.replace(/\s*SQS\s*$/i, "").replace(/[-_]+$/, "").replace(/[-_]/g, " ").trim();
}

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
  const [preview, setPreview] = useState<HTMLAudioElement | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectName, setReconnectName] = useState("");
  const [reconnectError, setReconnectError] = useState("");
  const [reconnectLoading, setReconnectLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [takenSongs, setTakenSongs] = useState<string[]>([]);

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
        const { data } = await supabase.from("sessions").select("status").eq("pin", parsed.sessionPin).single();
        if (data && data.status !== "finished") {
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

  const filtered = SONGS.filter(s => !takenSongs.includes(s) && cleanName(s).toLowerCase().includes(search.toLowerCase()));

  async function handlePinNext() {
    if (!pin.trim() || pin.length !== 4) { setPinError("Please enter a 4-digit PIN"); return; }
    setPinLoading(true);
    setPinError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("sessions")
        .select("id, status")
        .eq("pin", pin.trim())
        .single();
      if (error || !data) { setPinError("PIN not found. Check with your host!"); return; }
      if (data.status === "finished") { setPinError("This quiz has already ended."); return; }
      setStep("name");
    } catch { setPinError("Something went wrong. Try again."); }
    finally { setPinLoading(false); }
  }

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

  function playPreview(song: string) {
    if (preview) { preview.pause(); preview.currentTime = 0; }
    const audio = new Audio(`/sounds/${song}.mp3`);
    audio.volume = 0.5;
    audio.play().catch(() => {});
    setTimeout(() => { audio.pause(); audio.currentTime = 0; }, 8000);
    setPreview(audio);
  }

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
        const ext = photoFile.name.split(".").pop() || "jpg";
        const path = pin + "-" + teamName.trim().replace(/\s+/g, "-").toLowerCase() + "-" + Date.now() + "." + ext;
        const { error: uploadError } = await supabase.storage.from("team-photos").upload(path, photoFile);
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
      setSessionPin(pin);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ teamName: teamName.trim(), sessionPin: pin, savedAt: Date.now() }));
      if (dbError) throw dbError;
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

    if (restoring) {
      return <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.4)", fontFamily: "'Bruno Ace SC',sans-serif", fontSize: 13, letterSpacing: 2 }}>Reconnecting...</div>;
    }
    if (done) {
      return (
        <>
          <PlayerQuizScreen teamName={teamName} sessionPin={sessionPin} />
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
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontFamily: "'Bruno Ace SC',sans-serif", letterSpacing: 0.3 }}>
              Quiz-It · Mac Entertainment by Sonya Mac
            </span>
          </div>
        </>
      );
    }

  if (step === "pin") {
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:16, width:"100%", maxWidth:400 }}>
        <div style={{ textAlign:"center", marginBottom:8 }}>
          <div style={{ fontFamily:"'Bruno Ace SC',sans-serif", fontSize:22, fontWeight:700, color:"#BE26C1", letterSpacing:4, marginBottom:4 }}>Quiz-It</div>
          <div style={{ fontFamily:"'Bruno Ace SC',sans-serif", fontSize:9, letterSpacing:3, color:"rgba(255,255,255,0.3)" }}>Enter your quiz PIN to join</div>
        </div>
        <input
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g,"").slice(0,4))}
          onKeyDown={e => e.key === "Enter" && handlePinNext()}
          placeholder="4-digit PIN"
          autoFocus
          maxLength={4}
          style={{ padding:"20px", borderRadius:12, background:"rgba(255,255,255,0.12)", color:"#fff", border:"2px solid rgba(190,38,193,0.7)", fontSize:36, fontFamily:"monospace", outline:"none", letterSpacing:12, textAlign:"center" }}
        />
        {pinError && <p style={{ color:"#FF5555", fontSize:15, fontFamily:"'Bruno Ace SC',sans-serif", letterSpacing:1, textAlign:"center" }}>{pinError}</p>}
        <button
          type="button"
          onClick={handlePinNext}
          disabled={pinLoading || pin.length !== 4}
          style={{ padding:"14px", borderRadius:12, background: pin.length === 4 ? "#BE26C1" : "rgba(255,255,255,0.08)", color: pin.length === 4 ? "#fff" : "rgba(255,255,255,0.4)", border:"none", fontSize:16, fontFamily:"'Bruno Ace SC',sans-serif", letterSpacing:3, cursor: pin.length === 4 ? "pointer" : "default" }}
        >
          {pinLoading ? "Checking..." : "Join Quiz"}
        </button>
      </div>
    );
  }

  if (step === "name") {
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:16, width:"100%", maxWidth:400 }}>
        <label style={{ fontFamily:"'Bruno Ace SC',sans-serif", fontSize:16, letterSpacing:2, color:"rgba(190,38,193,0.9)" }}>Team Name</label>
        <input
          value={teamName}
          onChange={e => setTeamName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleNameNext()}
          placeholder="Enter your team name..."
          autoFocus
          style={{ padding:"14px 18px", borderRadius:12, background:"rgba(255,255,255,0.1)", color:"#fff", border:"1.5px solid rgba(190,38,193,0.6)", fontSize:22, fontFamily:"'Bruno Ace SC',sans-serif", outline:"none", letterSpacing:1 }}
        />
        {error && <p style={{ color:"#FF5555", fontSize:15, fontFamily:"'Bruno Ace SC',sans-serif", letterSpacing:1 }}>{error}</p>}
        <button
          type="button"
          onClick={handleNameNext}
          style={{ padding:"14px", borderRadius:12, background:"#BE26C1", color:"#fff", border:"none", fontSize:16, fontFamily:"'Bruno Ace SC',sans-serif", letterSpacing:3, cursor:"pointer", boxShadow:"0 0 20px rgba(190,38,193,0.4)" }}
        >
          Next
        </button>

        <div style={{ textAlign:"center", marginTop:4 }}>
          <button
            type="button"
            onClick={() => { setReconnecting(r => !r); setReconnectError(""); }}
            style={{ background:"none", border:"none", color:"rgba(255,255,255,0.45)", fontSize:13, textDecoration:"underline", cursor:"pointer", fontFamily:"'Bruno Ace SC',sans-serif" }}
          >
            Already joined? Reconnect instead
          </button>
        </div>

        {reconnecting && (
          <div style={{ display:"flex", flexDirection:"column", gap:10, padding:16, borderRadius:12, background:"rgba(255,255,255,0.05)", border:"1.5px solid rgba(190,38,193,0.4)" }}>
            <label style={{ fontFamily:"'Bruno Ace SC',sans-serif", fontSize:13, letterSpacing:1, color:"rgba(255,255,255,0.6)" }}>Your existing team name</label>
            <input
              value={reconnectName}
              onChange={e => setReconnectName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleReconnect()}
              placeholder="Enter your team name..."
              style={{ padding:"12px 16px", borderRadius:10, background:"rgba(255,255,255,0.1)", color:"#fff", border:"1.5px solid rgba(190,38,193,0.5)", fontSize:18, fontFamily:"'Bruno Ace SC',sans-serif", outline:"none" }}
            />
            {reconnectError && <p style={{ color:"#FF5555", fontSize:13, fontFamily:"'Bruno Ace SC',sans-serif", letterSpacing:0.5 }}>{reconnectError}</p>}
            <button
              type="button"
              onClick={handleReconnect}
              disabled={reconnectLoading}
              style={{ padding:"12px", borderRadius:10, background:"rgba(190,38,193,0.3)", color:"#fff", border:"1px solid #BE26C1", fontSize:14, fontFamily:"'Bruno Ace SC',sans-serif", letterSpacing:2, cursor:"pointer" }}
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
    <div style={{ display:"flex", flexDirection:"column", gap:12, width:"100%", maxWidth:480 }}>
      <div style={{ fontFamily:"'Bruno Ace SC',sans-serif", fontSize:16, letterSpacing:2, color:"rgba(190,38,193,0.9)" }}>Choose Your Victory Song</div>
      <div style={{ fontFamily:"'Bruno Ace SC',sans-serif", fontSize:14, letterSpacing:1, color:"rgba(255,255,255,0.7)" }}>This plays when you win! Tap to preview.</div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search songs..."
        style={{ padding:"10px 14px", borderRadius:10, background:"rgba(255,255,255,0.1)", color:"#fff", border:"1.5px solid rgba(190,38,193,0.5)", fontSize:20, fontFamily:"'Bruno Ace SC',sans-serif", outline:"none" }}
      />

      <div style={{ maxHeight:340, overflowY:"auto", display:"flex", flexDirection:"column", gap:6, paddingRight:4 }}>
        {filtered.map(song => (
          <div
            key={song}
            onClick={() => { setSelectedSong(song); playPreview(song); }}
            style={{
              padding:"12px 16px",
              borderRadius:10,
              background: selectedSong === song ? "rgba(190,38,193,0.2)" : "#0f0f1a",
              border: selectedSong === song ? "1px solid #BE26C1" : "1px solid rgba(255,255,255,0.07)",
              color: selectedSong === song ? "#fff" : "rgba(255,255,255,0.6)",
              fontFamily:"'Bruno Ace SC',sans-serif",
              fontSize:16,
              letterSpacing:1,
              cursor:"pointer",
              display:"flex",
              alignItems:"center",
              justifyContent:"space-between",
              boxShadow: selectedSong === song ? "0 0 12px rgba(190,38,193,0.3)" : "none",
              transition:"all 0.15s",
            }}
          >
            <span>{cleanName(song)}</span>
            {selectedSong === song && <span style={{ color:"#BE26C1", fontSize:14 }}>♪</span>}
          </div>
        ))}
      </div>

      {error && <p style={{ color:"#FF5555", fontSize:16, fontFamily:"'Bruno Ace SC',sans-serif", letterSpacing:1 }}>{error}</p>}

      <button
        type="button"
        onClick={handleSongNext}
        disabled={!selectedSong}
        style={{ padding:"14px", borderRadius:12, background: selectedSong ? "#BE26C1" : "#1a1a2e", color: selectedSong ? "#fff" : "rgba(255,255,255,0.3)", border:"none", fontSize:15, fontFamily:"'Bruno Ace SC',sans-serif", letterSpacing:3, cursor: selectedSong ? "pointer" : "default", boxShadow: selectedSong ? "0 0 20px rgba(190,38,193,0.4)" : "none", transition:"all 0.2s" }}
      >
        Next
      </button>
    </div>
  );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16, width:"100%", maxWidth:400, alignItems:"center" }}>
      <div style={{ fontFamily:"'Bruno Ace SC',sans-serif", fontSize:16, letterSpacing:2, color:"rgba(190,38,193,0.9)" }}>Add a Team Photo</div>
      <div style={{ fontFamily:"'Bruno Ace SC',sans-serif", fontSize:13, letterSpacing:1, color:"rgba(255,255,255,0.6)", textAlign:"center" as const }}>Optional — shown when you win, and on the shareable results graphic!</div>

      {photoPreviewUrl ? (
        <img src={photoPreviewUrl} alt="Team" style={{ width:160, height:160, borderRadius:"50%", objectFit:"cover", border:"3px solid #BE26C1" }} />
      ) : (
        <div style={{ width:160, height:160, borderRadius:"50%", background:"rgba(255,2,255,0.06)", border:"2px dashed rgba(190,38,193,0.5)", display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(255,255,255,0.3)", fontSize:13, textAlign:"center" as const, fontFamily:"'Bruno Ace SC',sans-serif" }}>No photo yet</div>
      )}

      <label style={{ padding:"12px 24px", borderRadius:12, background:"rgba(190,38,193,0.2)", border:"1.5px solid #BE26C1", color:"#fff", fontSize:14, fontFamily:"'Bruno Ace SC',sans-serif", letterSpacing:1, cursor:"pointer" }}>
        {photoFile ? "Change Photo" : "Choose Photo"}
        <input type="file" accept="image/*" capture="environment" style={{ display:"none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoSelect(f); }} />
      </label>

      {error && <p style={{ color:"#FF5555", fontSize:15, fontFamily:"'Bruno Ace SC',sans-serif", letterSpacing:1 }}>{error}</p>}

      <button
        type="button"
        onClick={handleJoin}
        disabled={loading}
        style={{ width:"100%", padding:"14px", borderRadius:12, background:"#BE26C1", color:"#fff", border:"none", fontSize:15, fontFamily:"'Bruno Ace SC',sans-serif", letterSpacing:3, cursor:"pointer", boxShadow:"0 0 20px rgba(190,38,193,0.4)" }}
      >
        {loading ? "Joining..." : "Join Game"}
      </button>
      <button
        type="button"
        onClick={handleJoin}
        disabled={loading}
        style={{ width:"100%", padding:"10px", borderRadius:12, background:"transparent", border:"1px solid rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.5)", fontSize:13, fontFamily:"'Bruno Ace SC',sans-serif", letterSpacing:2, cursor:"pointer" }}
      >
        Skip Photo
      </button>
    </div>
  );
}
