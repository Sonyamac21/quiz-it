"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  type AnswerChoice,
  isAnswerCorrect,
  type QuestionBroadcastPayload,
} from "@/lib/quiz/sample-question";
import { getTeamName } from "@/lib/quiz/storage";

type PlayerQuestionViewProps = {
  question: QuestionBroadcastPayload;
  revealed: boolean;
  correctAnswer: AnswerChoice | null;
  questionInstanceId: number;
};

export function PlayerQuestionView({
  question,
  revealed,
  correctAnswer,
  questionInstanceId,
}: PlayerQuestionViewProps) {
  const TOTAL_SECONDS = 10;
  const options = [
    { letter: "A", value: "a" as AnswerChoice, text: question.option_a },
    { letter: "B", value: "b" as AnswerChoice, text: question.option_b },
    { letter: "C", value: "c" as AnswerChoice, text: question.option_c },
    { letter: "D", value: "d" as AnswerChoice, text: question.option_d },
  ];

  const [selected, setSelected] = useState<AnswerChoice | null>(null);
  const [locked, setLocked] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TOTAL_SECONDS);
  const [timeUp, setTimeUp] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answeredRef = useRef(false);

  useEffect(() => {
    setSelected(null);
    setLocked(false);
    setTimeLeft(TOTAL_SECONDS);
    setTimeUp(false);
    answeredRef.current = false;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const endAt = Date.now() + TOTAL_SECONDS * 1000;
    intervalRef.current = setInterval(() => {
      const msRemaining = endAt - Date.now();
      const next = Math.max(0, Math.ceil(msRemaining / 1000));
      setTimeLeft(next);

      if (next <= 0) {
        if (!answeredRef.current) {
          setLocked(true);
          setTimeUp(true);
        }

        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, 200);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [questionInstanceId, TOTAL_SECONDS]);

  function stopTimer() {
    answeredRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  async function handleSelect(choice: AnswerChoice) {
    if (locked || revealed) return;

    const teamName = getTeamName();
    if (!teamName) return;

    stopTimer();
    setTimeUp(false);
    setSelected(choice);
    setLocked(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("answers").insert({
        team_name: teamName,
        question_id: question.question_id,
        selected_answer: choice,
        is_correct: isAnswerCorrect(choice),
      });

      if (error) {
        setSelected(null);
        setLocked(false);
        console.error("Failed to save answer:", error.message);
      }
    } catch (err) {
      setSelected(null);
      setLocked(false);
      console.error("Failed to save answer:", err);
    }
  }

  function getButtonClass(optionValue: AnswerChoice, isSelected: boolean) {
    if (revealed && correctAnswer) {
      if (optionValue === correctAnswer) {
        return "border-green-500 bg-green-600";
      }
      return "border-red-500 bg-red-600";
    }

    if (isSelected) {
      return "border-[#BE26C1] bg-[#BE26C1]";
    }

    return "border-[#BE26C1] bg-black active:bg-[#BE26C1]/20 disabled:opacity-40";
  }

  const progress = timeLeft / TOTAL_SECONDS;
  const barColor =
    timeLeft <= 3 ? "bg-red-500" : timeLeft <= 5 ? "bg-orange-500" : "bg-[#BE26C1]";

  return (
    <div className="mt-6 w-full">
      <p className="text-center text-base text-white/60">
        Round {question.round_number} · Question {question.question_number}
      </p>
      <p className="join-question-text mt-4 text-center font-medium text-white">
        {question.question_text}
      </p>

      <div className="mt-4 flex flex-col items-center gap-2">
        <div className="font-logo text-4xl tracking-wide text-white">
          {timeLeft}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${barColor}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <ul className="mt-6 flex flex-col gap-4">
        {options.map((option) => {
          const isSelected = selected === option.value;
          return (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => handleSelect(option.value)}
                disabled={locked || revealed}
                className={`join-touch-button w-full rounded-xl border px-5 text-center text-white transition-colors disabled:cursor-not-allowed ${getButtonClass(option.value, isSelected)}`}
              >
                <span className="font-medium">{option.letter}:</span>{" "}
                {option.text}
              </button>
            </li>
          );
        })}
      </ul>

      {timeUp && !revealed ? (
        <p className="mt-4 text-center text-sm text-white/50" role="status">
          Time&apos;s up
        </p>
      ) : null}
    </div>
  );
}
