import type { Metadata } from "next";
import { QuizItHeader } from "@/components/quiz-it-header";
import { JoinForm } from "./join-form";

export const metadata: Metadata = {
  title: "Join Game | Quiz-It",
};

export default function JoinPage() {
  return (
    <main className="flex w-full flex-1 flex-col items-stretch justify-center gap-2">
      <QuizItHeader variant="join" />
      <JoinForm />
    </main>
  );
}
