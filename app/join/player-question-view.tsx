"use client";

import { useEffect, useState } from "react";
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
};

export function PlayerQuestionView({
  question,
  revealed,
  correctAnswer,
}: PlayerQuestionViewProps) {
  const options = [
    { letter: "A", value: "a" as AnswerChoice, text: question.option_a },
    { letter: "B", value: "b" as AnswerChoice, text: question.option_b },
    { letter: "C", value: "c" as AnswerChoice, text: question.option_c },
    { letter: "D", value: "d" as AnswerChoice, text: question.option_d },
  ];
  const [selected, setSelected] = useState<AnswerChoice | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    setSelected(null);
    setLocked(false);
  }, [question.question_id]);

  async function handleSelect(choice: AnswerChoice) {
    if (locked || revealed) return;

    const teamName = getTeamName();
    if (!teamName) return;

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

    return "border-[#BE26C1] bg-black hover:bg-[#BE26C1]/10 disabled:opacity-40 disabled:hover:bg-black";
  }

  return (
    <div className="mt-10 w-full max-w-sm">
      <p className="text-center text-sm text-white/60">
        Round {question.round_number} · Question {question.question_number}
      </p>
      <p className="mt-3 text-center text-lg text-white">
        {question.question_text}
      </p>

      <ul className="mt-6 flex flex-col gap-3">
        {options.map((option) => {
          const isSelected = selected === option.value;
          return (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => handleSelect(option.value)}
                disabled={locked || revealed}
                className={`w-full rounded-lg border px-4 py-3 text-center text-white transition-colors disabled:cursor-not-allowed ${getButtonClass(option.value, isSelected)}`}
              >
                {option.letter}: {option.text}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
