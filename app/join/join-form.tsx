"use client";

import { FormEvent, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  QUESTION_BROADCAST_EVENT,
  QUIZ_BROADCAST_CHANNEL,
} from "@/lib/quiz/realtime";
import type { QuestionBroadcastPayload } from "@/lib/quiz/sample-question";
import { saveTeamName } from "@/lib/quiz/storage";
import { PlayerQuestionView } from "./player-question-view";

export function JoinForm() {
  const [teamName, setTeamName] = useState("");
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeQuestion, setActiveQuestion] =
    useState<QuestionBroadcastPayload | null>(null);

  useEffect(() => {
    if (!joined) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(QUIZ_BROADCAST_CHANNEL)
      .on("broadcast", { event: QUESTION_BROADCAST_EVENT }, ({ payload }) => {
        setActiveQuestion(payload as QuestionBroadcastPayload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [joined]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmedName = teamName.trim();
    if (!trimmedName) {
      setError("Please enter a team name.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: insertError } = await supabase
        .from("teams")
        .insert({ team_name: trimmedName });

      if (insertError) {
        setError(insertError.message);
        return;
      }

      saveTeamName(trimmedName);
      setJoined(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (joined) {
    if (activeQuestion) {
      return <PlayerQuestionView question={activeQuestion} />;
    }

    return (
      <p className="mt-10 max-w-sm text-center text-white">
        You&apos;re in! Waiting for the quiz to start...
      </p>
    );
  }

  return (
    <form
      className="mt-10 flex w-full max-w-sm flex-col gap-6"
      onSubmit={handleSubmit}
    >
      <input
        type="text"
        value={teamName}
        onChange={(e) => setTeamName(e.target.value)}
        placeholder="Team name"
        aria-label="Team name"
        disabled={loading}
        className="w-full rounded-lg border border-[#BE26C1] bg-black px-4 py-3 text-center text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#BE26C1] disabled:opacity-50"
      />
      {error ? (
        <p className="-mt-2 text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="font-logo w-full rounded-lg bg-[#BE26C1] px-6 py-4 text-xl tracking-wide text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Joining..." : "Join Game"}
      </button>
    </form>
  );
}
