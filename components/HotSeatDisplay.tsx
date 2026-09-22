"use client";

import { FitBlockText } from "./FitBlockText";

export function HotSeatDisplay({ question, questionNumber, status, team, eligibleTeams, seconds }: {
  question: string; questionNumber: number; status: string; team: string | null;
  eligibleTeams: number; seconds: number;
}) {
  return <div className="qi-display-hot-seat" aria-live="polite">
    <div className="qi-display-hot-seat__meta">HOT SEAT · QUESTION {questionNumber}</div>
    <FitBlockText as="h1" maxViewportHeight={0.3} minFontSize={26}>{question}</FitBlockText>
    {status === "open" ? <div className="qi-display-hot-seat__call">
      <span>BUZZERS OPEN</span><strong>WHO KNOWS IT?</strong>
      <small>{eligibleTeams} team{eligibleTeams === 1 ? "" : "s"} eligible</small>
    </div> : team ? <div className="qi-display-hot-seat__claim">
      <FitBlockText className="qi-display-hot-seat__team" maxViewportHeight={0.16} minFontSize={26}>{team}</FitBlockText>
      <strong>TAKES THE HOT SEAT</strong>
      {status === "submitted" ? <small>ANSWER LOCKED IN</small> : <div className="qi-display-hot-seat__timer">{seconds}</div>}
    </div> : <div className="qi-display-hot-seat__call"><strong>NO TEAMS REMAINING</strong><small>Eyes on the host</small></div>}
  </div>;
}
