"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ImageUploader } from "@/components/ImageUploader";
import { VideoUploader } from "@/components/VideoUploader";
import { HostButton, HostInput, HostLabel, HostLoading, HostShell } from "@/components/fable/HostConsole";
import { useConfirmDialog } from "@/components/ui/quiz-it-ui";
import { buildVenueIntroVideo } from "@/lib/reel/buildVenueIntro";
import { getMediaUrl } from "@/lib/getMediaUrl";

const BG="radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";
const DAYS=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
type Venue={id:string;day_of_week:number;venue_name:string;venue_logo_url:string|null;hero_image_url:string|null;hero_video_url:string|null;gallery_images:string[];address:string|null;google_maps_url:string|null;contact_name:string|null;contact_email:string|null;contact_phone:string|null;website:string|null;social_links:Record<string,string>;default_host_id:string|null;default_host_name:string|null;host_photo_url:string|null;default_quiz_day:number|null;default_start_time:string|null;default_end_time:string|null;food_offers:string|null;drink_offers:string|null;happy_hour:string|null;prize_information:string|null;sponsors:string[];brand_colours:Record<string,string>;display_slides:string[];display_adverts:string[];notes:string|null;active:boolean};
type Offer={id:string;venue_id:string|null;image_url:string;active:boolean;start_date:string|null;end_date:string|null;sort_order:number};
type FormState={venue_name:string;venue_logo_url:string;hero_image_url:string;hero_video_url:string;gallery_images:string[];address:string;google_maps_url:string;contact_name:string;contact_email:string;contact_phone:string;website:string;social_links:string;default_host_id:string;default_host_name:string;host_photo_url:string;default_quiz_day:string;default_start_time:string;default_end_time:string;food_offers:string;drink_offers:string;happy_hour:string;prize_information:string;sponsors:string;brand_colours:string;display_slides:string;display_adverts:string;notes:string;active:boolean};
const empty:FormState={venue_name:"",venue_logo_url:"",hero_image_url:"",hero_video_url:"",gallery_images:[],address:"",google_maps_url:"",contact_name:"",contact_email:"",contact_phone:"",website:"",social_links:"",default_host_id:"",default_host_name:"",host_photo_url:"",default_quiz_day:"",default_start_time:"19:30",default_end_time:"21:30",food_offers:"",drink_offers:"",happy_hour:"",prize_information:"",sponsors:"",brand_colours:"",display_slides:"",display_adverts:"",notes:"",active:true};
const textArea={width:"100%",padding:"11px 14px",borderRadius:12,background:"#150A2E",color:"#fff",border:"1px solid #2E1A52",font:"500 13px Inter"} as const;
const split=(value:string)=>value.split(",").map(v=>v.trim()).filter(Boolean);
const MAX_OFFER_UPLOAD_EDGE=2000;
// Same conversion the ImageUploader component does for every other image
// field on this page - HEIC always needs converting (the server can't read
// it), and any photo bigger than ~4MB/2000px needs shrinking first, since a
// raw 8-15MB phone photo is well past what a Vercel serverless function
// will accept as a request body (the platform rejects it outright with a
// plain error page, before this app's own upload code ever runs). Offers
// used to skip this step entirely.
async function prepareOfferImage(file:File):Promise<File>{
  const isHeic=file.type==="image/heic"||file.type==="image/heif"||/\.(heic|heif)$/i.test(file.name);
  const img=document.createElement("img");const url=URL.createObjectURL(file);
  try{
    await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=reject;img.src=url;});
    if(!isHeic&&img.width<=MAX_OFFER_UPLOAD_EDGE&&img.height<=MAX_OFFER_UPLOAD_EDGE&&file.size<=4*1024*1024){
      return file;
    }
    const scale=Math.min(1,MAX_OFFER_UPLOAD_EDGE/Math.max(img.width,img.height));
    const canvas=document.createElement("canvas");canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
    const ctx=canvas.getContext("2d")!;ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const blob:Blob=await new Promise(resolve=>canvas.toBlob(b=>resolve(b!),"image/jpeg",0.85));
    return new File([blob],file.name.replace(/\.(heic|heif)$/i,"")+".jpg",{type:"image/jpeg"});
  }finally{URL.revokeObjectURL(url);}
}
const pairs=(value:string)=>Object.fromEntries(split(value).map(item=>{const [key,...rest]=item.split(":");return [key.trim(),rest.join(":").trim()]}).filter(([,value])=>value));
const pairText=(value:Record<string,string>|null)=>Object.entries(value||{}).map(([key,item])=>`${key}: ${item}`).join(", ");
function toForm(venue:Venue):FormState{return{venue_name:venue.venue_name||"",venue_logo_url:venue.venue_logo_url||"",hero_image_url:venue.hero_image_url||"",hero_video_url:venue.hero_video_url||"",gallery_images:venue.gallery_images||[],address:venue.address||"",google_maps_url:venue.google_maps_url||"",contact_name:venue.contact_name||"",contact_email:venue.contact_email||"",contact_phone:venue.contact_phone||"",website:venue.website||"",social_links:pairText(venue.social_links),default_host_id:venue.default_host_id||"",default_host_name:venue.default_host_name||"",host_photo_url:venue.host_photo_url||"",default_quiz_day:venue.default_quiz_day==null?"":String(venue.default_quiz_day),default_start_time:venue.default_start_time?.slice(0,5)||"",default_end_time:venue.default_end_time?.slice(0,5)||"",food_offers:venue.food_offers||"",drink_offers:venue.drink_offers||"",happy_hour:venue.happy_hour||"",prize_information:venue.prize_information||"",sponsors:(venue.sponsors||[]).join(", "),brand_colours:pairText(venue.brand_colours),display_slides:(venue.display_slides||[]).join(", "),display_adverts:(venue.display_adverts||[]).join(", "),notes:venue.notes||"",active:venue.active};}

export default function VenueManagerPage(){
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirmDialog();
  const [venues,setVenues]=useState<Venue[]>([]);const [quizzes,setQuizzes]=useState<{id:string;name:string}[]>([]);const [host,setHost]=useState({id:"",name:"Current host"});const [form,setForm]=useState<FormState>(empty);const [editing,setEditing]=useState<string|null>(null);const [section,setSection]=useState("profile");const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState("");const [offers,setOffers]=useState<Offer[]>([]);const [offerBusy,setOfferBusy]=useState<string|null>(null);const [introBusy,setIntroBusy]=useState(false);const [introProgress,setIntroProgress]=useState(0);const [introStatus,setIntroStatus]=useState("");
  const load=useCallback(async()=>{const supabase=createSupabaseBrowserClient();const[{data:venueData,error:venueError},{data:quizData},{data:userData},{data:offerData}]=await Promise.all([supabase.from("venues").select("*").order("venue_name"),supabase.from("quizzes").select("id,name").eq("archived",false).order("name"),supabase.auth.getUser(),supabase.from("venue_offers").select("*").order("sort_order")]);setVenues((venueData||[]) as Venue[]);setQuizzes(quizData||[]);const user=userData.user;setHost({id:user?.id||"",name:String(user?.user_metadata?.full_name||user?.user_metadata?.name||user?.email||"Current host")});setOffers((offerData||[]) as Offer[]);if(venueError)setError(venueError.message);setLoading(false);},[]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);
  // Deep link from the Calendar event drawer's "Edit venue" link - open
  // straight into that venue's profile instead of landing on the plain list.
  useEffect(()=>{if(loading||!venues.length)return;const id=new URLSearchParams(window.location.search).get("id");if(!id)return;const match=venues.find(v=>v.id===id);if(match)edit(match);},[venues,loading]);
  function set<K extends keyof FormState>(key:K,value:FormState[K]){setForm(current=>({...current,[key]:value}));}
  function edit(venue:Venue){setEditing(venue.id);setForm(toForm(venue));setSection("profile");window.scrollTo({top:0,behavior:"smooth"});}
  function clear(){setEditing(null);setForm({...empty,default_host_id:host.id,default_host_name:host.name});setSection("profile");setError("");}
  async function save(){if(!form.venue_name.trim())return;setSaving(true);setError("");const payload={venue_name:form.venue_name.trim(),venue_logo_url:form.venue_logo_url||null,hero_image_url:form.hero_image_url||null,hero_video_url:form.hero_video_url||null,gallery_images:form.gallery_images,address:form.address||null,google_maps_url:form.google_maps_url||null,contact_name:form.contact_name||null,contact_email:form.contact_email||null,contact_phone:form.contact_phone||null,website:form.website||null,social_links:pairs(form.social_links),default_host_id:form.default_host_id||host.id,default_host_name:form.default_host_name||null,host_photo_url:form.host_photo_url||null,default_quiz_day:form.default_quiz_day===""?null:Number(form.default_quiz_day),default_start_time:form.default_start_time||null,default_end_time:form.default_end_time||null,food_offers:form.food_offers||null,drink_offers:form.drink_offers||null,happy_hour:form.happy_hour||null,prize_information:form.prize_information||null,sponsors:split(form.sponsors),brand_colours:pairs(form.brand_colours),display_slides:split(form.display_slides),display_adverts:split(form.display_adverts),notes:form.notes||null,active:form.active,updated_at:new Date().toISOString()};const supabase=createSupabaseBrowserClient();
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
  // Builds a real animated video (canvas + MediaRecorder, entirely in the
  // browser) from whatever's already filled in on this venue's profile -
  // logo, prizes, schedule, host photo, socials - then uploads it and sets
  // it as the Hero Video, same as if it had been recorded and dropped in
  // manually. Requires the venue to already be saved (needs an id to attach
  // offers/media to consistently with everything else on this page).
  async function generateIntroVideo(){
    if(!editing){setError("Save this venue first, then generate its intro video.");return;}
    setIntroBusy(true);setIntroProgress(0);setIntroStatus("Rendering…");setError("");
    try{
      const scheduleDay=form.default_quiz_day===""?null:DAYS[Number(form.default_quiz_day)];
      const scheduleText=scheduleDay&&form.default_start_time?`${scheduleDay}s at ${form.default_start_time}`:scheduleDay?`${scheduleDay}s`:form.default_start_time||null;
      const{blob,fileExt}=await buildVenueIntroVideo({
        venueName:form.venue_name||null,
        venueLogoUrl:form.venue_logo_url||null,
        prizeInfo:form.prize_information||null,
        scheduleText,
        hostName:form.default_host_name||null,
        hostPhotoUrl:form.host_photo_url||null,
        website:form.website||null,
        socialLinks:pairs(form.social_links),
        onProgress:f=>setIntroProgress(f),
      });
      setIntroStatus("Uploading…");
      const file=new File([blob],(form.venue_name||"venue").replace(/\s+/g,"-").toLowerCase()+"-intro."+fileExt,{type:blob.type});
      const formData=new FormData();formData.append("file",file);
      const res=await fetch("/api/upload-video",{method:"POST",body:formData});
      const raw=await res.text();let data:{url?:string;error?:{message?:string}}={};
      try{data=raw?JSON.parse(raw):{};}catch{throw new Error(!res.ok?(raw.slice(0,120)||"Upload failed"):"Upload failed - unexpected server response");}
      if(!res.ok||data.error||!data.url)throw new Error(data?.error?.message||"Upload failed");
      set("hero_video_url",data.url);
      const supabase=createSupabaseBrowserClient();
      await supabase.from("venues").update({hero_video_url:data.url,updated_at:new Date().toISOString()}).eq("id",editing);
      setVenues(prev=>prev.map(v=>v.id===editing?{...v,hero_video_url:data.url as string}:v));
      setIntroStatus("Done - saved as this venue's Hero Video.");
      setTimeout(()=>setIntroStatus(""),4000);
    }catch(e){
      setError(e instanceof Error?e.message:"Couldn't generate the video - please try again.");
      setIntroStatus("");
    }finally{
      setIntroBusy(false);
    }
  }
  async function uploadOffer(file:File,targetVenueId:string|null){
    setOfferBusy(targetVenueId||"generic");setError("");
    try{
      // HEIC needs converting (server can't read it) and any large phone
      // photo needs shrinking first, so it fits the server's request-size
      // limit - see prepareOfferImage's comment above.
      const ready=await prepareOfferImage(file);
      const formData=new FormData();formData.append("file",ready);
      const res=await fetch("/api/upload-image",{method:"POST",body:formData});
      const raw=await res.text();let data:{url?:string;error?:{message?:string}}={};
      try{data=raw?JSON.parse(raw):{};}catch{throw new Error(!res.ok?`Upload failed (server error ${res.status}) - try a smaller image or a different file.`:"Upload failed - unexpected server response");}
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
  async function reorderOffers(orderedIds:string[]){
    setOffers(prev=>{
      const order=new Map(orderedIds.map((id,i)=>[id,i]));
      return prev.map(o=>order.has(o.id)?{...o,sort_order:order.get(o.id)!}:o);
    });
    const supabase=createSupabaseBrowserClient();
    await Promise.all(orderedIds.map((id,i)=>supabase.from("venue_offers").update({sort_order:i}).eq("id",id)));
  }
  async function deleteVenue(venue:Venue){
    if(!(await confirmDialog(`Delete "${venue.venue_name}"? This can't be undone. Past events at this venue keep their own record, but it will disappear from scheduling and this list.`,{tone:"destructive",confirmLabel:"Delete"})))return;
    setSaving(true);setError("");
    const supabase=createSupabaseBrowserClient();
    const{error:deleteError}=await supabase.from("venues").delete().eq("id",venue.id);
    if(deleteError){
      // Most likely a foreign-key reference (a Calendar event still points at
      // this venue) - "Deactivate" is the safe fallback in that case.
      setError(deleteError.message.includes("foreign key")?`Can't delete "${venue.venue_name}" - it's still linked to one or more Calendar events. Try Deactivate instead, or remove/reassign those events first.`:deleteError.message);
    }else{
      setOffers(prev=>prev.filter(o=>o.venue_id!==venue.id));
      if(editing===venue.id)clear();
      await load();
    }
    setSaving(false);
  }
  if(loading)return <HostShell><main style={{minHeight:"100vh",background:BG,display:"grid",placeItems:"center"}}><HostLoading title="Venue Manager" note="Loading permanent venue profiles…"/></main></HostShell>;
  const sections=["profile","schedule","experience","offers","media","notes"];
  return <HostShell>{confirmDialogEl}<main className="qi-bo-page"><header className="qi-bo-pagehead"><div><p>Business profiles</p><h1>Venues</h1><span>Everything Quiz-It should remember about each venue.</span></div><div style={{display:"flex",gap:12}}><Link className="fbh-btn" href="/host/events">Calendar</Link><button className="fbh-btn pri" onClick={clear}>New Venue</button></div></header>
    <div className="qi-bo-venue-layout"><aside className="qi-bo-venue-list"><h2>Venue profiles</h2>{venues.map(venue=><div key={venue.id} style={{position:"relative"}}><button onClick={()=>edit(venue)} aria-pressed={editing===venue.id} style={{width:"100%"}}><span className="qi-bo-venue-logo">{venue.venue_logo_url?<Image unoptimized src={venue.venue_logo_url} width={64} height={64} alt=""/>:venue.venue_name.slice(0,2).toUpperCase()}</span><span><strong>{venue.venue_name}</strong><small>{venue.default_quiz_day==null?"Schedule not set":`${DAYS[venue.default_quiz_day]} · ${venue.default_start_time?.slice(0,5)||"Time needed"}`}</small></span><i>{venue.active?"Active":"Inactive"}</i></button><button onClick={e=>{e.stopPropagation();deleteVenue(venue);}} aria-label={`Delete ${venue.venue_name}`} title="Delete venue" style={{position:"absolute",top:8,right:8,width:24,height:24,borderRadius:8,background:"rgba(255,59,78,0.12)",border:"1px solid rgba(255,59,78,0.35)",color:"#FF7280",fontSize:13,lineHeight:1,cursor:"pointer",display:"grid",placeItems:"center"}}>×</button></div>)}</aside>
      <section className="qi-bo-venue-profile"><header><div><p>{editing?"Venue profile":"New venue"}</p><input value={form.venue_name} onChange={e=>set("venue_name",e.target.value)} placeholder="Name this venue" aria-label="Venue name" style={{background:"transparent",border:"none",borderBottom:"2px solid "+(form.venue_name.trim()?"transparent":"#FFC533"),color:"#fff",font:"700 28px Inter",padding:"2px 0",width:"100%",maxWidth:420}}/></div><span className={form.active?"qi-bo-status live":"qi-bo-status cancelled"}>{form.active?"Active":"Inactive"}</span></header>
        <nav className="qi-bo-profile-tabs" aria-label="Venue profile sections">{sections.map(item=><button key={item} aria-pressed={section===item} onClick={()=>setSection(item)}>{item}</button>)}</nav>
        {section==="profile"&&<div className="qi-bo-profile-section"><h3>Business profile</h3><p>The identity and contact details used throughout the Back Office.</p><HostLabel>Venue Name</HostLabel><HostInput value={form.venue_name} onChange={e=>set("venue_name",e.target.value)}/><HostLabel>Logo</HostLabel><ImageUploader key={"logo-"+(editing||"new")} currentUrl={form.venue_logo_url||null} onUploaded={url=>set("venue_logo_url",url)}/><div className="qi-bo-form-grid"><Field label="Address" value={form.address} set={v=>set("address",v)}/><Field label="Google Maps Link" value={form.google_maps_url} set={v=>set("google_maps_url",v)}/><Field label="Contact Name" value={form.contact_name} set={v=>set("contact_name",v)}/><Field label="Contact Email" type="email" value={form.contact_email} set={v=>set("contact_email",v)}/><Field label="Contact Phone" value={form.contact_phone} set={v=>set("contact_phone",v)}/><Field label="Website" value={form.website} set={v=>set("website",v)}/></div><HostLabel>Facebook and Instagram</HostLabel><HostInput value={form.social_links} onChange={e=>set("social_links",e.target.value)} placeholder="instagram: URL, facebook: URL"/></div>}
        {section==="schedule"&&<div className="qi-bo-profile-section"><h3>Quiz defaults</h3><p>Choose once. New calendar events inherit these details automatically.</p><div className="qi-bo-form-grid"><Field label="Default Host" value={form.default_host_name} set={v=>set("default_host_name",v)} placeholder={host.name}/><div><HostLabel>Default Quiz Day</HostLabel><select value={form.default_quiz_day} onChange={e=>set("default_quiz_day",e.target.value)}><option value="">Choose a day</option>{DAYS.map((day,index)=><option key={day} value={index}>{day}</option>)}</select></div><Field label="Start Time" type="time" value={form.default_start_time} set={v=>set("default_start_time",v)}/><Field label="End Time" type="time" value={form.default_end_time} set={v=>set("default_end_time",v)}/></div><HostLabel>Host Photo</HostLabel><p style={{margin:"-6px 0 8px",fontSize:12,color:"#6B5A8E"}}>Shown on the Display screen&rsquo;s pre-show &ldquo;Tonight at {form.venue_name||"the venue"}&rdquo; scene, alongside the host name above.</p><ImageUploader key={"hostphoto-"+(editing||"new")} currentUrl={form.host_photo_url||null} onUploaded={url=>set("host_photo_url",url)}/></div>}
        {section==="experience"&&<div className="qi-bo-profile-section"><h3>Venue experience</h3><p>Commercial content inherited by every event at this venue.</p>{[["food_offers","Food Offers"],["drink_offers","Drink Offers"],["happy_hour","Happy Hour"],["prize_information","Prize Information"],["sponsors","Sponsors"],["brand_colours","Brand Colours"]].map(([key,label])=><Area key={key} label={label} value={String(form[key as keyof FormState]||"")} setValue={v=>set(key as keyof FormState,v as never)}/>)}</div>}
        {section==="offers"&&<div className="qi-bo-profile-section"><h3>Offers &amp; Display Graphics</h3><p>PNG or JPEG images that rotate on the display screen and player handsets during intermission. Drag a tile to reorder - that&rsquo;s the order they&rsquo;ll play in.</p>
          <div style={{marginBottom:28}}>
            <h4 style={{margin:"0 0 8px",font:"700 14px Inter"}}>This venue's offers</h4>
            {!editing&&<p style={{color:"#FFC533",fontSize:13}}>Save this venue first to upload offers just for it.</p>}
            {editing&&<label style={{display:"inline-block",padding:"10px 16px",borderRadius:10,background:"#150A2E",border:"1px dashed #2E1A52",color:"#D9CCF2",cursor:"pointer",fontSize:13}}>{offerBusy===editing?"Uploading…":"+ Upload offer image"}<input type="file" accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadOffer(f,editing);e.target.value="";}}/></label>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12,marginTop:12}}>
              {(()=>{const list=offers.filter(o=>o.venue_id===editing).slice().sort((a,b)=>a.sort_order-b.sort_order);return list.map((o,i)=><OfferCard key={o.id} offer={o} onDelete={()=>deleteOffer(o.id)} onToggle={()=>toggleOffer(o)} onDrop={draggedId=>{if(draggedId===o.id)return;const ids=list.map(x=>x.id);const from=ids.indexOf(draggedId);if(from<0)return;ids.splice(from,1);ids.splice(i,0,draggedId);reorderOffers(ids);}}/>);})()}
              {editing&&offers.filter(o=>o.venue_id===editing).length===0&&<p style={{color:"#6B5A8E",fontSize:13}}>No offers uploaded for this venue yet.</p>}
            </div>
          </div>
          <div>
            <h4 style={{margin:"0 0 8px",font:"700 14px Inter"}}>Generic offers (shown at every venue)</h4>
            <label style={{display:"inline-block",padding:"10px 16px",borderRadius:10,background:"#150A2E",border:"1px dashed #2E1A52",color:"#D9CCF2",cursor:"pointer",fontSize:13}}>{offerBusy==="generic"?"Uploading…":"+ Upload generic offer image"}<input type="file" accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadOffer(f,null);e.target.value="";}}/></label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12,marginTop:12}}>
              {(()=>{const list=offers.filter(o=>o.venue_id===null).slice().sort((a,b)=>a.sort_order-b.sort_order);return list.map((o,i)=><OfferCard key={o.id} offer={o} onDelete={()=>deleteOffer(o.id)} onToggle={()=>toggleOffer(o)} onDrop={draggedId=>{if(draggedId===o.id)return;const ids=list.map(x=>x.id);const from=ids.indexOf(draggedId);if(from<0)return;ids.splice(from,1);ids.splice(i,0,draggedId);reorderOffers(ids);}}/>);})()}
              {offers.filter(o=>o.venue_id===null).length===0&&<p style={{color:"#6B5A8E",fontSize:13}}>No generic offers yet.</p>}
            </div>
          </div>
        </div>}
        {section==="media"&&<div className="qi-bo-profile-section"><h3>Display media</h3><p>Visual assets preloaded for the venue experience.</p><HostLabel>Hero Image</HostLabel><ImageUploader key={"hero-"+(editing||"new")} currentUrl={form.hero_image_url||null} onUploaded={url=>set("hero_image_url",url)}/><HostLabel>Hero Video (plays on the display screen instead of the Hero Image, when set)</HostLabel><VideoUploader key={"herovid-"+(editing||"new")} currentUrl={form.hero_video_url||null} onUploaded={url=>set("hero_video_url",url)}/>
          <div style={{margin:"10px 0 4px",padding:14,borderRadius:12,background:"#150A2E",border:"1px dashed #2E1A52"}}>
            <div style={{font:"700 13px 'Inter'",color:"#D9CCF2",marginBottom:4}}>Or generate one automatically</div>
            <p style={{margin:"0 0 10px",fontSize:12,color:"#6B5A8E"}}>Builds an animated video from this venue&rsquo;s own logo, prizes, schedule, host photo, and socials - no filming needed. Replaces the Hero Video above once done.</p>
            <HostButton onClick={generateIntroVideo} disabled={introBusy||!editing}>{introBusy?`Rendering… ${Math.round(introProgress*100)}%`:"GENERATE VENUE INTRO VIDEO"}</HostButton>
            {!editing&&<div style={{fontSize:11,color:"#FFC533",marginTop:8}}>Save this venue first to generate its video.</div>}
            {introStatus&&<div style={{fontSize:12,color:"#2EE06E",marginTop:8}}>{introStatus}</div>}
          </div>
          <HostLabel>Gallery</HostLabel><ImageUploader key={"gallery-"+(editing||"new")} currentUrl={null} onUploaded={url=>set("gallery_images",[...form.gallery_images,url])}/><div className="qi-bo-gallery">{form.gallery_images.map(url=><div key={url}><Image unoptimized fill sizes="180px" src={url} alt="Venue gallery"/><button onClick={()=>set("gallery_images",form.gallery_images.filter(item=>item!==url))} aria-label="Remove gallery image">×</button></div>)}</div><HostLabel>Display Slides</HostLabel><ImageUploader key={"slides-"+(editing||"new")} currentUrl={null} onUploaded={url=>set("display_slides",[...split(form.display_slides),url].join(", "))}/><div className="qi-bo-gallery">{split(form.display_slides).map(url=><div key={url}><Image unoptimized fill sizes="180px" src={url} alt="Display slide"/><button onClick={()=>set("display_slides",split(form.display_slides).filter(item=>item!==url).join(", "))} aria-label="Remove display slide">×</button></div>)}</div>
          <HostLabel>Display Adverts</HostLabel><ImageUploader key={"adverts-"+(editing||"new")} currentUrl={null} onUploaded={url=>set("display_adverts",[...split(form.display_adverts),url].join(", "))}/><div className="qi-bo-gallery">{split(form.display_adverts).map(url=><div key={url}><Image unoptimized fill sizes="180px" src={url} alt="Display advert"/><button onClick={()=>set("display_adverts",split(form.display_adverts).filter(item=>item!==url).join(", "))} aria-label="Remove display advert">×</button></div>)}</div>
        </div>}
        {section==="notes"&&<div className="qi-bo-profile-section"><h3>Internal notes</h3><p>Private operational information for hosts and administrators.</p><Area label="Notes" value={form.notes} setValue={v=>set("notes",v)} rows={8}/><div className="qi-bo-active-row"><div><strong>Venue availability</strong><span>{form.active?"Available when scheduling events":"Hidden from new event scheduling"}</span></div><button className="fbh-btn" onClick={()=>set("active",!form.active)}>{form.active?"Deactivate venue":"Activate venue"}</button></div>
          {editing&&<div className="qi-bo-active-row" style={{marginTop:12}}><div><strong style={{color:"#FF7280"}}>Delete this venue</strong><span>Permanently removes it from Venues and scheduling. Can't be undone.</span></div><button className="fbh-btn" style={{background:"rgba(255,59,78,0.12)",border:"1px solid rgba(255,59,78,0.4)",color:"#FF7280"}} onClick={()=>{const venue=venues.find(v=>v.id===editing);if(venue)deleteVenue(venue);}} disabled={saving}>Delete venue</button></div>}
        </div>}
        {error&&<div className="qi-bo-alert" role="alert">{error}</div>}<footer><span>{!form.venue_name.trim()?<span style={{color:"#FFC533"}}>Enter a Venue Name on the Profile tab to save.</span>:editing?"Changes apply to future events. Live sessions keep their snapshot.":"Complete the profile at your own pace."}</span><HostButton variant="pri" big onClick={()=>{if(!form.venue_name.trim()){setSection("profile");return;}save();}} disabled={saving}>{saving?"Saving…":editing?"Save venue":"Create venue"}</HostButton></footer>
      </section></div></main></HostShell>;
}

function Field({label,value,set,type="text",placeholder}:{label:string;value:string;set:(value:string)=>void;type?:string;placeholder?:string}){return <div><HostLabel>{label}</HostLabel><HostInput type={type} value={value} placeholder={placeholder} onChange={event=>set(event.target.value)}/></div>}
function OfferCard({offer,onDelete,onToggle,onDrop}:{offer:Offer;onDelete:()=>void;onToggle:()=>void;onDrop:(draggedId:string)=>void}){
  const[dragOver,setDragOver]=useState(false);
  return <div
    draggable
    onDragStart={e=>{e.dataTransfer.setData("text/plain",offer.id);e.dataTransfer.effectAllowed="move";}}
    onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";setDragOver(true);}}
    onDragLeave={()=>setDragOver(false)}
    onDrop={e=>{e.preventDefault();setDragOver(false);onDrop(e.dataTransfer.getData("text/plain"));}}
    style={{borderRadius:12,overflow:"hidden",border:"1px solid "+(dragOver?"#BE26C1":offer.active?"#2E1A52":"#5A1B1B"),opacity:offer.active?1:0.55,cursor:"grab"}}>
    <div style={{position:"relative",width:"100%",aspectRatio:"1",background:"#0A0118"}}>
      <Image unoptimized fill sizes="200px" style={{objectFit:"cover"}} src={getMediaUrl(offer.image_url)||offer.image_url} alt="Offer"/>
      <div style={{position:"absolute",top:6,left:6,padding:"2px 6px",borderRadius:6,background:"rgba(10,1,24,0.7)",color:"#D9CCF2",fontSize:14,letterSpacing:2}}>⠿⠿</div>
    </div>
    <div style={{padding:10,display:"flex",gap:6,background:"#150A2E"}}>
      <button onClick={onToggle} style={{flex:1,padding:"6px 8px",borderRadius:8,background:offer.active?"rgba(46,224,110,0.15)":"rgba(255,255,255,0.06)",border:"1px solid "+(offer.active?"#2EE06E":"#2E1A52"),color:offer.active?"#2EE06E":"#6B5A8E",fontSize:12,cursor:"pointer"}}>{offer.active?"Active":"Paused"}</button>
      <button onClick={onDelete} style={{padding:"6px 10px",borderRadius:8,background:"rgba(255,59,78,0.1)",border:"1px solid rgba(255,59,78,0.3)",color:"#FF7280",fontSize:12,cursor:"pointer"}}>Delete</button>
    </div>
  </div>;
}
function Area({label,value,setValue,rows=3}:{label:string;value:string;setValue:(value:string)=>void;rows?:number}){return <div><HostLabel>{label}</HostLabel><textarea style={textArea} rows={rows} value={value} onChange={event=>setValue(event.target.value)}/></div>}
