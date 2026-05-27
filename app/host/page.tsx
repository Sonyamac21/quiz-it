import type { Metadata } from "next";
import { QuizItHeader } from "@/components/quiz-it-header";
import { HostDashboard } from "./host-dashboard";

export const metadata: Metadata = {
  title: "Host Dashboard | Quiz-It",
};

export default function HostPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col items-center px-6 py-8">
      <QuizItHeader />
      <HostDashboard />
    </main>
  );
}
