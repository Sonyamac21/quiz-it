import { QuizItHeader } from "@/components/quiz-it-header";
import { JoinForm } from "./join-form";

export default function JoinPage() {
  return (
    <div className="qi-app-shell qi-player-experience flex min-h-dvh flex-col">
      <QuizItHeader variant="join" />
      <main className="qi-player-join-main flex flex-1 flex-col items-center justify-center px-4 py-6">
        <JoinForm />
      </main>
      <footer className="px-3 py-4 text-center text-xs tracking-widest text-[var(--qi-text-muted)]">Quiz-It · Powered by Mac Entertainment</footer>
    </div>
  );
}
