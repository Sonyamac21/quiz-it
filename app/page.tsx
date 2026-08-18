import Link from "next/link";
import { BrandLockup } from "@/components/ui/quiz-it-ui";
import { QuizItHeader } from "@/components/quiz-it-header";

// This used to be a static logo splash with no way in - no link to the host
// dashboard, no way for a player to find the join page, nothing to tell a
// first-time visitor what Quiz-It even is. `/host/*` is already gated by
// proxy.ts (redirects to /login with a redirectTo back to /host if there's
// no session), so linking straight to /host here is enough - a logged-out
// host lands on login and bounces right back, a logged-in host goes
// straight to their dashboard.
export default function Home() {
  return (
    <div className="qi-app-shell flex min-h-dvh flex-col">
      <QuizItHeader />
      <main className="qi-hero qi-hero--landing">
        <BrandLockup />
        <p className="qi-hero__tagline">Live quiz nights, hosted from your laptop, played on everyone&rsquo;s phone.</p>
        <div className="qi-hero__actions">
          <Link href="/host" className="qi-button qi-button--primary qi-hero__cta">Host sign in</Link>
          <Link href="/join" className="qi-button qi-button--secondary qi-hero__cta">Join a quiz</Link>
        </div>
      </main>
    </div>
  );
}
