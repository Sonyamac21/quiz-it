"use client";
// STANDALONE VENUE GRAPHICS PREVIEW - presentational only, no session.
//
// Reuses the exact same CSS classes as the live Display's pre-show reel
// (app/host/display/page.tsx, the "phase === waiting" branch) so what a
// host sees here matches what plays on the TV at showtime exactly. Built
// as its own component specifically so a host can sanity-check a venue's
// branding (logo, offers, prizes, socials) without starting a real session
// - no PIN, no team join, no session row created, nothing to "close" after.
//
// Deliberately duplicates three small helpers (QuizItBadge, InstagramGlyph,
// FitText) from display/page.tsx rather than importing them, since they're
// not exported there and this file must never modify or depend on that
// live, session-critical file.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { getMediaUrl } from "@/lib/getMediaUrl";

function QuizItBadge() {
  // Host request: "that stupid little Quiz-It logo bubble is on all venue
  // screens at the bottom right - remove it!!" - matches the same removal
  // in app/host/display/page.tsx. This preview mirrors the live Display
  // exactly, so it needs to drop the badge too or the preview would show a
  // corner bubble the real show no longer has.
  return null;
}

function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.6" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.4" cy="6.6" r="1.3" fill="currentColor" />
    </svg>
  );
}

function FitText({ children, className }: { children: ReactNode; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const baseFontSizeRef = useRef<number | null>(null);
  const [fontSize, setFontSize] = useState<number | null>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current, inner = innerRef.current;
    if (!wrap || !inner) return;
    const measure = () => {
      if (baseFontSizeRef.current == null) {
        baseFontSizeRef.current = parseFloat(getComputedStyle(inner).fontSize) || 16;
      }
      const base = baseFontSizeRef.current;
      inner.style.fontSize = base + "px";
      const available = wrap.clientWidth;
      const natural = inner.scrollWidth;
      if (natural <= 0 || available <= 0) return;
      const scale = Math.min(1, available / natural);
      setFontSize(base * scale);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div ref={wrapRef} style={{ overflow: "hidden", width: "100%" }}>
      <div ref={innerRef} className={className} style={fontSize ? { fontSize, whiteSpace: "nowrap", display: "inline-block" } : { whiteSpace: "nowrap", display: "inline-block" }}>
        {children}
      </div>
    </div>
  );
}

export type PreviewVenue = {
  venue_name: string;
  hero_image_url: string | null;
  hero_video_url: string | null;
  venue_logo_url: string | null;
  prize_information: string | null;
  intermission_offers: string;
  schedule_text: string | null;
  host_name: string | null;
  host_photo_url: string | null;
  instagram_tag: string;
};

export function VenueShowreelPreview({ venue }: { venue: PreviewVenue }) {
  const [reelSceneIdx, setReelSceneIdx] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  // Same fix as the live Display's pre-show reel (see the comment on
  // brokenImageUrls in app/host/display/page.tsx) - this preview exists
  // specifically so a host can sanity-check venue branding before a real
  // session starts, so it needs the same broken-image handling or a host
  // checking their setup here would see the exact glyph this preview is
  // meant to help them avoid on the night.
  const [brokenImageUrls, setBrokenImageUrls] = useState<Set<string>>(new Set());
  function markImageBroken(url: string | null | undefined) {
    if (!url) return;
    setBrokenImageUrls(prev => (prev.has(url) ? prev : new Set(prev).add(url)));
  }

  const reelScenes = [
    "venue",
    ...(venue.intermission_offers.trim() ? ["offers"] : []),
    ...(venue.prize_information ? ["prizes"] : []),
    "tag-us",
    ...(venue.instagram_tag ? ["social"] : []),
  ];

  useEffect(() => {
    const id = window.setInterval(() => {
      setReelSceneIdx(i => (i + 1) % reelScenes.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [reelScenes.length]);

  const currentReelScene = reelScenes[reelSceneIdx % reelScenes.length];
  const safeHostName = venue.host_name && !venue.host_name.includes("@") ? venue.host_name : null;

  return (
    <div className="fbl fbl-stage qi-display-stage qi-display-lobby">
      <div className="lb lb-split">
        <div className="lb-join">
          <div className="lb-kicker">JOIN TONIGHT&rsquo;S SHOW</div>
          <div className="lb-pin"><small>ENTER PIN</small>0000</div>
          <div className="lb-how">
            {(() => {
              // Same real-domain fix as app/host/display/page.tsx - see the
              // joinUrl/displayHost comment there. "quiz-it.app" was never
              // an owned/pointed domain; the confirmed live one is
              // quiz-it.macentertainmentuae.com.
              const displayHost = typeof window !== "undefined" && window.location.host ? window.location.host : "quiz-it.macentertainmentuae.com";
              const joinQrSrc = "https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=" + encodeURIComponent("https://" + displayHost + "/join");
              return !brokenImageUrls.has(joinQrSrc) ? (
                <img className="lb-qr" src={joinQrSrc} alt="Scan to join" onError={() => markImageBroken(joinQrSrc)} />
              ) : (
                <div className="lb-qr" />
              );
            })()}
            <div className="lb-steps">
              <b>1.</b> Go to {typeof window !== "undefined" && window.location.host ? window.location.host : "quiz-it.macentertainmentuae.com"} or scan<br />
              <b>2.</b> Enter the PIN<br />
              <b>3.</b> Name your team
            </div>
          </div>
          <div className="lb-count"><b>0 TEAMS</b> IN THE ROOM</div>
        </div>
        <div className="lb-cardstage lb-reel">
          <div className="lb-reel-title">{venue.venue_name ? `TONIGHT AT ${venue.venue_name.toUpperCase()}` : "TONIGHT'S SHOW"}</div>

          {currentReelScene === "venue" && (
            <div className="lb-reel-scene lb-reel-venue">
              {venue.hero_video_url && !videoFailed ? (
                <video key={venue.hero_video_url} className="lb-reel-media" src={getMediaUrl(venue.hero_video_url) || undefined} autoPlay muted loop playsInline onError={() => setVideoFailed(true)} onLoadedData={() => setVideoFailed(false)} />
              ) : venue.hero_image_url && !brokenImageUrls.has(venue.hero_image_url) ? (
                <img className="lb-reel-media" src={getMediaUrl(venue.hero_image_url) || undefined} alt={venue.venue_name} onError={() => markImageBroken(venue.hero_image_url)} />
              ) : (
                <div className="lb-venue-intro-bg" />
              )}
              <div className={"lb-venue-intro" + ((venue.hero_video_url && !videoFailed) || (venue.hero_image_url && !brokenImageUrls.has(venue.hero_image_url)) ? " has-media" : "")}>
                {venue.venue_logo_url && !brokenImageUrls.has(venue.venue_logo_url) && <img className="lb-venue-intro-logo" src={getMediaUrl(venue.venue_logo_url) || undefined} alt="" onError={() => markImageBroken(venue.venue_logo_url)} />}
                <div className="lb-venue-intro-copy">
                  <div className="lb-venue-intro-name">{venue.venue_name || "TONIGHT'S QUIZ"}</div>
                  {venue.schedule_text && <div className="lb-venue-intro-time">QUIZ NIGHT · {venue.schedule_text}</div>}
                  <div className="lb-venue-intro-tagline">Quiz-It · Powered by Mac Entertainment · by Sonya Mac</div>
                </div>
                {(venue.host_photo_url || safeHostName) && (
                  <div className="lb-venue-intro-host">
                    {venue.host_photo_url && !brokenImageUrls.has(venue.host_photo_url) && <img src={getMediaUrl(venue.host_photo_url) || undefined} alt={safeHostName || "Quiz host"} onError={() => markImageBroken(venue.host_photo_url)} />}
                    <div><small>YOUR HOST</small><strong>{safeHostName || "Mac Entertainment"}</strong></div>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentReelScene === "offers" && (
            <div className="lb-reel-scene lb-reel-brand lb-reel-brand-offers">
              <div className="lb-reel-brand-panel">
                {venue.venue_logo_url && !brokenImageUrls.has(venue.venue_logo_url) && <img className="lb-reel-brand-logo" src={getMediaUrl(venue.venue_logo_url) || undefined} alt="" onError={() => markImageBroken(venue.venue_logo_url)} />}
                <div className="lb-cardkicker">TONIGHT AT {venue.venue_name?.toUpperCase() || "THE VENUE"}</div>
                <div className="lb-reel-brand-body">{venue.intermission_offers}</div>
              </div>
            </div>
          )}

          {currentReelScene === "prizes" && (
            <div className="lb-reel-scene lb-reel-brand lb-reel-brand-prizes">
              <div className="lb-reel-brand-panel">
                {venue.venue_logo_url && !brokenImageUrls.has(venue.venue_logo_url) && <img className="lb-reel-brand-logo" src={getMediaUrl(venue.venue_logo_url) || undefined} alt={`${venue.venue_name} logo`} onError={() => markImageBroken(venue.venue_logo_url)} />}
                <div className="lb-cardkicker">TONIGHT&rsquo;S PRIZES</div>
                <div className="lb-reel-brand-body">{venue.prize_information}</div>
              </div>
            </div>
          )}

          {currentReelScene === "social" && (
            <div className="lb-reel-scene lb-reel-brand lb-reel-brand-social">
              <div className="lb-reel-brand-panel">
                {venue.venue_logo_url && !brokenImageUrls.has(venue.venue_logo_url) && <img className="lb-reel-brand-logo" src={getMediaUrl(venue.venue_logo_url) || undefined} alt="" onError={() => markImageBroken(venue.venue_logo_url)} />}
                <div className="lb-cardkicker">FOLLOW THE VENUE</div>
                <FitText className="lb-reel-brand-headline"><InstagramGlyph />{venue.instagram_tag}</FitText>
              </div>
            </div>
          )}

          {currentReelScene === "tag-us" && (
            <div className="lb-reel-scene lb-reel-brand lb-reel-brand-social">
              <div className="lb-reel-brand-panel">
                <div className="lb-cardkicker">SHARE THE NIGHT</div>
                <FitText className="lb-reel-brand-headline"><InstagramGlyph />@macentertainmentuae</FitText>
                <div className="lb-reel-brand-body">Tag us in your posts and stories!</div>
              </div>
            </div>
          )}
        </div>
        <div className="lb-foot">
          <div className="lb-start">SHOW STARTS SOON</div>
        </div>
      </div>
      <QuizItBadge />
    </div>
  );
}
