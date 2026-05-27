"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Team = {
  id: string;
  team_name: string;
  created_at: string;
};

function teamCountLabel(count: number) {
  if (count === 1) return "1 team joined";
  return `${count} teams joined`;
}

export function HostDashboard() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error: fetchError } = await supabase
      .from("teams")
      .select("id, team_name, created_at")
      .order("created_at", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setTeams(data ?? []);
    setError(null);
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    fetchTeams().finally(() => setLoading(false));

    const channel = supabase
      .channel("host-teams")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teams" },
        () => {
          fetchTeams();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTeams]);

  return (
    <section className="mt-8 flex w-full max-w-lg flex-1 flex-col min-h-0">
      <h2 className="font-logo text-center text-2xl tracking-wide text-[#BE26C1] sm:text-3xl">
        Teams Joined
      </h2>
      <p className="mt-2 text-center text-sm text-white">
        {loading ? "Loading teams..." : teamCountLabel(teams.length)}
      </p>

      {error ? (
        <p className="mt-4 text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="mt-6 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {!loading && teams.length === 0 ? (
          <li className="rounded-lg border border-[#BE26C1]/50 px-4 py-6 text-center text-sm text-white/60">
            No teams yet. Waiting for players to join...
          </li>
        ) : (
          teams.map((team) => (
            <li
              key={team.id}
              className="rounded-lg border border-[#BE26C1] bg-black px-4 py-3 text-center text-white"
            >
              {team.team_name}
            </li>
          ))
        )}
      </ul>

      <button
        type="button"
        className="font-logo mt-6 w-full shrink-0 rounded-lg bg-[#BE26C1] px-6 py-4 text-xl tracking-wide text-white transition-opacity hover:opacity-90"
      >
        Start Quiz
      </button>
    </section>
  );
}
