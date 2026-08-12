"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ImageUploader } from "@/components/ImageUploader";
import { VideoUploader } from "@/components/VideoUploader";
import { HostButton, HostInput, HostLabel, HostLoading, HostShell } from "@/components/fable/HostConsole";

const BG="radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";
const DAYS=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
type Venue={id:string;day_of_week:number;venue_name:string;venue_logo_url:string|null;hero_image_url:string|null;hero_video_url:string|null;gallery_images:string[];address:string|null;google_maps_url:string|null;contact_name:string|null;contact_email:string|null;contact_phone:string|null;website:string|null;social_links:Record<string,string>;default_host_id:string|null;default_host_name:string|null;default_quiz_day:number|null;default_start_time:string|null;default_end_time:string|null;food_offers:string|null;drink_offers:string|null;happy_hour:string|null;prize_information:string|null;sponsors:string[];brand_colours:Record<string,string>;display_slides:string[];display_adverts:string[];notes:string|null;active:boolean};
type Offer={id:string;venue_id:string|null;image_url:string;active:boolean;start_date:string|null;end_date:string|null;sort_order:number};
type FormState={venue_name:string;venue_logo_url:string;hero_image_url:string;hero_video_url:string;gallery_images:string[];address:string;google_maps_url:string;contact_name:string;contact_email:string;contact_phone:string;website:string;social_links:string;default_host_id:string;default_host_name:string;default_quiz_day:string;default_start_time:string;default_end_time:string;food_offers:string;drink_offers:string;happy_hour:string;prize_information:string;sponsors:string;brand_colours:string;display_slides:string;display_adverts:string;notes:string;active:boolean};
const empty:FormState={venue_name:"",venue_logo_url:"",hero_image_url:"",hero_video_url:"",gallery_images:[],address:"",google_maps_url:"",contact_name:"",contact_email:"",contact_phone:"",website:"",social_links:"",default_host_id:"",default_host_name:"",default_quiz_day:"",default_start_time:"19:30",default_end_time:"21:30",food_offers:"",drink_offers:"",happy_hour:"",prize_information:"",sponsors:"",brand_colours:"",display_slides:"",display_adverts:"",notes:"",active:true};
const textArea={width:"100%",padding:"11px 14px",borderRadius:12,background:"#150A2E",color:"#fff",border:"1px solid #2E1A52",font:"500 13px Inter"} as const;
const split=(value:string)=>value.split(",").map(v=>v.trim()).filter(Boolean);
const pairs=(value:string)=>Object.fromEntries(split(value).map(item=>{const [key,...rest]=item.split(":");return [key.trim(),rest.join(":").trim()]}).filter(([,value])=>value));
const pairText=(value:Record<string,string>|null)=>Object.entries(value||{}).map(([key,item])=>`${key}: ${item}`).join(", ");
function toForm(venue:Venue):FormState{return{venue_name:venue.venue_name||"",venue_logo_url:venue.venue_logo_url||"",hero_image_url:venue.hero_image_url||"",hero_video_url:venue.hero_video_url||"",gallery_images:venue.gallery_images||[],address:venue.address||"",google_maps_url:venue.google_maps_url||"",contact_name:venue.contact_name||"",contact_email:venue.contact_email||"",contact_phone:venue.contact_phone||"",website:venue.website||"",social_links:pairText(venue.social_links),default_host_id:venue.default_host_id||"",default_host_name:venue.default_host_name||"",default_quiz_day:venue.default_quiz_day==null?"":String(venue.default_quiz_day),default_start_time:venue.default_start_time?.slice(0,5)||"",default_end_time:venue.default_end_time?.slice(0,5)||"",food_offers:venue.food_offers||"",drink_offers:venue.drink_offers||"",happy_hour:venue.happy_hour||"",prize_information:venue.prize_information||"",sponsors:(venue.sponsors||[]).join(", "),brand_colours:pairText(venue.brand_colours),display_slides:(venue.display_slides||[]).join(", "),display_adverts:(venue.display_adverts||[]).join(", "),notes:venue.notes||"",active:venue.active};}

export default function VenueManagerPage(){
  const [venues,setVenues]=useState<Venue[]>([]);const [quizzes,setQuizzes]=useState<{id:string;name:string}[]>([]);const [host,setHost]=useState({id:"",name:"Current host"});const [form,setForm]=useState<FormState>(empty);const [editing,setEditing]=useState<string|null>(null);const [section,setSection]=useState("profile");const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState("");const [offers,setOffers]=useState<Offer[]>([]);const [offerBusy,setOfferBusy]=useState<string|null>(null);
  const load=useCallback(async()=>{const supabase=createSupabaseBrowserClient();const[{data:venueData,error:venueError},{data:quizData},{data:userData},{data:offerData}]=await Promise.all([supabase.from("venues").select("*").order("venue_name"),supabase.from("quizzes").select("id,name").eq("archived",false).order("name"),supabase.auth.getUser(),supabase.from("venue_offers").select("*").order("sort_order")]);setVenues((venueData||[]) as Venue[]);setQuizzes(quizData||[]);const user=userData.user;setHost({id:user?.id||"",name:String(user?.user_metadata?.full_name||user?.user_metadata?.name||user?.email||"Current host")});setOffers((offerData||[]) as Offer[]);if(venueError)setError(venueError.message);setLoading(false);},[]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);
  // Deep link from the Calendar event drawer's "Edit venue" link - open
  // straight into that venue's profile instead of landing on the plain list.
  useEffect(()=>{if(loading||!venues.length)return;const id=new URLSearchParams(window.location.search).get("id");if(!id)return;const match=venues.find(v=>v.id===id);if(match)edit(match);},[venues,loading]);
  function set<K extends keyof FormState>(key:K,value:FormState[K]){setForm(current=>({...current,[key]:value}));}
  function edit(venue:Venue){setEditing(venue.id);setForm(toForm(venue));setSection("profile");window.scrollTo({top:0,behavior:"smooth"});}
  function clear(){setEditing(null);setForm({...empty,default_host_id:host.id,default_host_name:host.name});setSection("profile");setError("");}
  async function save(){if(!form.venue_name.trim())return;setSaving(true);setError("");const payload={venue_name:form.venue_name.trim(),venue_logo_url:form.venue_logo_url||null,hero_image_url:form.hero_image_url||null,hero_video_url:form.hero_video_url||null,gallery_images:form.gallery_images,address:form.address||null,google_maps_url:form.google_maps_url||null,contact_name:form.contact_name||null,contact_email:form.contact_email||null,contact_phone:form.contact_phone||null,website:form.website||null,social_links:pairs(form.social_links),default_host_id:form.default_host_id||host.id,default_host_name:form.default_host_name||null,default_quiz_day:form.default_quiz_day===""?null:Number(form.default_quiz_day),default_start_time:form.default_start_time||null,default_end_time:form.default_end_time||null,food_offers:form.food_offers||null,drink_offers:form.drink_offers||null,happy_hour:form.happy_hour||null,prize_information:form.prize_information||null,sponsors:split(form.sponsors),brand_colours:pairs(form.brand_colours),display_slides:split(form.display_slides),display_adverts:split(form.display_adverts),notes:form.notes||null,active:form.active,updated_at:new Date().toISOString()};const supabase=createSupabaseBrowserClient();
    const result=editing
      ?await supabase.from("venues").update(payload).eq("id",editing).select().single()
      :await supabase.from("venues").insert({...payload,day_of_week:venues.reduce((max,v)=>Math.max(max,v.day_of_week),-1)+1}).select().single();
    if(result.error)setError(result.error.message);
    else{
      // Stay on the venue that was just saved (whether newly created or an
      // existing one) instead of wiping the form back to a blank "New
      // Venue" draft - a save should never discard your place, only "New
      // Venue" or picking a different venue from the list should.
      setEditing(result.data.id);
      setForm(toForm(result.data as Venue));
      await load();
    }
    setSaving(false);}
  async function uploadOffer(file:File,targetVenueId:string|null){
    setOfferBusy(targetVenueId||"generic");setError("");
    try{
      const formData=new FormData();formData.append("file",file);
      const res=await fetch("/api/upload-image",{method:"POST",body:formData});
      const raw=await res.text();let data:{url?:string;error?:{message?:string}}={};
      try{data=raw?JSON.parse(raw):{};}catch{throw new Error(!res.ok?(raw.slice(0,120)||"Upload failed"):"Upload failed - unexpected server response");}
      if(!res.ok||data.error||!data.url)throw new Error(data?.error?.message||"Upload failed");
      const supabase=createSupabaseBrowserClient();
      const nextOrder=offers.filter(o=>o.venue_id===targetVenueId).length;
      const{data:inserted,error:insertError}=await supabase.from("venue_offers").insert({venue_id:targetVenueId,image_url:data.url,active:true,sort_order:nextOrder}).select().single();
      if(insertError)setError(insertError.message);else setOffers(prev=>[...prev,inserted as Offer]);
    }catch(e){setError(e instanceof Error?e.message:"Upload failed");}
    finally{setOfferBusy(null);}
  }
  async function deleteOffer(id:string){
    const supabase=createSupabaseBrowserClient();
    await supabase.from("venue_offers").delete().eq("id",id);
    setOffers(prev=>prev.filter(o=>o.id!==id));
  }
  async function toggleOffer(offer:Offer){
    const supabase=createSupabaseBrowserClient();
    await supabase.from("venue_offers").update({active:!offer.active}).eq("id",offer.id);
    setOffers(prev=>prev.map(o=>o.id===offer.id?{...o,active:!o.active}:o));
  }
  async function updateOfferDates(id:string,startDate:string,endDate:string){
    const supabase=createSupabaseBrowserClient();
    const payload={start_date:startDate||null,end_date:endDate||null};
    await supabase.from("venue_offers").update(payload).eq("id",id);
    setOffers(prev=>prev.map(o=>o.id===id?{...o,...payload}:o));
  }
  if(loading)return <HostShell><main style={{minHeight:"100vh",background:BG,display:"grid",placeItems:"center"}}><HostLoading title="Venue Manager" note="Loading permanent venue profiles…"/></main></HostShell>;
  const sections=["profile","schedule","experience","offers","media","notes"];
  return <HostShell><main className="qi-bo-page"><header className="qi-bo-pagehead"><div><p>Business profiles</p><h1>Venues</h1><span>Everything Quiz-It should remember about each venue.</span></div><div style={{display:"flex",gap:12}}><Link className="fbh-btn" href="/host/events">Calendar</Link><button className="fbh-btn pri" onClick={clear}>New Venue</button></div></header>
    <div className="qi-bo-venue-layout"><aside className="qi-bo-venue-list"><h2>Venue profiles</h2>{venues.map(venue=><button key={venue.id} onClick={()=>edit(venue)} aria-pressed={editing===venue.id}><span className="qi-bo-venue-logo">{venue.venue_logo_url?<Image unoptimized src={venue.venue_logo_url} width={64} height={64} alt=""/>:venue.venue_name.slice(0,2).toUpperCase()}</span><span><strong>{venue.venue_name}</strong><small>{venue.default_quiz_day==null?"Schedule not set":`${DAYS[venue.default_quiz_day]} · ${venue.default_start_time?.slice(0,5)||"Time needed"}`}</small></span><i>{venue.active?"Active":"Inactive"}</i></button>)}</aside>
      <section className="qi-bo-venue-profile"><header><div><p>{editing?"Venue profile":"New venue"}</p><input value={form.venue_name} onChange={e=>set("venue_name",e.target.value)} placeholder="Name this venue" aria-label="Venue name" style={{background:"transparent",border:"none",borderBottom:"2px solid "+(form.venue_name.trim()?"transparent":"#FFC533"),color:"#fff",font:"700 28px Inter",padding:"2px 0",width:"100%",maxWidth:420}}/></div><span className={form.active?"qi-bo-status live":"qi-bo-status cancelled"}>{form.active?"Active":"Inactive"}</span></header>
        <nav className="qi-bo-profile-tabs" aria-label="Venue profile sections">{sections.map(item=><button key={item} aria-pressed={section===item} onClick={()=>setSection(item)}>{item}</button>)}</nav>
        {section==="profile"&&<div className="qi-bo-profile-section"><h3>Business profile</h3><p>The identity and contact details used throughout the Back Office.</p><HostLabel>Venue Name</HostLabel><HostInput value={form.venue_name} onChange={e=>set("venue_name",e.target.value)}/><HostLabel>Logo</HostLabel><ImageUploader key={"logo-"+(editing||"new")} currentUrl={form.venue_logo_url||null} onUploaded={url=>set("venue_logo_url",url)}/><div className="qi-bo-form-grid"><Field label="Address" value={form.address} set={v=>set("address",v)}/><Field label="Google Maps Link" value={form.google_maps_url} set={v=>set("google_maps_url",v)}/><Field label="Contact Name" value={form.contact_name} set={v=>set("contact_name",v)}/><Field label="Contact Email" type="email" value={form.contact_email} set={v=>set("contact_email",v)}/><Field label="Contact Phone" value={form.contact_phone} set={v=>set("contact_phone",v)}/><Field label="Website" value={form.website} set={v=>set("website",v)}/></div><HostLabel>Facebook and Instagram</HostLabel><HostInput value={form.social_links} onChange={e=>set("social_links",e.target.value)} placeholder="instagram: URL, facebook: URL"/></div>}
        {section==="schedule"&&<div className="qi-bo-profile-section"><h3>Quiz defaults</h3><p>Choose once. New calendar events inherit these details automatically.</p><div className="qi-bo-form-grid"><Field label="Default Host" value={form.default_host_name} set={v=>set("default_host_name",v)} placeholder={host.name}/><div><HostLabel>Default Quiz Day</HostLabel><select value={form.default_quiz_day} onChange={e=>set("default_quiz_day",e.target.value)}><option value="">Choose a day</option>{DAYS.map((day,index)=><option key={day} value={index}>{day}</option>)}</select></div><Field label="Start Time" type="time" value={form.default_start_time} set={v=>set("default_start_time",v)}/><Field label="End Time" type="time" value={form.default_end_time} set={v=>set("default_end_time",v)}/></div></div>}
        {section==="experience"&&<div className="qi-bo-profile-section"><h3>Venue experience</h3><p>Commercial content inherited by every event at this venue.</p>{[["food_offers","Food Offers"],["drink_offers","Drink Offers"],["happy_hour","Happy Hour"],["prize_information","Prize Information"],["sponsors","Sponsors"],["brand_colours","Brand Colours"]].map(([key,label])=><Area key={key} label={label} value={String(form[key as keyof FormState]||"")} setValue={v=>set(key as keyof FormState,v as never)}/>)}</div>}
        {section==="offers"&&<div className="qi-bo-profile-section"><h3>Offers &amp; Display Graphics</h3><p>PNG or JPEG images that rotate on the display screen and player handsets during intermission. Leave dates blank to run indefinitely.</p>
          <div style={{marginBottom:28}}>
            <h4 style={{margin:"0 0 8px",font:"700 14px Inter"}}>This venue's offers</h4>
            {!editing&&<p style={{color:"#FFC533",fontSize:13}}>Save this venue first to upload offers just for it.</p>}
            {editing&&<label style={{display:"inline-block",padding:"10px 16px",borderRadius:10,background:"#150A2E",border:"1px dashed #2E1A52",color:"#D9CCF2",cursor:"pointer",fontSize:13}}>{offerBusy===editing?"Uploading…":"+ Upload offer image"}<input type="file" accept="image/jpeg,image/png" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadOffer(f,editing);e.target.value="";}}/></label>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12,marginTop:12}}>
              {offers.filter(o=>o.venue_id===editing).map(o=><OfferCard key={o.id} offer={o} onDelete={()=>deleteOffer(o.id)} onToggle={()=>toggleOffer(o)} onDates={(s,e)=>updateOfferDates(o.id,s,e)}/>)}
              {editing&&offers.filter(o=>o.venue_id===editing).length===0&&<p style={{color:"#6B5A8E",fontSize:13}}>No offers uploaded for this venue yet.</p>}
            </div>
          </div>
          <div>
            <h4 style={{margin:"0 0 8px",font:"700 14px Inter"}}>Generic offers (shown at every venue)</h4>
            <label style={{display:"inline-block",padding:"10px 16px",borderRadius:10,background:"#150A2E",border:"1px dashed #2E1A52",color:"#D9CCF2",cursor:"pointer",fontSize:13}}>{offerBusy==="generic"?"Uploading…":"+ Upload generic offer image"}<input type="file" accept="image/jpeg,image/png" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadOffer(f,null);e.target.value="";}}/></label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12,marginTop:12}}>
              {offers.filter(o=>o.venue_id===null).map(o=><OfferCard key={o.id} offer={o} onDelete={()=>deleteOffer(o.id)} onToggle={()=>toggleOffer(o)} onDates={(s,e)=>updateOfferDates(o.id,s,e)}/>)}
              {offers.filter(o=>o.venue_id===null).length===0&&<p style={{color:"#6B5A8E",fontSize:13}}>No generic offers yet.</p>}
            </div>
          </div>
        </div>}
        {section==="media"&&<div className="qi-bo-profile-section"><h3>Display media</h3><p>Visual assets preloaded for the venue experience.</p><HostLabel>Hero Image</HostLabel><ImageUploader key={"hero-"+(editing||"new")} currentUrl={form.hero_image_url||null} onUploaded={url=>set("hero_image_url",url)}/><HostLabel>Hero Video (plays on the display screen instead of the Hero Image, when set)</HostLabel><VideoUploader key={"herovid-"+(editing||"new")} currentUrl={form.hero_video_url||null} onUploaded={url=>set("hero_video_url",url)}/><HostLabel>Gallery</HostLabel><ImageUploader key={"gallery-"+(editing||"new")} currentUrl={null} onUploaded={url=>set("gallery_images",[...form.gallery_images,url])}/><div className="qi-bo-gallery">{form.gallery_images.map(url=><div key={url}><Image unoptimized fill sizes="180px" src={url} alt="Venue gallery"/><button onClick={()=>set("gallery_images",form.gallery_images.filter(item=>item!==url))} aria-label="Remove gallery image">×</button></div>)}</div><Area label="Display Slides" value={form.display_slides} setValue={v=>set("display_slides",v)}/><Area label="Display Adverts" value={form.display_adverts} setValue={v=>set("display_adverts",v)}/></div>}
        {section==="notes"&&<div className="qi-bo-profile-section"><h3>Internal notes</h3><p>Private operational information for hosts and administrators.</p><Area label="Notes" value={form.notes} setValue={v=>set("notes",v)} rows={8}/><div className="qi-bo-active-row"><div><strong>Venue availability</strong><span>{form.active?"Available when scheduling events":"Hidden from new event scheduling"}</span></div><button className="fbh-btn" onClick={()=>set("active",!form.active)}>{form.active?"Deactivate venue":"Activate venue"}</button></div></div>}
        {error&&<div className="qi-bo-alert" role="alert">{error}</div>}<footer><span>{!form.venue_name.trim()?<span style={{color:"#FFC533"}}>Enter a Venue Name on the Profile tab to save.</span>:editing?"Changes apply to future events. Live sessions keep their snapshot.":"Complete the profile at your own pace."}</span><HostButton variant="pri" big onClick={()=>{if(!form.venue_name.trim()){setSection("profile");return;}save();}} disabled={saving}>{saving?"Saving…":editing?"Save venue":"Create venue"}</HostButton></footer>
      </section></div></main></HostShell>;
}

function Field({label,value,set,type="text",placeholder}:{label:string;value:string;set:(value:string)=>void;type?:string;placeholder?:string}){return <div><HostLabel>{label}</HostLabel><HostInput type={type} value={value} placeholder={placeholder} onChange={event=>set(event.target.value)}/></div>}
function OfferCard({offer,onDelete,onToggle,onDates}:{offer:Offer;onDelete:()=>void;onToggle:()=>void;onDates:(start:string,end:string)=>void}){
  return <div style={{borderRadius:12,overflow:"hidden",border:"1px solid "+(offer.active?"#2E1A52":"#5A1B1B"),opacity:offer.active?1:0.55}}>
    <div style={{position:"relative",width:"100%",aspectRatio:"1"}}><Image unoptimized fill sizes="160px" src={offer.image_url} alt="Offer"/></div>
    <div style={{padding:10,display:"grid",gap:6,background:"#150A2E"}}>
      <div style={{display:"flex",gap:6}}>
        <button onClick={onToggle} style={{flex:1,padding:"5px 8px",borderRadius:8,background:offer.active?"rgba(46,224,110,0.15)":"rgba(255,255,255,0.06)",border:"1px solid "+(offer.active?"#2EE06E":"#2E1A52"),color:offer.active?"#2EE06E":"#6B5A8E",fontSize:11,cursor:"pointer"}}>{offer.active?"Active":"Paused"}</button>
        <button onClick={onDelete} style={{padding:"5px 8px",borderRadius:8,background:"rgba(255,59,78,0.1)",border:"1px solid rgba(255,59,78,0.3)",color:"#FF7280",fontSize:11,cursor:"pointer"}}>Delete</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
        <input type="date" defaultValue={offer.start_date||""} onBlur={e=>onDates(e.target.value,offer.end_date||"")} style={{padding:"4px 6px",borderRadius:6,background:"#0A0118",border:"1px solid #2E1A52",color:"#fff",fontSize:11}}/>
        <input type="date" defaultValue={offer.end_date||""} onBlur={e=>onDates(offer.start_date||"",e.target.value)} style={{padding:"4px 6px",borderRadius:6,background:"#0A0118",border:"1px solid #2E1A52",color:"#fff",fontSize:11}}/>
      </div>
      <div style={{fontSize:10,color:"#6B5A8E"}}>Start / end date (optional)</div>
    </div>
  </div>;
}
function Area({label,value,setValue,rows=3}:{label:string;value:string;setValue:(value:string)=>void;rows?:number}){return <div><HostLabel>{label}</HostLabel><textarea style={textArea} rows={rows} value={value} onChange={event=>setValue(event.target.value)}/></div>}
