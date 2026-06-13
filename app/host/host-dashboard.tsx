"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { broadcastToHandsets } from "@/lib/quiz/broadcast";
import {
  QUESTION_BROADCAST_EVENT,
  REVEAL_BROADCAST_EVENT,
} from "@/lib/quiz/realtime";
import {
  SAMPLE_QUESTION,
  toPlayerBroadcastPayload,
  toRevealBroadcastPayload,
} from "@/lib/quiz/sample-question";
import {
  getNextStage,
  getNextStageHint,
  getStageLabel,
  type QuizStage,
} from "@/lib/quiz/stages";
import { UnoHostPanel } from "@/components/UnoCards";

type Team = {
  id: string;
  team_name: string;
  created_at: string;
};

function teamCountLabel(count: number) {
  if (count === 1) return "1 team joined";
  return `${count} teams joined`;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    tag === "BUTTON" ||
    target.isContentEditable
  );
}

export function HostDashboard() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<QuizStage>("load");
  const [stageError, setStageError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const fetchTeams = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error: fetchError } = await supabase
      .from("teams")
      .select("id, team_name, created_at")
      .order("created_at", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setTeams(data ?? []);
    setError(null);
  }, []);

  const runStageEntry = useCallback(async (nextStage: QuizStage) => {
    if (nextStage === "send") {
      const result = await broadcastToHandsets(
        QUESTION_BROADCAST_EVENT,
        toPlayerBroadcastPayload(),
      );
      if (!result.ok) return result.message;
    }

    if (nextStage === "reveal") {
      const result = await broadcastToHandsets(
        REVEAL_BROADCAST_EVENT,
        toRevealBroadcastPayload(),
      );
      if (!result.ok) return result.message;
    }

    return null;
  }, []);

  const advanceStage = useCallback(async () => {
    if (advancing) return;

    const nextStage = getNextStage(stage);
    setAdvancing(true);
    setStageError(null);

    const entryError = await runStageEntry(nextStage);
    if (entryError) {
      setStageError(entryError);
      setAdvancing(false);
      return;
    }

    setStage(nextStage);
    setAdvancing(false);
  }, [advancing, runStageEntry, stage]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    fetchTeams().finally(() => setLoading(false));

    const channel = supabase
      .channel("host-teams")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teams" },
        () => {
          fetchTeams();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTeams]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" && event.key !== " ") return;
      if (isTypingTarget(event.target)) return;

      event.preventDefault();
      advanceStage();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [advanceStage]);

  return (
    <div className="grid min-h-0 w-full flex-1 grid-cols-1 lg:grid-cols-[minmax(240px,280px)_1fr]">
      <aside className="host-sidebar flex min-h-0 flex-col border-b border-[#BE26C1]/30 p-5 lg:border-b-0 lg:p-6">
        <h2 className="font-logo text-xl tracking-wide text-[#BE26C1]">
          Teams Joined
        </h2>
        <p className="mt-1 text-sm text-white/80">
          {loading ? "Loading teams..." : teamCountLabel(teams.length)}
        </p>

        {error ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <ul className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto lg:max-h-none">
          {!loading && teams.length === 0 ? (
            <li className="rounded-lg border border-[#BE26C1]/50 px-3 py-4 text-center text-sm text-white/60">
              No teams yet. Waiting for players to join...
            </li>
          ) : (
            teams.map((team) => (
              <li
                key={team.id}
                className="rounded-lg border border-[#BE26C1] bg-black px-3 py-2.5 text-sm text-white"
              >
                {team.team_name}
              </li>
            ))
          )}
        </ul>
      </aside>

          <div className="mb-4 w-full max-w-md"><UnoHostPanel /></div>
      <section className="flex min-h-0 flex-col gap-5 overflow-y-auto p-5 lg:p-6">
        <div className="rounded-lg border border-[#BE26C1] bg-black px-4 py-3">
          <p className="font-logo text-lg tracking-wide text-[#BE26C1]">
            Stage: {getStageLabel(stage)}
          </p>
          <p className="mt-1.5 text-sm text-white/70">
            Next: {getNextStageHint(stage)}
          </p>
          {advancing ? (
            <p className="mt-1 text-xs text-white/50">Updating...</p>
          ) : null}
        </div>

        <div>
          <h2 className="font-logo text-xl tracking-wide text-[#BE26C1]">
            Current Question
          </h2>

          <div className="mt-3 rounded-lg border border-[#BE26C1] bg-black px-4 py-4 text-white">
            <p className="text-sm text-white/60">
              Round {SAMPLE_QUESTION.round_number} · Question{" "}
              {SAMPLE_QUESTION.question_number}
            </p>
            <p className="mt-2 text-base font-medium leading-snug">
              {SAMPLE_QUESTION.question_text}
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              <li>A: {SAMPLE_QUESTION.option_a}</li>
              <li>B: {SAMPLE_QUESTION.option_b}</li>
              <li>C: {SAMPLE_QUESTION.option_c}</li>
              <li>D: {SAMPLE_QUESTION.option_d}</li>
            </ul>
            <p className="mt-3 text-xs text-[#BE26C1]">
              Correct answer: {SAMPLE_QUESTION.correct_answer.toUpperCase()}
            </p>
          </div>
        </div>

        {stageError ? (
          <p className="text-sm text-red-400" role="alert">
            {stageError}
          </p>
        ) : null}

        
          href="/host/quiz"
          className="font-logo mt-auto w-full max-w-md shrink-0 rounded-lg bg-[#BE26C1] px-5 py-3 text-lg tracking-wide text-white transition-opacity hover:opacity-90 text-center no-underline block"
        >
          Start Quiz
        </a>
      </section>
    </div>
  );
}
