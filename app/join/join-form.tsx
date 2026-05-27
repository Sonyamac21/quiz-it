"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
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
import { PlayerQuestionView } from "./player-question-view";

export function JoinForm() {
  const [teamNameInput, setTeamNameInput] = useState("");
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeQuestion, setActiveQuestion] =
    useState<QuestionBroadcastPayload | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState<AnswerChoice | null>(
    null,
  );
  const [questionInstanceId, setQuestionInstanceId] = useState(0);

  const teamNameRef = useRef("");

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

  function handleJoin() {
    const trimmedName = teamNameInput.trim();
    if (!trimmedName) {
      setError("Please enter a team name.");
      return;
    }

    setError(null);
    teamNameRef.current = trimmedName;
    setTimeout(() => { setJoined(true); }, 0);

    setTimeout(() => {
      const supabase = createSupabaseBrowserClient();
      supabase.from("teams").insert({ team_name: trimmedName });
    }, 100);
  }

  function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    handleJoin();
  }

  if (joined) {
    if (activeQuestion) {
      return (
        <PlayerQuestionView
          teamName={teamNameRef.current}
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
      onSubmit={handleFormSubmit}
    >
      <input
        type="text"
        value={teamNameInput}
        onChange={(e) => setTeamNameInput(e.target.value)}
        placeholder="Team name"
        aria-label="Team name"
        className="join-touch-input w-full rounded-xl border border-[#BE26C1] bg-black px-5 text-center text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#BE26C1]"
      />
      {error ? (
        <p className="text-center text-base text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={handleJoin}
        className="join-touch-button font-logo w-full rounded-xl bg-[#BE26C1] px-6 tracking-wide text-white transition-opacity hover:opacity-90 active:opacity-90"
      >
        Join Game
      </button>
    </form>
  );
}
