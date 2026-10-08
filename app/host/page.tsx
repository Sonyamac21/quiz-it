"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatEventDate, formatEventTime, localDateKey, type EventRecord } from "@/lib/events/types";
import { FEATURE_FLAGS } from "@/lib/platform/featureFlags";
import { isQuizPlanComplete } from "@/lib/quiz/planStatus";
import { HostOnboardingChecklist } from "@/components/HostOnboardingChecklist";

type VenueAlert = { id:string; venue_name:string; venue_logo_url:string|null; hero_image_url:string|null; default_quiz_id:string|null; default_start_time:string|null; contact_email:string|null; active:boolean };
const addDays=(date:Date,days:number)=>{const copy=new Date(date);copy.setDate(copy.getDate()+days);return localDateKey(copy)};

export default function BackOfficeDashboard(){
  const [events,setEvents]=useState<EventRecord[]>([]);const [venues,setVenues]=useState<VenueAlert[]>([]);const [questionCount,setQuestionCount]=useState(0);const [quizCount,setQuizCount]=useState(0);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
  // Pulls each quiz's rounds/questions too (not just id+name) so the
  // dashboard can tell "a Quiz Plan is linked" apart from "that Quiz Plan
  // actually has questions in every round and its music prepped" - a plan
  // being built and complete in the Quiz Library doesn't mean it's been
  // assigned to a specific Calendar date, and being assigned doesn't mean
  // it's actually finished either. Both are surfaced separately below.
  const load=useCallback(async()=>{const supabase=createSupabaseBrowserClient();const today=localDateKey();const [{data:eventData,error:eventError},{data:venueData},{data:quizData},{count}]=await Promise.all([supabase.from("events").select("*").gte("event_date",today).order("event_date").order("start_time").limit(30),supabase.from("venues").select("*").order("venue_name"),supabase.from("quizzes").select("id,name,quiz_rounds(id,round_type,questions)"),supabase.from("question_bank").select("id",{count:"exact",head:true})]);const venueRows=(venueData||[])as(Array<VenueAlert&{day_of_week?:number}>);const quizRows=(quizData||[])as{id:string;name:string;quiz_rounds?:{id:string;round_type:string;questions:Record<string,unknown>[]}[]}[];const mapped=(eventData||[]).map(row=>({...row,status:row.status||"scheduled",host_name:row.host_name||null,venue:venueRows.find(venue=>venue.id===row.venue_record_id||venue.day_of_week===row.venue_id)||null,quiz:quizRows.find(quiz=>quiz.id===row.quiz_definition_id)||null}))as EventRecord[];setEvents(mapped);setVenues(venueRows);setQuestionCount(count||0);setQuizCount(quizRows.length);if(eventError){const raw=eventError.message||"";setError(/issued at future|issued in the future/i.test(raw)?"Your session looks out of sync with the server clock. Sign out and back in to fix this.":raw)}else setError("");setLoading(false)},[]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer)},[load]);
  const today=localDateKey();const weekEnd=addDays(new Date(),7);const todayEvents=events.filter(e=>e.event_date===today);const weekEvents=events.filter(e=>e.event_date<=weekEnd);
  const alerts=useMemo(()=>venues.filter(v=>v.active&&(!v.default_start_time||!v.contact_email)),[venues]);const mediaAttention=venues.filter(v=>v.active&&(!v.venue_logo_url||!v.hero_image_url));
  // Host request: this page used to duplicate the top nav in two places -
  // a second "Open Calendar" pill competing with the global "Run a quiz"
  // button (toned down to a plain text link, same style as the other
  // section links below), and a whole "Shortcuts / Quick actions" section
  // whose five links went to the exact same five destinations already one
  // click away in the top nav (removed entirely). "Today" and "This week"
  // were also two separately-headed lists stacked in the same column for
  // no real reason - merged into one "Upcoming quizzes" list, with today's
  // own events called out via a small badge in EventRow instead of a
  // whole extra section.
  const nextEvent = events.find(event => event.status !== "cancelled" && event.status !== "completed");
  return <main className="qi-bo-page qi-home"><header className="qi-bo-pagehead"><div><p>Your quiz workspace</p><h1>Let’s get your next quiz ready</h1><span>Your schedule, plans and next steps in one place.</span></div><Link href="/host/events" className="qi-home-secondary">View calendar →</Link></header>{error&&<div className="qi-bo-alert" role="alert">Dashboard data could not be fully loaded: {error}</div>}
    <HostOnboardingChecklist loading={loading} status={{hasVenue:venues.length>0,hasQuizPlan:quizCount>0,hasScheduledEvent:events.length>0,hasQuestions:questionCount>0}}/>
    <section className="qi-home-next" aria-labelledby="next-quiz-heading">
      <div><span className="qi-home-eyebrow">{loading ? "Your next quiz" : nextEvent?.event_date === today ? "Coming up today" : "Your next quiz"}</span><h2 id="next-quiz-heading">{loading ? "Loading your schedule…" : nextEvent ? nextEvent.venue?.venue_name || nextEvent.event_name : "Plan your next quiz night"}</h2><p>{nextEvent ? `${formatEventDate(nextEvent.event_date)} · ${formatEventTime(nextEvent.start_time)}` : "Choose a venue and date, then add your Quiz Plan."}</p>{!loading && nextEvent && <span className="qi-home-plan-note">{nextEvent.quiz ? isQuizPlanComplete(nextEvent.quiz) ? `${nextEvent.quiz.name} · Ready to host` : `${nextEvent.quiz.name} · Planning in progress` : "Next step: add a Quiz Plan"}</span>}</div>
      {!loading && <Link className="qi-home-primary" href={nextEvent ? nextEvent.status === "live" ? `/host/session?event=${nextEvent.id}` : `/host/events?event=${nextEvent.id}` : "/host/events/new"}>{nextEvent ? nextEvent.status === "live" ? "Open live quiz" : isQuizPlanComplete(nextEvent.quiz) ? "Open event" : "Prepare this quiz" : "Schedule a quiz"} →</Link>}
    </section>
    <section className="qi-bo-stats" aria-label="At a glance"><article><strong>{loading ? "—" : todayEvents.length}</strong><span>Quizzes today</span></article><article><strong>{loading ? "—" : weekEvents.length}</strong><span>Coming up this week</span></article><article><strong>{loading ? "—" : venues.filter(v=>v.active).length}</strong><span>Active venues</span></article><article><strong>{loading ? "—" : questionCount.toLocaleString("en-GB")}</strong><span>Questions in your library</span></article></section>
    <div className="qi-bo-dashboard-grid"><section><div className="qi-bo-sectionhead"><div><p>This week</p><h2>Upcoming quizzes</h2></div><Link href="/host/events">Full calendar</Link></div>{loading?<div className="qi-bo-card">Loading schedule…</div>:weekEvents.length?weekEvents.map(event=><EventRow key={event.id} event={event} today={today}/>):<div className="qi-bo-empty"><strong>No quizzes this week</strong><span>The calendar is clear.</span><Link href="/host/events">Schedule an event</Link></div>}
      </section>
      <aside><div className="qi-bo-sectionhead"><div><p>Before quiz night</p><h2>A few things to check</h2></div></div>{loading ? <div className="qi-bo-card">Loading your checklist…</div> : <><div className="qi-home-check"><span className={`qi-home-check-icon ${FEATURE_FLAGS.aiGeneration ? "is-ready" : ""}`} aria-hidden="true">{FEATURE_FLAGS.aiGeneration ? "✓" : "!"}</span><div><strong>{FEATURE_FLAGS.aiGeneration ? "Question tools are available" : "Question generation is turned off"}</strong><span>{FEATURE_FLAGS.aiGeneration ? "Create questions from your Quiz Plan." : "Check your platform settings."}</span></div></div>{mediaAttention.length > 0 && <Link className="qi-home-check" href="/host/venues"><span className="qi-home-check-icon" aria-hidden="true">!</span><div><strong>Add venue artwork</strong><span>{mediaAttention.length} venue{mediaAttention.length===1?"":"s"} missing a logo or cover image.</span></div><span aria-hidden="true">→</span></Link>}{alerts.slice(0,3).map(v=><Link href="/host/venues" className="qi-home-check" key={v.id}><span className="qi-home-check-icon" aria-hidden="true">!</span><div><strong>{v.venue_name}</strong><span>Add {[!v.default_start_time&&"a start time",!v.contact_email&&"a contact email"].filter(Boolean).join(" and ")}.</span></div><span aria-hidden="true">→</span></Link>)}{!mediaAttention.length && !alerts.length && <div className="qi-home-check"><span className="qi-home-check-icon is-ready" aria-hidden="true">✓</span><div><strong>Your venues are ready</strong><span>All essential details and artwork are in place.</span></div></div>}</>}</aside>
    </div>
  </main>
}

function EventRow({event,today}:{event:EventRecord;today:string}){
  const planComplete = isQuizPlanComplete(event.quiz);
  const actionLabel = event.status==="live" ? "Open live quiz"
    : planComplete ? "Open event"
    : "Prepare quiz";
  const href=event.status==="live"?`/host/session?event=${event.id}`:`/host/events?event=${event.id}`;
  return <article className={`qi-bo-event${event.event_date===today ? " is-today" : ""}`}><div className="qi-bo-date"><strong>{new Date(`${event.event_date}T12:00:00`).getDate()}</strong><span>{new Date(`${event.event_date}T12:00:00`).toLocaleDateString("en-GB",{month:"short"})}</span></div><div><strong>{event.venue?.venue_name||event.event_name}{event.event_date===today&&<span className="qi-home-today">Today</span>}</strong><span>{formatEventDate(event.event_date)} · {formatEventTime(event.start_time)}</span><small>{event.quiz?.name||"Add a Quiz Plan to get started"}</small></div><span className={`qi-bo-status ${event.status}${planComplete ? " is-ready" : ""}`}>{event.status === "scheduled" ? planComplete ? "Ready" : "Needs planning" : event.status}</span><Link href={href}>{actionLabel} →</Link></article>
}
