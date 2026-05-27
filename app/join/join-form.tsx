"use client";

import { FormEvent, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  QUESTION_BROADCAST_EVENT,
  QUIZ_BROADCAST_CHANNEL,
  REVEAL_BROADCAST_EVENT,
} from "@/lib/quiz/realtime";
import type {
  AnswerChoice,
  QuestionBroadcastPayload,
  RevealBroadcastPayload,
} from "@/lib/quiz/sample-question";
import { saveTeamName } from "@/lib/quiz/storage";
import { PlayerQuestionView } from "./player-question-view";

export function JoinForm() {
  const [teamName, setTeamName] = useState("");
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeQuestion, setActiveQuestion] =
    useState<QuestionBroadcastPayload | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState<AnswerChoice | null>(
    null,
  );
  // Forces the handset UI (e.g. countdown timer) to restart on every new
  // question broadcast, even when question_id is unchanged.
  const [questionInstanceId, setQuestionInstanceId] = useState(0);

  useEffect(() => {
    if (!joined) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(QUIZ_BROADCAST_CHANNEL)
      .on("broadcast", { event: QUESTION_BROADCAST_EVENT }, ({ payload }) => {
        setActiveQuestion(payload as QuestionBroadcastPayload);
        setRevealed(false);
        setCorrectAnswer(null);
        setQuestionInstanceId((v) => v + 1);
      })
      .on("broadcast", { event: REVEAL_BROADCAST_EVENT }, ({ payload }) => {
        const reveal = payload as RevealBroadcastPayload;
        setCorrectAnswer(reveal.correct_answer);
        setRevealed(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [joined]);

  async function joinGame() {
    const trimmedName = teamName.trim();
    console.log("[JoinForm] joinGame start", { trimmedName });

    if (!trimmedName) {
      setError("Please enter a team name.");
      return;
    }

    // Optimistic UI: transition immediately on tap.
    setLoading(true);
    setError(null);

    try {
      console.log("[JoinForm] insert ok; saving team name locally");
      saveTeamName(trimmedName);

      console.log("[JoinForm] setting joined=true");
      setLoading(false);
      setJoined(true);

      // Save to Supabase in the background. If it fails, fail silently.
      void (async () => {
        try {
          console.log("[JoinForm] background: creating supabase client");
          const supabase = createSupabaseBrowserClient();

          console.log("[JoinForm] background: inserting team", {
            team_name: trimmedName,
          });
          const { error: insertError } = await supabase
            .from("teams")
            .insert({ team_name: trimmedName });

          if (insertError) {
            console.warn("[JoinForm] background: insert failed", {
              message: insertError.message,
            });
          } else {
            console.log("[JoinForm] background: insert ok");
          }
        } catch (err) {
          console.warn("[JoinForm] background: insert exception", err);
        }
      })();
    } catch (err) {
      console.error("[JoinForm] joinGame exception", err);
      setLoading(false);
      // Even if something unexpected happens, keep the UI responsive.
      setJoined(true);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await joinGame();
  }

  if (joined) {
    if (activeQuestion) {
      return (
        <PlayerQuestionView
          question={activeQuestion}
          revealed={revealed}
          correctAnswer={correctAnswer}
          questionInstanceId={questionInstanceId}
        />
      );
    }

    return (
      <p className="join-body-text mt-8 w-full text-center text-white">
        You&apos;re in! Waiting for the quiz to start...
      </p>
    );
  }

  return (
    <form
      className="mt-8 flex w-full flex-col gap-5"
      onSubmit={handleSubmit}
    >
      <input
        type="text"
        value={teamName}
        onChange={(e) => setTeamName(e.target.value)}
        placeholder="Team name"
        aria-label="Team name"
        disabled={loading}
        className="join-touch-input w-full rounded-xl border border-[#BE26C1] bg-black px-5 text-center text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#BE26C1] disabled:opacity-50"
      />
      {error ? (
        <p className="text-center text-base text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={loading}
        onClick={() => void joinGame()}
        className="join-touch-button font-logo w-full rounded-xl bg-[#BE26C1] px-6 tracking-wide text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Joining..." : "Join Game"}
      </button>
    </form>
  );
}
