"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import SlotMachine from "@/components/SlotMachine";

function SpinPageInner() {
  const params = useSearchParams();
  const teamName = params.get("team") || undefined;
  const victorySong = params.get("song") || undefined;
  return <SlotMachine initialTeamName={teamName} initialVictorySong={victorySong} />;
}

export default function SpinPage() {
  return (
    <Suspense fallback={null}>
      <SpinPageInner />
    </Suspense>
  );
}
