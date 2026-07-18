"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, BrandLockup, Button, Field, Input, Panel } from "@/components/ui/quiz-it-ui";
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
    <main className="qi-app-shell qi-auth-shell">
      <Panel variant="elevated" className="qi-auth-card">
        <BrandLockup />
        <form onSubmit={handleSubmit}>
          <h1 className="m-0 text-3xl font-bold">Choose a new password</h1>
          <p className="mt-2 mb-6 text-[var(--qi-text-secondary)]">
            Enter it twice, then sign in with your new password.
          </p>

          <Field label="New password" helpText="Use at least 8 characters.">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />}
          </Field>

          <Field label="Confirm new password">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />}
          </Field>

          {error ? <Alert tone="error" className="mt-4">{error}</Alert> : null}

          <Button type="submit" loading={loading} disabled={!ready} className="mt-5 w-full">
            {ready ? "Update password" : "Checking link…"}
          </Button>
        </form>
      </Panel>
    </main>
  );
}
