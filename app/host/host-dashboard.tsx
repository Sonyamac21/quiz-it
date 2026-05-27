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
    <section className="mt-8 flex w-full max-w-lg flex-1 flex-col min-h-0">
      <h2 className="font-logo text-center text-2xl tracking-wide text-[#BE26C1] sm:text-3xl">
        Teams Joined
      </h2>
      <p className="mt-2 text-center text-sm text-white">
        {loading ? "Loading teams..." : teamCountLabel(teams.length)}
      </p>

      {error ? (
        <p className="mt-4 text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="mt-6 flex max-h-48 min-h-0 flex-col gap-3 overflow-y-auto sm:max-h-56">
        {!loading && teams.length === 0 ? (
          <li className="rounded-lg border border-[#BE26C1]/50 px-4 py-6 text-center text-sm text-white/60">
            No teams yet. Waiting for players to join...
          </li>
        ) : (
          teams.map((team) => (
            <li
              key={team.id}
              className="rounded-lg border border-[#BE26C1] bg-black px-4 py-3 text-center text-white"
            >
              {team.team_name}
            </li>
          ))
        )}
      </ul>

      <section className="mt-8 flex flex-col gap-4 border-t border-[#BE26C1]/30 pt-8">
        <div className="rounded-lg border border-[#BE26C1] bg-black px-4 py-3 text-center">
          <p className="font-logo text-xl tracking-wide text-[#BE26C1]">
            Stage: {getStageLabel(stage)}
          </p>
          <p className="mt-2 text-sm text-white/70">
            Next: {getNextStageHint(stage)}
          </p>
          {advancing ? (
            <p className="mt-2 text-xs text-white/50">Updating...</p>
          ) : null}
        </div>

        <h2 className="font-logo text-center text-2xl tracking-wide text-[#BE26C1] sm:text-3xl">
          Current Question
        </h2>

        <div className="rounded-lg border border-[#BE26C1] bg-black px-4 py-4 text-white">
          <p className="text-center text-sm text-white/60">
            Round {SAMPLE_QUESTION.round_number} · Question{" "}
            {SAMPLE_QUESTION.question_number}
          </p>
          <p className="mt-3 text-center font-medium">
            {SAMPLE_QUESTION.question_text}
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>A: {SAMPLE_QUESTION.option_a}</li>
            <li>B: {SAMPLE_QUESTION.option_b}</li>
            <li>C: {SAMPLE_QUESTION.option_c}</li>
            <li>D: {SAMPLE_QUESTION.option_d}</li>
          </ul>
          <p className="mt-4 text-center text-xs text-[#BE26C1]">
            Correct answer: {SAMPLE_QUESTION.correct_answer.toUpperCase()}
          </p>
        </div>

        {stageError ? (
          <p className="text-center text-sm text-red-400" role="alert">
            {stageError}
          </p>
        ) : null}
      </section>

      <button
        type="button"
        className="font-logo mt-6 w-full shrink-0 rounded-lg bg-[#BE26C1] px-6 py-4 text-xl tracking-wide text-white transition-opacity hover:opacity-90"
      >
        Start Quiz
      </button>
    </section>
  );
}
