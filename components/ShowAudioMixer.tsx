"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DEFAULT_AUDIO_MIX, readAudioMix, type AudioMix } from "@/lib/audio/mixer";
import { setShowAudioMix } from "@/lib/audio/showAudio";

const labels: Record<keyof AudioMix, string> = { master: "Master", music: "Music & team songs", cue: "Celebrations & effects", timer: "Timer", ambient: "Background applause", spin: "Wheel" };
export function ShowAudioMixer({ sessionId }: { sessionId: string }) {
  const [mix, setMix] = useState({ ...DEFAULT_AUDIO_MIX });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void createSupabaseBrowserClient().from("sessions").select("audio_mix").eq("id", sessionId).single().then(({ data, error }) => {
      if (cancelled) return;
      if (error) setMessage("Audio controls need the latest database migration.");
      else { const levels = readAudioMix(data.audio_mix); setMix(levels); setShowAudioMix(levels); }
    });
    return () => { cancelled = true; };
  }, [sessionId]);
  async function save() {
    setSaving(true);
    try {
      const { data, error } = await createSupabaseBrowserClient().from("sessions").update({ audio_mix: mix }).eq("id", sessionId).select("id");
      setMessage(error || !data?.length ? "Could not save display levels. Please retry." : "Levels saved to the display.");
      if (!error && data?.length) setShowAudioMix(mix);
    } finally { setSaving(false); }
  }
  return <fieldset style={{ border: "1px solid #493060", borderRadius: 12, padding: 14, marginBottom: 18 }}>
    <legend>Show audio</legend>
    {(Object.keys(labels) as (keyof AudioMix)[]).map(key => <label key={key} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, marginBottom: 12 }}>
      <span>{labels[key]}</span><span>{Math.round(mix[key] * 100)}%</span>
      <input aria-label={labels[key]} type="range" min="0" max="100" value={Math.round(mix[key] * 100)} onChange={event => setMix(previous => ({ ...previous, [key]: Number(event.target.value) / 100 }))} style={{ gridColumn: "1 / -1", width: "100%" }} />
    </label>)}
    <button type="button" className="fbh-btn" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Apply audio levels"}</button>
    <p role="status" style={{ fontSize: 12, color: "#B9A8D9" }}>{message || "Master limits every channel. Set it to 0 to mute the show."}</p>
  </fieldset>;
}
