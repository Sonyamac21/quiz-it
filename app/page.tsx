import { BrandLockup } from "@/components/ui/quiz-it-ui";
import { QuizItHeader } from "@/components/quiz-it-header";

export default function Home() {
  return (
    <div className="qi-app-shell flex min-h-dvh flex-col">
      <QuizItHeader />
      <main className="qi-hero">
        <BrandLockup />
      </main>
    </div>
  );
}
