"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const groups = [
  { label: "Home", href: "/host", links: [["Overview", "/host"]], help: "Start with a Quiz Plan, prepare its media, then open the live session." },
  { label: "Quiz Plans", href: "/host/quizzes", links: [["Quiz Plans", "/host/quizzes"]], help: "A Quiz Plan is the complete running order for your quiz night. Add rounds here, then prepare the music." },
  { label: "Questions & Rounds", href: "/host/question-bank", links: [["Saved questions", "/host/question-bank"], ["Saved rounds", "/host/rounds"], ["Generate questions", "/host/questions"]], help: "Save individual questions or reusable rounds here. Add a saved round to a Quiz Plan when you are ready." },
  { label: "Media & Music", href: "/host/music-prep", links: [["Prepare question clips", "/host/music-prep"], ["Team victory songs", "/host/victory-songs"], ["Images & videos", "/host/media"]], help: "Question clips play during music questions. Victory songs celebrate teams. Images and videos support the show." },
  { label: "Calendar", href: "/host/events", links: [["Scheduled events", "/host/events"], ["Venues", "/host/venues"]], help: "Schedule a quiz night, choose its venue and attach a Quiz Plan." },
  { label: "Manage", href: "/host/settings", links: [["Settings", "/host/settings"], ["Reports", "/host/reports"], ["Hosts", "/host/hosts"], ["Sponsors", "/host/sponsors"]], help: "Manage your host settings and review completed sessions." },
];

const livePrefixes = ["/host/quiz", "/host/display", "/host/session", "/host/spin", "/host/wheel"];

export function BackOfficeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (livePrefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) return children;
  const matches = (href: string) => pathname === href || (href !== "/host" && pathname.startsWith(`${href}/`));
  const currentGroup = groups.find(group => group.links.some(([, href]) => matches(href))) || groups[0];
  return <div className="qi-back-office">
    <header className="qi-bo-header">
      <Link href="/host" className="qi-bo-brand"><span>QUIZ-</span>IT<small>Powered by Mac Entertainment</small></Link>
      <nav aria-label="Main host navigation">{groups.map(group => <Link key={group.href} href={group.href} aria-current={currentGroup === group ? "page" : undefined}>{group.label}</Link>)}</nav>
      <Link href="/host/session" className="qi-bo-live">Run a quiz →</Link>
    </header>
    <div className="qi-bo-sectionnav">
      {currentGroup.links.length > 1 && <nav aria-label={`${currentGroup.label} pages`}>{currentGroup.links.map(([label, href]) => <Link key={href} href={href} aria-current={matches(href) ? "page" : undefined}>{label}</Link>)}</nav>}
      <p>{currentGroup.help}</p>
    </div>
    <div className="qi-bo-content">{children}</div>
  </div>;
}
