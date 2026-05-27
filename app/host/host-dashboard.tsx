"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  QUESTION_BROADCAST_EVENT,
  QUIZ_BROADCAST_CHANNEL,
} from "@/lib/quiz/realtime";
import {
  SAMPLE_QUESTION,
  toPlayerBroadcastPayload,
} from "@/lib/quiz/sample-question";

type Team = {
  id: string;
  team_name: string;
  created_at: string;
};

function teamCountLabel(count: number) {
  if (count === 1) return "1 team joined";
  return `${count} teams joined`;
}

export function HostDashboard() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<string | null>(null);

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

  async function handleSendQuestion() {
    setSending(true);
    setSendStatus(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const channel = supabase.channel(QUIZ_BROADCAST_CHANNEL);

      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            reject(new Error("Could not connect to realtime channel."));
          }
        });
      });

      const result = await channel.send({
        type: "broadcast",
        event: QUESTION_BROADCAST_EVENT,
        payload: toPlayerBroadcastPayload(),
      });

      if (result !== "ok") {
        setSendStatus("Failed to send question. Please try again.");
        return;
      }

      setSendStatus("Question sent to all handsets.");
    } catch {
      setSendStatus("Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

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

        <button
          type="button"
          onClick={handleSendQuestion}
          disabled={sending}
          className="font-logo w-full rounded-lg bg-[#BE26C1] px-6 py-4 text-xl tracking-wide text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send Question"}
        </button>

        {sendStatus ? (
          <p
            className={`text-center text-sm ${sendStatus.includes("Failed") || sendStatus.includes("wrong") ? "text-red-400" : "text-white/80"}`}
            role="status"
          >
            {sendStatus}
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
