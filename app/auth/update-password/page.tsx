"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HostButton, HostInput, HostLabel, HostShell } from "@/components/fable/HostConsole";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login?error=expired_recovery_link");
        return;
      }
      setReady(true);
    });
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }

    await supabase.auth.signOut();
    router.replace("/login?passwordUpdated=1");
  }

  return (
    <HostShell>
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0A0118", padding: 24 }}>
        <form onSubmit={handleSubmit} style={{ width: "min(100%, 420px)", textAlign: "left" }}>
          <h1 style={{ fontSize: 30, margin: "0 0 8px" }}>Choose a new password</h1>
          <p style={{ color: "#B9A8D9", fontSize: 16, lineHeight: 1.5, margin: "0 0 24px" }}>
            Enter it twice, then sign in with your new password.
          </p>

          <HostLabel>New password</HostLabel>
          <HostInput
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <HostLabel>Confirm new password</HostLabel>
          <HostInput
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />

          {error && <p role="alert" style={{ color: "#FF7B88", fontSize: 15 }}>{error}</p>}

          <div style={{ height: 18 }} />
          <HostButton type="submit" variant="pri" disabled={!ready || loading} style={{ width: "100%", minHeight: 52 }}>
            {loading ? "UPDATING…" : ready ? "UPDATE PASSWORD" : "CHECKING LINK…"}
          </HostButton>
        </form>
      </main>
    </HostShell>
  );
}
