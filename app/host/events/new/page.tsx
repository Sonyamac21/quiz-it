"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { EventQuiz, EventVenue, localDateKey } from "@/lib/events/types";
import { HostButton, HostInput, HostLabel, HostLoading, HostShell, TopSpacer } from "@/components/fable/HostConsole";

const STAGE_BG = "radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";
const fieldStyle = { width: "100%", padding: "11px 14px", borderRadius: 14, background: "#150A2E", color: "#fff", border: "1px solid #2E1A52", font: "500 13px 'Inter'", outline: "none" } as const;

export default function EventBuilderPage() {
  const router = useRouter();
  const [venues, setVenues] = useState<EventVenue[]>([]);
  const [quizzes, setQuizzes] = useState<EventQuiz[]>([]);
  const [hostId, setHostId] = useState("");
  const [hostLabel, setHostLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [eventName, setEventName] = useState("");
  const [venueId, setVenueId] = useState("");
  const [eventDate, setEventDate] = useState(localDateKey());
  const [startTime, setStartTime] = useState("19:30");
  const [quizId, setQuizId] = useState("");
  const [brandKit, setBrandKit] = useState("");
  const [musicPack, setMusicPack] = useState("");
  const [sponsorOptions, setSponsorOptions] = useState<string[]>([]);
  const [selectedSponsors, setSelectedSponsors] = useState<string[]>([]);
  const [newSponsor, setNewSponsor] = useState("");
  const [prizes, setPrizes] = useState("");
  const [powerCards, setPowerCards] = useState(false);
  const [notes, setNotes] = useState("");
  const [legacyEventId, setLegacyEventId] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const [{ data: userData }, { data: venueData }, { data: quizData }, { data: eventData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("venues").select("id,day_of_week,venue_name,address,default_start_time,default_host_id,default_brand_kit,default_music_pack").eq("active", true).neq("venue_name", "").order("venue_name"),
        supabase.from("quizzes").select("id,name,quiz_rounds(id,position,name,round_type,questions,hide_leaderboard,allow_power_cards)").eq("archived", false).order("updated_at", { ascending: false }),
        supabase.from("events").select("sponsors"),
      ]);
      const user = userData.user;
      if (user) {
        setHostId(user.id);
        setHostLabel(String(user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Current host"));
      }
      setVenues((venueData ?? []) as EventVenue[]);
      setQuizzes((quizData ?? []) as EventQuiz[]);
      const usedSponsors = new Set<string>();
      (eventData ?? []).forEach(row => (row.sponsors as string[] | null)?.forEach(sponsor => usedSponsors.add(sponsor)));
      setSponsorOptions([...usedSponsors].sort((a, b) => a.localeCompare(b)));
      const legacyId = new URLSearchParams(window.location.search).get("legacy");
      if (legacyId) {
        const { data: legacy } = await supabase.from("events").select("*").eq("id", legacyId).maybeSingle();
        if (legacy) {
          setLegacyEventId(legacy.id); setEventName(legacy.event_name); setEventDate(legacy.event_date); setStartTime(String(legacy.start_time).slice(0, 5)); setHostId(legacy.host_id); setQuizId(legacy.quiz_definition_id || ""); setBrandKit(legacy.brand_kit || ""); setMusicPack(legacy.music_pack || ""); setSelectedSponsors(legacy.sponsors || []); setPrizes(legacy.prizes || ""); setPowerCards(legacy.power_cards); setNotes(legacy.notes || "");
          const venue = (venueData ?? []).find(item => item.id === legacy.venue_record_id || item.day_of_week === legacy.venue_id);
          if (venue) setVenueId(venue.id);
        }
      }
      setLoading(false);
    })();
  }, []);

  const selectedVenue = venues.find(venue => venue.id === venueId) ?? null;
  const selectedQuiz = quizzes.find(quiz => quiz.id === quizId) ?? null;
  const orderedRounds = [...(selectedQuiz?.quiz_rounds ?? [])].sort((a, b) => a.position - b.position);
  const canSave = useMemo(() => Boolean(eventName.trim() && selectedVenue && eventDate && startTime && hostId && selectedQuiz && orderedRounds.length), [eventName, selectedVenue, eventDate, startTime, hostId, selectedQuiz, orderedRounds.length]);

  function selectVenue(id: string) {
    setVenueId(id);
    const venue = venues.find(item => item.id === id);
    if (!venue) return;
    if (venue.default_start_time) setStartTime(venue.default_start_time.slice(0, 5));
    if (venue.default_brand_kit) setBrandKit(venue.default_brand_kit);
    if (venue.default_music_pack) setMusicPack(venue.default_music_pack);
  }

  function addSponsor() {
    const sponsor = newSponsor.trim();
    if (!sponsor) return;
    if (!sponsorOptions.includes(sponsor)) setSponsorOptions(previous => [...previous, sponsor].sort((a, b) => a.localeCompare(b)));
    if (!selectedSponsors.includes(sponsor)) setSelectedSponsors(previous => [...previous, sponsor]);
    setNewSponsor("");
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const eventValues = {
      event_name: eventName.trim(),
      venue_id: selectedVenue!.day_of_week,
      venue_record_id: selectedVenue!.id,
      event_date: eventDate,
      start_time: startTime,
      host_id: hostId,
      quiz_definition_id: quizId || null,
      brand_kit: brandKit.trim() || null,
      music_pack: musicPack.trim() || null,
      sponsors: selectedSponsors,
      prizes: prizes.trim() || null,
      power_cards: powerCards,
      notes: notes.trim() || null,
    };
    const { error: saveError } = legacyEventId
      ? await supabase.from("events").update({ ...eventValues, updated_at: new Date().toISOString() }).eq("id", legacyEventId)
      : await supabase.from("events").insert(eventValues);
    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }
    router.push("/host/events");
    router.refresh();
  }

  if (loading) {
    return <HostShell><div style={{ minHeight: "100vh", background: STAGE_BG, display: "flex", alignItems: "center", justifyContent: "center" }}><HostLoading title="Event Builder" note="Loading venues and quizzes…" /></div></HostShell>;
  }

  return (
    <HostShell>
      <div style={{ minHeight: "100vh", background: STAGE_BG, color: "#fff", padding: "24px 32px" }}>
        <div className="fbh-top" style={{ border: "1px solid #2E1A52", borderRadius: 16, marginBottom: 24 }}>
          <span className="fbh-wm" style={{ fontSize: 16 }}><span className="q">QUIZ-</span>IT</span>
          <span className="fbh-bc">{legacyEventId ? "Repair Legacy Event" : "Event Builder"}</span>
          <TopSpacer />
          <Link className="fbh-btn" href="/host/venues">Venues</Link>
          <Link className="fbh-btn" href="/host/quizzes">Quiz Plans</Link>
          <Link className="fbh-btn" href="/host/events">Back to Events</Link>
        </div>

        <form onSubmit={saveEvent} className="fbh-panel" style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
            <div><HostLabel>Event Name</HostLabel><HostInput value={eventName} onChange={e => setEventName(e.target.value)} required placeholder="Thursday Night Quiz" /></div>
            <div><HostLabel>Venue</HostLabel><select value={venueId} onChange={e => selectVenue(e.target.value)} required style={fieldStyle}><option value="">Select saved venue…</option>{venues.map(venue => <option key={venue.id} value={venue.id}>{venue.venue_name}</option>)}</select></div>
            <div><HostLabel>Date</HostLabel><HostInput type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} required /></div>
            <div><HostLabel>Start Time</HostLabel><HostInput type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required /></div>
            <div><HostLabel>Host</HostLabel><select value={hostId} onChange={e => setHostId(e.target.value)} required style={fieldStyle}><option value={hostId}>{hostLabel || "Current host"}</option></select></div>
            <div><HostLabel>Quiz Plan</HostLabel><select value={quizId} onChange={e => setQuizId(e.target.value)} required style={fieldStyle}><option value="">Select Quiz Plan…</option>{quizzes.map(quiz => <option key={quiz.id} value={quiz.id}>{quiz.name} ({quiz.quiz_rounds.length} rounds)</option>)}</select></div>
            <div><HostLabel>Brand Kit</HostLabel><HostInput value={brandKit} onChange={e => setBrandKit(e.target.value)} placeholder="Optional brand kit name" /></div>
            <div><HostLabel>Music Pack</HostLabel><HostInput value={musicPack} onChange={e => setMusicPack(e.target.value)} placeholder="Optional music pack name" /></div>
          </div>

          <div className="fbh-panel" style={{ marginTop: 16 }}><HostLabel>Quiz Plan Preview</HostLabel>{selectedQuiz ? orderedRounds.length ? orderedRounds.map((round, index) => <div className="fbh-answer-row" key={round.id}><span className="ord">{index + 1}</span><span className="nm">{round.name}</span><span className="ans">{round.questions.length} questions · {round.round_type} · {round.hide_leaderboard ? "Leaderboard hidden" : "Leaderboard shown"} · {round.allow_power_cards ? "Cards allowed" : "Cards paused"}</span></div>) : <div role="alert" style={{ color: "#FFC533" }}>This Quiz Plan has no rounds and cannot be used.</div> : <div style={{ color: "#B9A8D9" }}>Select a Quiz Plan to review its ordered rounds.</div>}</div>

          <div style={{ marginTop: 16 }}>
            <HostLabel>Sponsors</HostLabel>
            <select multiple value={selectedSponsors} onChange={e => setSelectedSponsors(Array.from(e.target.selectedOptions, option => option.value))} style={{ ...fieldStyle, minHeight: 92 }} aria-describedby="sponsor-help">
              {sponsorOptions.map(sponsor => <option key={sponsor} value={sponsor}>{sponsor}</option>)}
            </select>
            <div id="sponsor-help" style={{ font: "400 11px 'Inter'", color: "#6B5A8E", margin: "6px 0 8px" }}>Select multiple sponsors with Ctrl/Cmd-click. Add names below for this event.</div>
            <div style={{ display: "flex", gap: 8 }}><HostInput value={newSponsor} onChange={e => setNewSponsor(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSponsor(); } }} placeholder="Add sponsor name" /><HostButton type="button" onClick={addSponsor}>Add</HostButton></div>
          </div>

          <div style={{ marginTop: 16 }}><HostLabel>Prizes</HostLabel><textarea value={prizes} onChange={e => setPrizes(e.target.value)} rows={3} style={fieldStyle} placeholder="Prize details" /></div>
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 14, background: "#150A2E", border: "1px solid #2E1A52" }}>
            <div><div style={{ font: "700 13px 'Inter'" }}>Power Cards</div><div style={{ font: "400 11px 'Inter'", color: "#6B5A8E", marginTop: 3 }}>Enable power cards for this event.</div></div>
            <button type="button" role="switch" aria-checked={powerCards} onClick={() => setPowerCards(value => !value)} className={powerCards ? "fbh-btn pri" : "fbh-btn"}>{powerCards ? "ON" : "OFF"}</button>
          </div>
          <div style={{ marginTop: 16 }}><HostLabel>Notes</HostLabel><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5} style={fieldStyle} placeholder="Private event notes" /></div>

          {error && <div role="alert" style={{ color: "#D94FDC", font: "600 12px 'Inter'", marginTop: 16 }}>Event could not be saved. {error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
            <Link className="fbh-btn" href="/host/events">Cancel</Link>
            <HostButton type="submit" variant="pri" big disabled={!canSave || saving}>{saving ? "SAVING…" : legacyEventId ? "SAVE EVENT PLAN" : "CREATE EVENT"}</HostButton>
          </div>
        </form>
      </div>
    </HostShell>
  );
}
