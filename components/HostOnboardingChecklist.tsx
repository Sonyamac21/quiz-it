"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// First-run "Getting Started" checklist for brand-new hosts on the Back
// Office dashboard. Deliberately NOT the full "Tonight's Show" guided
// per-quiz-night workflow (docs/product/tonights-show-host-journey.md) -
// that's a separate, larger piece with pre-show gating logic that touches
// session/handler state. This is just a one-time orientation for someone
// who has just signed up and is looking at an empty dashboard, pointing
// them at the four things they need to do before they can run a live quiz.
const DISMISS_KEY = "qi_host_onboarding_dismissed";

export type OnboardingStatus = {
  hasVenue: boolean;
  hasQuizPlan: boolean;
  hasScheduledEvent: boolean;
  hasQuestions: boolean;
};

const STEPS: { key: keyof OnboardingStatus; title: string; body: string; href: string; cta: string }[] = [
  {
    key: "hasVenue",
    title: "Add your first venue",
    body: "A venue holds your branding - logo, host photo, and the details that appear on the TV screen.",
    href: "/host/venues",
    cta: "Add venue",
  },
  {
    key: "hasQuizPlan",
    title: "Build a Quiz Plan",
    body: "Assemble rounds from scratch, the Round Library, or let AI generate a full night for you.",
    href: "/host/quizzes",
    cta: "Build Quiz Plan",
  },
  {
    key: "hasQuestions",
    title: "Check your Question Library",
    body: "Every generated or imported question lands here for review before it can go out live.",
    href: "/host/question-bank",
    cta: "Review questions",
  },
  {
    key: "hasScheduledEvent",
    title: "Schedule your first event",
    body: "Put a venue and a Quiz Plan on the calendar - this is what turns planning into a live show.",
    href: "/host/events",
    cta: "Open Calendar",
  },
];

export function HostOnboardingChecklist({ status, loading }: { status: OnboardingStatus; loading: boolean }) {
  const [dismissed, setDismissed] = useState(true); // Default hidden until localStorage is checked, so nothing flashes on first paint.

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const allDone = status.hasVenue && status.hasQuizPlan && status.hasScheduledEvent && status.hasQuestions;

  if (loading || dismissed || allDone) return null;

  function dismiss() {
    try { window.localStorage.setItem(DISMISS_KEY, "1"); } catch {}
    setDismissed(true);
  }

  const doneCount = STEPS.filter(s => status[s.key]).length;

  return (
    <section className="qi-bo-onboarding" aria-label="Getting started">
      <div className="qi-bo-onboarding-head">
        <div>
          <p>Getting started</p>
          <h2>{doneCount} of {STEPS.length} steps done</h2>
        </div>
        <button type="button" onClick={dismiss} className="qi-bo-onboarding-dismiss">Hide this</button>
      </div>
      <div className="qi-bo-onboarding-steps">
        {STEPS.map((step, i) => {
          const done = status[step.key];
          return (
            <div key={step.key} className={`qi-bo-onboarding-step${done ? " done" : ""}`}>
              <span className="qi-bo-onboarding-num" aria-hidden="true">{done ? "✓" : i + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <span>{step.body}</span>
              </div>
              {!done && <Link href={step.href}>{step.cta}</Link>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
