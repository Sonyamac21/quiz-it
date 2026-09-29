"use client";
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DEFAULT_AUDIO_MIX, readAudioMix, type AudioMix } from "@/lib/audio/mixer";
import { previewShowAudioMix, setShowAudioMix } from "@/lib/audio/showAudio";

const labels: Record<keyof AudioMix, string> = { master: "Master", music: "Music & team songs", cue: "Celebrations & effects", timer: "Timer", ambient: "Background applause", spin: "Wheel" };
export function ShowAudioMixer({ sessionId }: { sessionId: string }) {
  const [mix, setMix] = useState({ ...DEFAULT_AUDIO_MIX });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const latestMix = useRef(mix);
  const pending = useRef<AudioMix | null>(null);
  const writing = useRef(false);
  const edited = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void createSupabaseBrowserClient().from("sessions").select("audio_mix").eq("id", sessionId).single().then(({ data, error }) => {
      if (cancelled) return;
      if (error) setMessage("Audio controls need the latest database migration.");
      else if (!edited.current) { const levels = readAudioMix(data.audio_mix); setMix(levels); latestMix.current = levels; setShowAudioMix(levels); }
    });
    return () => { cancelled = true; previewShowAudioMix(null); };
  }, [sessionId]);
  async function save(levels = latestMix.current) {
    pending.current = levels;
    if (writing.current) return;
    writing.current = true;
    setSaving(true);
    try {
      // Serialize writes and coalesce slider movements while a save is in flight.
      while (pending.current) {
        const next = pending.current;
        pending.current = null;
        try {
          const { data, error } = await createSupabaseBrowserClient().from("sessions").update({ audio_mix: next }).eq("id", sessionId).select("id");
          if (error || !data?.length) setMessage("Could not save display levels. Please retry.");
          else { setShowAudioMix(next); setMessage("Levels saved to the display."); }
        } catch { setMessage("Could not save display levels. Please retry."); }
      }
    } finally { writing.current = false; setSaving(false); }
  }
  function changeLevel(key: keyof AudioMix, value: number) {
    edited.current = true;
    const next = { ...latestMix.current, [key]: value };
    latestMix.current = next;
    setMix(next);
    previewShowAudioMix(next);
    void save(next);
  }
  return <fieldset style={{ border: "1px solid #493060", borderRadius: 12, padding: 14, marginBottom: 18 }}>
    <legend>Show audio</legend>
    {(Object.keys(labels) as (keyof AudioMix)[]).map(key => <label key={key} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, marginBottom: 12 }}>
      <span>{labels[key]}</span><span>{Math.round(mix[key] * 100)}%</span>
      <input aria-label={labels[key]} type="range" min="0" max="100" value={Math.round(mix[key] * 100)} onChange={event => changeLevel(key, Number(event.target.value) / 100)} style={{ gridColumn: "1 / -1", width: "100%" }} />
    </label>)}
    <button type="button" className="fbh-btn" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Apply audio levels"}</button>
    <p role="status" style={{ fontSize: 12, color: "#B9A8D9" }}>{message || "Changes apply automatically. Master limits every channel; 0 mutes it."}</p>
  </fieldset>;
}
