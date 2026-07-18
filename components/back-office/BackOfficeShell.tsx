"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigation = [
  ["Dashboard", "/host"], ["Calendar", "/host/events"], ["Venues", "/host/venues"],
  ["Quiz Library", "/host/quizzes"], ["Question Library", "/host/question-bank"],
  ["Media", "/host/media"], ["Reports", "/host/reports"], ["Settings", "/host/settings"],
] as const;

const livePrefixes = ["/host/quiz", "/host/display", "/host/session", "/host/spin", "/host/wheel"];

export function BackOfficeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (livePrefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) return children;
  return <div className="qi-back-office"><header className="qi-bo-header"><Link href="/host" className="qi-bo-brand"><span>QUIZ-</span>IT<small>Powered by Mac Entertainment</small></Link><nav aria-label="Back Office navigation">{navigation.map(([label,href])=>{const active=pathname===href||(href!=="/host"&&pathname.startsWith(`${href}/`));return <Link key={href} href={href} aria-current={active?"page":undefined}>{label}</Link>})}</nav><Link href="/host/session" className="qi-bo-live">Launch Live Session</Link></header><div className="qi-bo-content">{children}</div></div>;
}
