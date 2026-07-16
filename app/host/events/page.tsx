"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { EventRecord, formatEventDate, formatEventTime, localDateKey } from "@/lib/events/types";
import { HostEmpty, HostLoading, HostShell, TopSpacer } from "@/components/fable/HostConsole";

const STAGE_BG = "radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";

function eventFromRow(row: Record<string, unknown>): EventRecord {
  const venueValue = row.venue;
  const quizValue = row.quiz;
  const venue = Array.isArray(venueValue) ? venueValue[0] : venueValue;
  const quiz = Array.isArray(quizValue) ? quizValue[0] : quizValue;
  return {
    ...(row as Omit<EventRecord, "venue" | "quiz">),
    venue: (venue as EventRecord["venue"]) ?? null,
    quiz: (quiz as EventRecord["quiz"]) ?? null,
  };
}

function eventCard(event: EventRecord) {
  return (
    <article key={event.id} className="fbh-panel" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ font: "800 15px 'Inter'", color: "#fff", marginBottom: 5 }}>{event.event_name}</div>
          <div style={{ font: "500 12px 'Inter'", color: "#B9A8D9", lineHeight: 1.7 }}>
            {formatEventDate(event.event_date)} · {formatEventTime(event.start_time)}<br />
            {event.venue?.venue_name || "Venue not available"} · {event.quiz?.name || "Quiz not selected"}
          </div>
        </div>
        <span className="fbh-chip">{event.power_cards ? "Power Cards On" : "Power Cards Off"}</span>
      </div>
    </article>
  );
}

export default function EventsDashboardPage() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [hostName, setHostName] = useState("Host");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const [{ data: userData }, { data, error: loadError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from("events")
          .select("*, venue:venues!events_venue_id_fkey(venue_name), quiz:rounds!events_quiz_id_fkey(name)")
          .order("event_date", { ascending: true })
          .order("start_time", { ascending: true }),
      ]);

      const user = userData.user;
      const preferredName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "Host";
      setHostName(String(preferredName).replace(/[._-]+/g, " ").replace(/\b\w/g, character => character.toUpperCase()));

      if (loadError) {
        setError(loadError.message);
        setEvents([]);
      } else {
        setEvents((data ?? []).map(row => eventFromRow(row as Record<string, unknown>)));
      }
      setLoading(false);
    })();
  }, []);

  const today = localDateKey();
  const todaysEvents = events.filter(event => event.event_date === today);
  const upcomingEvents = events.filter(event => event.event_date > today);
  const pastEvents = events.filter(event => event.event_date < today).reverse();
  const todaysEvent = todaysEvents[0] ?? null;

  return (
    <HostShell>
      <div style={{ minHeight: "100vh", background: STAGE_BG, color: "#fff", padding: "24px 32px" }}>
        <div className="fbh-top" style={{ border: "1px solid #2E1A52", borderRadius: 16, marginBottom: 24 }}>
          <span className="fbh-wm" style={{ fontSize: 16 }}><span className="q">QUIZ-</span>IT</span>
          <span className="fbh-bc">Events</span>
          <TopSpacer />
          <Link className="fbh-btn" href="/host/session">Session</Link>
          <Link className="fbh-btn" href="/host/rounds">Rounds</Link>
          <Link className="fbh-btn pri" href="/host/events/new">Create Event</Link>
        </div>

        {loading && <HostLoading title="Events" note="Loading your event schedule…" />}
        {!loading && error && (
          <div className="fbh-panel" role="alert" style={{ color: "#D94FDC" }}>
            Events could not be loaded. Apply the Events migration, then try again. {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {todaysEvent ? (
              <section className="fbh-panel" style={{ borderColor: "#8A1B8D", padding: 24, marginBottom: 24 }}>
                <div style={{ font: "800 clamp(24px,3vw,38px) 'Inter'", marginBottom: 20 }}>Good evening {hostName}</div>
                <div style={{ font: "700 13px 'Inter'", color: "#D94FDC", letterSpacing: ".12em", marginBottom: 14 }}>TODAY&apos;S EVENT · {todaysEvent.event_name}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 22 }}>
                  {[
                    ["Tonight's venue", todaysEvent.venue?.venue_name || "Not selected"],
                    ["Start time", formatEventTime(todaysEvent.start_time)],
                    ["Quiz", todaysEvent.quiz?.name || "Not selected"],
                    ["Display status", "Not launched"],
                    ["Music status", todaysEvent.music_pack ? "Music pack selected" : "Not selected"],
                    ["Question status", todaysEvent.quiz ? "Quiz selected" : "Not selected"],
                  ].map(([label, value]) => (
                    <div key={label} style={{ padding: "13px 14px", borderRadius: 12, background: "#150A2E", border: "1px solid #2E1A52" }}>
                      <div style={{ font: "600 10px 'Inter'", color: "#6B5A8E", letterSpacing: ".1em", marginBottom: 5 }}>{label.toUpperCase()}</div>
                      <div style={{ font: "700 14px 'Inter'", color: "#fff" }}>{value}</div>
                    </div>
                  ))}
                </div>
                <Link href="/host/session" className="fbh-btn pri big" style={{ display: "flex", width: "100%", minHeight: 62, justifyContent: "center", fontSize: 19, textDecoration: "none" }}>
                  START EVENT
                </Link>
              </section>
            ) : (
              <section style={{ marginBottom: 24 }}>
                <div className="fbh-lbl">Today&apos;s Event</div>
                <HostEmpty title="No Event Today" note="Create an event when tonight's details are ready." actionLabel="CREATE EVENT" onAction={() => { window.location.href = "/host/events/new"; }} />
              </section>
            )}

            <section style={{ marginBottom: 24 }}>
              <div className="fbh-lbl">Upcoming Events</div>
              {upcomingEvents.length ? upcomingEvents.map(eventCard) : <div className="fbh-panel" style={{ color: "#6B5A8E" }}>No upcoming events.</div>}
            </section>

            <section>
              <div className="fbh-lbl">Past Events</div>
              {pastEvents.length ? pastEvents.map(eventCard) : <div className="fbh-panel" style={{ color: "#6B5A8E" }}>No past events.</div>}
            </section>
          </>
        )}
      </div>
    </HostShell>
  );
}
