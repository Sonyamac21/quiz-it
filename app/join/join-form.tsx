"use client";

import { useState } from "react";

export function JoinForm() {
  const [teamName, setTeamName] = useState("");

  return (
    <form
      className="mt-10 flex w-full max-w-sm flex-col gap-6"
      onSubmit={(e) => e.preventDefault()}
    >
      <input
        type="text"
        value={teamName}
        onChange={(e) => setTeamName(e.target.value)}
        placeholder="Team name"
        aria-label="Team name"
        className="w-full rounded-lg border border-[#BE26C1] bg-black px-4 py-3 text-center text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#BE26C1]"
      />
      <button
        type="submit"
        className="font-logo w-full rounded-lg bg-[#BE26C1] px-6 py-4 text-xl tracking-wide text-white transition-opacity hover:opacity-90"
      >
        Join Game
      </button>
    </form>
  );
}
