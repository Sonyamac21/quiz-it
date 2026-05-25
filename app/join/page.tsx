import type { Metadata } from "next";
import { QuizItHeader } from "@/components/quiz-it-header";
import { JoinForm } from "./join-form";

export const metadata: Metadata = {
  title: "Join Game | Quiz-It",
};

export default function JoinPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6">
      <QuizItHeader />
      <JoinForm />
    </main>
  );
}
