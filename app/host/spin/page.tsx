"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import SlotMachine from "@/components/SlotMachine";

function SpinPageInner() {
  const params = useSearchParams();
  const teamName = params.get("team") || undefined;
  const victorySong = params.get("song") || undefined;
  const sessionPin = params.get("pin") || undefined;
  return <SlotMachine initialTeamName={teamName} initialVictorySong={victorySong} sessionPin={sessionPin} />;
}

export default function SpinPage() {
  return (
    <Suspense fallback={null}>
      <SpinPageInner />
    </Suspense>
  );
}
