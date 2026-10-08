"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/ui/quiz-it-ui";

const groups = [
  { label: "Home", href: "/host", links: [["Overview", "/host"]], help: "Start with a Quiz Plan, prepare its media, then open the live session." },
  { label: "Quiz Plans", href: "/host/quizzes", links: [["Quiz Plans", "/host/quizzes"]], help: "A Quiz Plan is the complete running order for your quiz night. Add rounds here, then prepare the music." },
  { label: "Library", href: "/host/question-bank", links: [["Questions", "/host/question-bank"], ["Rounds", "/host/rounds"], ["Create questions", "/host/questions"]], help: "Keep your questions and reusable rounds here. Choose a question to add it to a quiz." },
  { label: "Music & Media", href: "/host/music-prep", links: [["Music clips", "/host/music-prep"], ["Victory songs", "/host/victory-songs"], ["Images & videos", "/host/media"], ["Promotions", "/host/promo-images"]], help: "Prepare music clips for your questions, or add images and promotions for quiz night." },
  { label: "Calendar", href: "/host/events", links: [["Scheduled events", "/host/events"], ["Venues", "/host/venues"]], help: "Schedule a quiz night, choose its venue and attach a Quiz Plan." },
  { label: "Settings", href: "/host/settings", links: [["Preferences", "/host/settings"], ["Reports", "/host/reports"], ["Hosts", "/host/hosts"], ["Sponsors", "/host/sponsors"]], help: "Update your preferences and review previous quiz nights." },
];

// "/host/venues/preview" is a fixed, full-screen (inset:0) mirror of the
// live Display's pre-show reel - the Back Office header/nav (rendered by
// this shell) was sitting on top of it, silently shrinking its usable
// canvas to "viewport minus header" instead of the true full screen the
// live Display gets. That mismatch was the real cause of the venue hero
// image reading as "too big"/badly cropped in this preview - the image
// itself was fine, it just had noticeably less room to breathe in than
// showtime, on top of the header baked into every screenshot.
const livePrefixes = ["/host/quiz", "/host/display", "/host/session", "/host/spin", "/host/wheel", "/host/venues/preview"];

export function BackOfficeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (livePrefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) return children;
  const matches = (href: string) => pathname === href || (href !== "/host" && pathname.startsWith(`${href}/`));
  const currentGroup = groups.find(group => group.links.some(([, href]) => matches(href))) || groups[0];
  return <div className="qi-back-office">
    <a className="qi-skip-link" href="#quiz-workspace">Skip to page content</a>
    <header className="qi-bo-header">
      {/* Host request: the brand mark must look IDENTICAL everywhere it
          appears on host-facing screens - same component, same size, not
          just the same content. This used to render BrandMark size="lg",
          which is a different component from the one Mission Control
          (app/host/quiz) uses for its live header (BrandLockup compact) -
          same words, but a different font-stretching treatment, so the two
          never actually matched pixel-for-pixel even at a similar size.
          Switched to BrandLockup compact so Back Office's mark is the exact
          same component/size as the live host screen's. */}
      {/* justifySelf:"start" keeps this pinned to its original left corner -
          without it, this grid cell's default stretch alignment would let
          the (content-width) brand box grow to fill the whole cell, which
          visually drags the logo away from the corner into the middle of
          the header. */}
      <Link href="/host" style={{ textDecoration: "none", justifySelf: "start" }}><BrandLockup compact /></Link>
      <nav aria-label="Main host navigation">{groups.map(group => <Link key={group.href} href={group.href} aria-current={currentGroup === group ? "page" : undefined}>{group.label}</Link>)}</nav>
      <Link href="/host/session" className="qi-bo-live">Run a quiz →</Link>
    </header>
    {pathname !== "/host" && <div className="qi-bo-sectionnav">
      {currentGroup.links.length > 1 && <nav aria-label={`${currentGroup.label} pages`}>{currentGroup.links.map(([label, href]) => <Link key={href} href={href} aria-current={matches(href) ? "page" : undefined}>{label}</Link>)}</nav>}
      <details className="qi-page-help" key={currentGroup.href}><summary>Help with {currentGroup.label.toLowerCase()}</summary><p>{currentGroup.help}</p></details>
    </div>}
    <div className="qi-bo-content" id="quiz-workspace" tabIndex={-1}>{children}</div>
  </div>;
}
