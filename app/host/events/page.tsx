"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CalendarView, EventQuiz, EventRecord, EventStatus, EventVenue, RecurrenceRule } from "@/lib/events/types";
import { formatEventDate, formatEventTime, localDateKey } from "@/lib/events/types";
import { HostLoading, HostShell, TopSpacer } from "@/components/fable/HostConsole";

const BG = "radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";
const field = { width:"100%", minHeight:44, padding:"10px 12px", borderRadius:10, background:"#150A2E", color:"#fff", border:"1px solid #2E1A52", font:"500 13px Inter" } as const;
const hostColours = ["#BE26C1", "#38A8FF", "#FFC533", "#22C55E", "#FF7043", "#A78BFA"];

type Draft = {
  id?: string; venueId: string; date: string; start: string; end: string; hostId: string; hostName: string;
  quizId: string; status: EventStatus; offers: string; sponsors: string; notes: string; recurrence: RecurrenceRule;
};

function blankDraft(date = localDateKey()): Draft {
  return { venueId:"", date, start:"19:30", end:"21:30", hostId:"", hostName:"", quizId:"", status:"scheduled", offers:"", sponsors:"", notes:"", recurrence:{ frequency:"none", interval:1, end:"occurrences", occurrences:1 } };
}
function dateAt(value: string) { return new Date(`${value}T12:00:00`); }
function addDays(value: string, amount: number) { const d=dateAt(value); d.setDate(d.getDate()+amount); return localDateKey(d); }
function addMonths(value: string, amount: number) { const d=dateAt(value); const day=d.getDate(); d.setDate(1); d.setMonth(d.getMonth()+amount); d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate())); return localDateKey(d); }
function recurrenceDates(start: string, rule: RecurrenceRule) {
  if (rule.frequency === "none") return [start];
  const maximum = rule.end === "occurrences" ? Math.max(1, Math.min(104, rule.occurrences || 1)) : 52;
  const values=[start]; let current=start;
  while (values.length < maximum) {
    current = rule.frequency === "daily" ? addDays(current, rule.interval) : rule.frequency === "monthly" ? addMonths(current, rule.interval) : addDays(current, 7 * rule.interval);
    if (rule.end === "date" && rule.endDate && current > rule.endDate) break;
    values.push(current);
  }
  return values;
}
function monthCells(anchor: Date) {
  const first=new Date(anchor.getFullYear(),anchor.getMonth(),1); const start=new Date(first); start.setDate(1-first.getDay());
  return Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d;});
}
function hostColour(id: string) { let hash=0; for(const char of id||"host") hash=(hash*31+char.charCodeAt(0))|0; return hostColours[Math.abs(hash)%hostColours.length]; }

export default function EventCalendarPage() {
  const [events,setEvents]=useState<EventRecord[]>([]); const [venues,setVenues]=useState<EventVenue[]>([]); const [quizzes,setQuizzes]=useState<EventQuiz[]>([]);
  const [view,setView]=useState<CalendarView>("month"); const [anchor,setAnchor]=useState(()=>new Date()); const [draft,setDraft]=useState<Draft|null>(null);
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [error,setError]=useState("");
  const [currentHost,setCurrentHost]=useState({id:"",name:"Host"}); const [filters,setFilters]=useState({venue:"",host:"",status:""});

  const load=useCallback(async()=>{
    const supabase=createSupabaseBrowserClient();
    const [{data:userData},{data:eventData,error:eventError},{data:venueData},{data:quizData}]=await Promise.all([
      supabase.auth.getUser(),
      supabase.from("events").select("*,venue:venues!events_venue_record_id_fkey(venue_name,address,venue_logo_url),quiz:quizzes!events_quiz_definition_id_fkey(name)").order("event_date").order("start_time"),
      supabase.from("venues").select("id,day_of_week,venue_name,address,default_start_time,default_end_time,default_host_id,default_host_name,default_quiz_id,default_quiz_day,default_brand_kit,default_music_pack,venue_logo_url,hero_image_url,sponsors,food_offers,drink_offers,happy_hour,prize_information,active").eq("active",true).order("venue_name"),
      supabase.from("quizzes").select("id,name,quiz_rounds(id,position,name,round_type,questions,hide_leaderboard,allow_power_cards)").eq("archived",false).order("name"),
    ]);
    const user=userData.user; const name=String(user?.user_metadata?.full_name||user?.user_metadata?.name||user?.email||"Host");
    setCurrentHost({id:user?.id||"",name}); setEvents((eventData||[]) as EventRecord[]); setVenues((venueData||[]) as EventVenue[]); setQuizzes((quizData||[]) as EventQuiz[]);
    if(eventError) setError(eventError.message); setLoading(false);
  },[]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);

  const filtered=useMemo(()=>events.filter(event=>(!filters.venue||event.venue_record_id===filters.venue)&&(!filters.host||(event.host_name||event.host_id)===filters.host)&&(!filters.status||event.status===filters.status)),[events,filters]);
  const hosts=useMemo(()=>Array.from(new Set(events.map(event=>event.host_name||event.host_id))).sort(),[events]);
  const visibleDates=useMemo(()=>monthCells(anchor),[anchor]);
  const weekDates=useMemo(()=>{const d=new Date(anchor);d.setDate(d.getDate()-d.getDay());return Array.from({length:7},(_,i)=>{const n=new Date(d);n.setDate(d.getDate()+i);return n;});},[anchor]);

  function chooseDate(date:string){setDraft({...blankDraft(date),hostId:currentHost.id,hostName:currentHost.name});}
  function chooseVenue(id:string){const venue=venues.find(v=>v.id===id);if(!venue)return;setDraft(value=>value?{...value,venueId:id,start:venue.default_start_time?.slice(0,5)||value.start,end:venue.default_end_time?.slice(0,5)||value.end,hostId:currentHost.id,hostName:venue.default_host_name||currentHost.name,quizId:venue.default_quiz_id||"",offers:"",sponsors:""}:value);}
  function editEvent(event:EventRecord){setDraft({id:event.id,venueId:event.venue_record_id||"",date:event.event_date,start:String(event.start_time).slice(0,5),end:String(event.end_time||"").slice(0,5),hostId:event.host_id,hostName:event.host_name||"Host",quizId:event.quiz_definition_id||"",status:event.status||"scheduled",offers:event.special_offers||"",sponsors:(event.sponsors||[]).join(", "),notes:event.notes||"",recurrence:event.recurrence_rule||{frequency:"none",interval:1,end:"occurrences",occurrences:1}});}

  async function saveDraft(){
    if(!draft||!draft.venueId||!draft.quizId||!draft.hostId)return; setSaving(true);setError("");
    const venue=venues.find(v=>v.id===draft.venueId)!; const supabase=createSupabaseBrowserClient();
    const existing=draft.id?events.find(event=>event.id===draft.id):null;
    const values={event_name:`${venue.venue_name} Quiz`,venue_id:venue.day_of_week,venue_record_id:venue.id,start_time:draft.start,end_time:draft.end||null,host_id:draft.hostId,host_name:draft.hostName,quiz_definition_id:draft.quizId,status:draft.status,special_offers:draft.offers||null,sponsors:draft.sponsors.split(",").map(v=>v.trim()).filter(Boolean),notes:draft.notes||null,brand_kit:existing?.brand_kit||null,music_pack:existing?.music_pack||null,prizes:existing?.prizes||null,power_cards:existing?.power_cards??false,overrides:{special_offers:!!draft.offers,sponsors:!!draft.sponsors,notes:!!draft.notes}};
    if(draft.id){const {error:saveError}=await supabase.from("events").update({...values,event_date:draft.date,updated_at:new Date().toISOString()}).eq("id",draft.id);if(saveError)setError(saveError.message);else{setDraft(null);await load();}}
    else {const group=crypto.randomUUID();const dates=recurrenceDates(draft.date,draft.recurrence);const {error:saveError}=await supabase.from("events").insert(dates.map(date=>({...values,event_date:date,recurrence_group_id:dates.length>1?group:null,recurrence_rule:draft.recurrence})));if(saveError)setError(saveError.message);else{setDraft(null);await load();}}
    setSaving(false);
  }
  async function moveEvent(id:string,date:string){const previous=events;setEvents(items=>items.map(item=>item.id===id?{...item,event_date:date}:item));const {error:moveError}=await createSupabaseBrowserClient().from("events").update({event_date:date,updated_at:new Date().toISOString()}).eq("id",id);if(moveError){setEvents(previous);setError(moveError.message);}}

  const eventButton=(event:EventRecord)=><button key={event.id} draggable onDragStart={e=>e.dataTransfer.setData("text/event-id",event.id)} onClick={()=>editEvent(event)} style={{width:"100%",textAlign:"left",padding:"12px",borderRadius:10,border:`1px solid ${hostColour(event.host_name||event.host_id)}`,background:`${hostColour(event.host_name||event.host_id)}22`,color:"#fff",cursor:"pointer",marginBottom:7}}><strong style={{fontSize:18}}>{String(event.start_time).slice(0,5)} · {event.venue?.venue_name||event.event_name}</strong><span style={{display:"block",fontSize:16,color:"#B9A8D9",marginTop:4}}>{event.quiz?.name||"No Quiz Plan"} · {event.status}</span></button>;

  if(loading)return <HostShell><main style={{minHeight:"100vh",background:BG,display:"grid",placeItems:"center"}}><HostLoading title="Event Calendar" note="Loading venues and events…"/></main></HostShell>;
  return <HostShell><main style={{minHeight:"100vh",background:BG,color:"#fff",padding:"24px 32px"}}>
    <header className="fbh-top"><span className="fbh-wm"><span className="q">QUIZ-</span>IT</span><span className="fbh-bc">Event Calendar</span><TopSpacer/><Link className="fbh-btn" href="/host/venues">Venue Manager</Link><Link className="fbh-btn" href="/host/session">Live Sessions</Link><button className="fbh-btn pri" onClick={()=>chooseDate(localDateKey())}>Schedule Event</button></header>
    <section className="fbh-panel" style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",margin:"18px 0"}}>
      <button className="fbh-btn" onClick={()=>setAnchor(new Date(anchor.getFullYear(),anchor.getMonth()-1,1))}>←</button><strong style={{fontSize:20,minWidth:190}}>{anchor.toLocaleDateString("en-GB",{month:"long",year:"numeric"})}</strong><button className="fbh-btn" onClick={()=>setAnchor(new Date(anchor.getFullYear(),anchor.getMonth()+1,1))}>→</button>
      {(["month","week","agenda"] as CalendarView[]).map(item=><button key={item} className={view===item?"fbh-btn pri":"fbh-btn"} onClick={()=>setView(item)}>{item.toUpperCase()}</button>)}<TopSpacer/>
      <select style={field} value={filters.venue} onChange={e=>setFilters(v=>({...v,venue:e.target.value}))}><option value="">All venues</option>{venues.map(v=><option key={v.id} value={v.id}>{v.venue_name}</option>)}</select>
      <select style={field} value={filters.host} onChange={e=>setFilters(v=>({...v,host:e.target.value}))}><option value="">All hosts</option>{hosts.map(name=><option key={name} value={name}>{name}</option>)}</select>
      <select style={field} value={filters.status} onChange={e=>setFilters(v=>({...v,status:e.target.value}))}><option value="">All statuses</option>{["draft","scheduled","live","completed","cancelled"].map(s=><option key={s}>{s}</option>)}</select>
    </section>
    {error&&<div className="fbh-panel" role="alert" style={{color:"#FF7070",marginBottom:12}}>{error}</div>}
    {view==="month"&&<section style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(120px,1fr))",border:"1px solid #2E1A52",borderRadius:16,overflow:"hidden"}}>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} style={{padding:10,background:"#150A2E",color:"#B9A8D9",fontWeight:700}}>{d}</div>)}{visibleDates.map(date=>{const key=localDateKey(date);return <div key={key} onDragOver={e=>e.preventDefault()} onDrop={e=>void moveEvent(e.dataTransfer.getData("text/event-id"),key)} onDoubleClick={()=>chooseDate(key)} style={{minHeight:128,padding:8,borderTop:"1px solid #2E1A52",borderRight:"1px solid #2E1A52",background:date.getMonth()===anchor.getMonth()?"rgba(21,10,46,.68)":"rgba(10,1,24,.45)"}}><button onClick={()=>chooseDate(key)} aria-label={`Schedule event on ${formatEventDate(key)}`} style={{background:"none",border:0,color:key===localDateKey()?"#D94FDC":"#fff",fontWeight:800,cursor:"pointer",marginBottom:7}}>{date.getDate()}</button>{filtered.filter(e=>e.event_date===key).map(eventButton)}</div>})}</section>}
    {view==="week"&&<section style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(150px,1fr))",gap:8}}>{weekDates.map(date=>{const key=localDateKey(date);return <div className="fbh-panel" key={key} onDragOver={e=>e.preventDefault()} onDrop={e=>void moveEvent(e.dataTransfer.getData("text/event-id"),key)} style={{minHeight:420}}><button onClick={()=>chooseDate(key)} className="fbh-btn" style={{width:"100%",marginBottom:10}}>{date.toLocaleDateString("en-GB",{weekday:"short",day:"numeric"})}</button>{filtered.filter(e=>e.event_date===key).map(eventButton)}</div>})}</section>}
    {view==="agenda"&&<section>{filtered.length?filtered.map(event=><article key={event.id} className="fbh-panel" style={{display:"grid",gridTemplateColumns:"160px 1fr auto",gap:18,alignItems:"center"}}><div><strong>{formatEventDate(event.event_date)}</strong><div style={{color:"#B9A8D9"}}>{formatEventTime(event.start_time)}</div></div><div><strong>{event.venue?.venue_name||event.event_name}</strong><div style={{color:"#B9A8D9",marginTop:4}}>{event.host_name||"Host"} · {event.quiz?.name||"No Quiz Plan"} · {event.status}</div></div><button className="fbh-btn" onClick={()=>editEvent(event)}>EDIT</button></article>):<div className="fbh-panel">No events match these filters.</div>}</section>}
    {draft&&<div onClick={()=>setDraft(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",zIndex:100,display:"flex",justifyContent:"flex-end"}}><aside onClick={e=>e.stopPropagation()} style={{width:"min(520px,94vw)",height:"100%",overflowY:"auto",background:"#0F0525",borderLeft:"1px solid #8A1B8D",padding:24}}><div style={{display:"flex",alignItems:"center",marginBottom:22}}><div><div className="fbh-lbl">{draft.id?"Edit Event":"Schedule Event"}</div><strong style={{fontSize:22}}>{formatEventDate(draft.date)}</strong></div><TopSpacer/><button className="fbh-btn" onClick={()=>setDraft(null)}>CLOSE</button></div>
      <label className="fbh-lbl">Venue</label><select style={field} value={draft.venueId} onChange={e=>chooseVenue(e.target.value)}><option value="">Choose venue…</option>{venues.map(v=><option key={v.id} value={v.id}>{v.venue_name}</option>)}</select>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:14}}><div><label className="fbh-lbl">Date</label><input style={field} type="date" value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></div><div><label className="fbh-lbl">Status</label><select style={field} value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as EventStatus})}>{["draft","scheduled","live","completed","cancelled"].map(s=><option key={s}>{s}</option>)}</select></div><div><label className="fbh-lbl">Start</label><input style={field} type="time" value={draft.start} onChange={e=>setDraft({...draft,start:e.target.value})}/></div><div><label className="fbh-lbl">End</label><input style={field} type="time" value={draft.end} onChange={e=>setDraft({...draft,end:e.target.value})}/></div></div>
      <label className="fbh-lbl" style={{marginTop:14}}>Host</label><input style={field} value={draft.hostName} onChange={e=>setDraft({...draft,hostName:e.target.value,hostId:draft.hostId||currentHost.id})}/>
      <label className="fbh-lbl" style={{marginTop:14}}>Quiz Plan</label><select style={field} value={draft.quizId} onChange={e=>setDraft({...draft,quizId:e.target.value})}><option value="">Choose Quiz Plan…</option>{quizzes.map(q=><option key={q.id} value={q.id}>{q.name}</option>)}</select>
      <label className="fbh-lbl" style={{marginTop:14}}>Special Offers Override</label><textarea style={field} rows={3} value={draft.offers} onChange={e=>setDraft({...draft,offers:e.target.value})} placeholder="Leave empty to inherit venue offers"/><label className="fbh-lbl" style={{marginTop:14}}>Sponsors Override</label><input style={field} value={draft.sponsors} onChange={e=>setDraft({...draft,sponsors:e.target.value})} placeholder="Leave empty to inherit venue sponsors"/><label className="fbh-lbl" style={{marginTop:14}}>Internal Notes</label><textarea style={field} rows={4} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/>
      {!draft.id&&<div className="fbh-panel" style={{marginTop:16}}><div className="fbh-lbl">Recurrence</div><select style={field} value={draft.recurrence.frequency} onChange={e=>setDraft({...draft,recurrence:{...draft.recurrence,frequency:e.target.value as RecurrenceRule["frequency"]}})}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom_weeks">Every X weeks</option></select>{draft.recurrence.frequency!=="none"&&<><label className="fbh-lbl" style={{marginTop:10}}>Interval</label><input style={field} type="number" min={1} max={52} value={draft.recurrence.interval} onChange={e=>setDraft({...draft,recurrence:{...draft.recurrence,interval:Number(e.target.value)||1}})}/><label className="fbh-lbl" style={{marginTop:10}}>Ends</label><select style={field} value={draft.recurrence.end} onChange={e=>setDraft({...draft,recurrence:{...draft.recurrence,end:e.target.value as RecurrenceRule["end"]}})}><option value="never">Never (create next 52)</option><option value="date">Specific date</option><option value="occurrences">Number of occurrences</option></select>{draft.recurrence.end==="date"&&<input style={{...field,marginTop:8}} type="date" value={draft.recurrence.endDate||draft.date} onChange={e=>setDraft({...draft,recurrence:{...draft.recurrence,endDate:e.target.value}})}/>} {draft.recurrence.end==="occurrences"&&<input style={{...field,marginTop:8}} type="number" min={1} max={104} value={draft.recurrence.occurrences||1} onChange={e=>setDraft({...draft,recurrence:{...draft.recurrence,occurrences:Number(e.target.value)||1}})}/>}</>}</div>}
      <button className="fbh-btn pri big" disabled={saving||!draft.venueId||!draft.quizId||!draft.hostId} onClick={saveDraft} style={{width:"100%",marginTop:18}}>{saving?"SAVING…":draft.id?"SAVE EVENT":"CREATE EVENT"}</button>{draft.id&&<Link className="fbh-btn big" href={`/host/session?event=${draft.id}`} style={{display:"flex",justifyContent:"center",marginTop:10}}>OPEN LIVE SESSION</Link>}</aside></div>}
  </main></HostShell>;
}
