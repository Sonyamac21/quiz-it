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
  return <main className="qi-bo-page"><header className="qi-bo-pagehead"><div><p>Back Office</p><h1>Good evening</h1><span>Everything needed to prepare the next live event.</span></div><Link href="/host/events" style={{display:"inline-flex",alignItems:"center",minHeight:40,padding:"0 10px",color:"var(--qi-accent-bright)",fontSize:13,fontWeight:750,textDecoration:"none"}}>Open Calendar</Link></header>{error&&<div className="qi-bo-alert" role="alert">Dashboard data could not be fully loaded: {error}</div>}
    <HostOnboardingChecklist loading={loading} status={{hasVenue:venues.length>0,hasQuizPlan:quizCount>0,hasScheduledEvent:events.length>0,hasQuestions:questionCount>0}}/>
    <section className="qi-bo-stats"><article><strong>{todayEvents.length}</strong><span>Today&apos;s quizzes</span></article><article><strong>{weekEvents.length}</strong><span>Next 7 days</span></article><article><strong>{venues.filter(v=>v.active).length}</strong><span>Active venues</span></article><article><strong>{questionCount}</strong><span>Saved questions</span></article></section>
    <div className="qi-bo-dashboard-grid"><section><div className="qi-bo-sectionhead"><div><p>This week</p><h2>Upcoming quizzes</h2></div><Link href="/host/events">Full calendar</Link></div>{loading?<div className="qi-bo-card">Loading schedule…</div>:weekEvents.length?weekEvents.map(event=><EventRow key={event.id} event={event} today={today}/>):<div className="qi-bo-empty"><strong>No quizzes this week</strong><span>The calendar is clear.</span><Link href="/host/events">Schedule an event</Link></div>}
      </section>
      <aside><div className="qi-bo-sectionhead"><div><p>Attention</p><h2>Readiness</h2></div><Link href="/host/venues">Manage venues</Link></div><div className="qi-bo-card"><strong>AI generation {FEATURE_FLAGS.aiGeneration?"ready":"disabled"}</strong><span>{FEATURE_FLAGS.aiGeneration?"Question generation is available.":"Disabled by platform configuration."}</span></div><div className="qi-bo-card"><strong>{mediaAttention.length} venue{mediaAttention.length===1?"":"s"} need media</strong><span>{mediaAttention.length?"A logo or hero image is missing.":"All active venues have core display artwork."}</span></div>{alerts.length?alerts.slice(0,3).map(v=><div className="qi-bo-card" key={v.id}><strong>{v.venue_name}</strong><span>{[!v.default_start_time&&"start time",!v.contact_email&&"contact email"].filter(Boolean).join(", ")} missing</span></div>):<div className="qi-bo-card"><strong>Venue profiles ready</strong><span>No essential planning details need attention.</span></div>}</aside>
    </div>
  </main>
}

function EventRow({event,today}:{event:EventRecord;today:string}){
  const planComplete = isQuizPlanComplete(event.quiz);
  const actionLabel = event.status==="live" ? "Open live"
    : !event.quiz ? "Finish planning"
    : planComplete ? "Ready to host"
    : "Continue planning";
  const href=event.status==="live"?`/host/session?event=${event.id}`:`/host/events?event=${event.id}`;
  return <article className="qi-bo-event"><div className="qi-bo-date"><strong>{new Date(`${event.event_date}T12:00:00`).getDate()}</strong><span>{new Date(`${event.event_date}T12:00:00`).toLocaleDateString("en-GB",{month:"short"})}</span></div><div><strong>{event.venue?.venue_name||event.event_name}{event.event_date===today&&<span style={{marginLeft:8,padding:"1px 7px",borderRadius:999,background:"rgba(190,38,193,0.25)",color:"#D94FDC",fontSize:10,fontWeight:800,letterSpacing:".04em",verticalAlign:"middle"}}>TODAY</span>}</strong><span>{formatEventDate(event.event_date)} · {formatEventTime(event.start_time)} · {event.host_name||"Host"}</span><small>{event.quiz?.name||"Quiz Plan needed"}</small></div><span className={`qi-bo-status ${event.status}`}>{event.status}</span><Link href={href}>{actionLabel}</Link></article>
}
