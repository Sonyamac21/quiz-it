import type { Metadata } from "next";
import { QuizItHeader } from "@/components/quiz-it-header";
import { HostDashboard } from "./host-dashboard";

export const metadata: Metadata = {
  title: "Host Dashboard | Quiz-It",
};

export default function HostPage() {
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col">
      <header className="shrink-0 border-b border-[#BE26C1]/30 px-6 py-4 lg:px-8">
        <QuizItHeader variant="host" />
      </header>
      <HostDashboard />
    </main>
  );
}
