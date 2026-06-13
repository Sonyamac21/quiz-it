"use client";
import { UnoPlayerCards } from "@/components/UnoCards";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
  const [step, setStep] = useState<"pin" | "name" | "song">("pin");
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

  const filtered = SONGS.filter(s => cleanName(s).toLowerCase().includes(search.toLowerCase()));

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

  function handleNameNext() {
    if (!teamName.trim()) { setError("Please enter your team name"); return; }
    setError("");
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

  async function handleJoin() {
    if (!selectedSong) { setError("Please pick your victory song!"); return; }
    setLoading(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: dbError } = await supabase.from("teams").insert({
        team_name: teamName.trim(),
        name: teamName.trim(),
        victory_song: selectedSong,
        session_pin: pin,
      });
      setSessionPin(pin);
      if (dbError) throw dbError;
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

    if (done) {
      return (
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 42, fontWeight: 800, color: "#BE26C1", letterSpacing: 2, textShadow: "0 0 30px rgba(190,38,193,0.5)" }}>You are In!</div>
            <div style={{ fontSize: 22, color: "rgba(255,255,255,0.7)", marginTop: 8 }}>{teamName} - good luck!</div>
          </div>
          <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} />
        </div>
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
      </div>
    );
  }

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
        onClick={handleJoin}
        disabled={loading || !selectedSong}
        style={{ padding:"14px", borderRadius:12, background: selectedSong ? "#BE26C1" : "#1a1a2e", color: selectedSong ? "#fff" : "rgba(255,255,255,0.3)", border:"none", fontSize:15, fontFamily:"'Bruno Ace SC',sans-serif", letterSpacing:3, cursor: selectedSong ? "pointer" : "default", boxShadow: selectedSong ? "0 0 20px rgba(190,38,193,0.4)" : "none", transition:"all 0.2s" }}
      >
        {loading ? "Joining..." : "Join Game"}
      </button>
    </div>
  );
}
