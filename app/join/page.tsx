import { QuizItHeader } from "@/components/quiz-it-header";
import { JoinForm } from "./join-form";

export default function JoinPage() {
  return (
    <div className="qi-app-shell flex min-h-dvh flex-col">
      <QuizItHeader variant="join" />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-6">
        <JoinForm />
      </main>
      <footer className="px-3 py-4 text-center text-xs tracking-widest text-[var(--qi-text-muted)]">Quiz-It · Presented by Mac Entertainment</footer>
    </div>
  );
}
