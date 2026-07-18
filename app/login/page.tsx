"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { Alert, BrandLockup, Button, Field, Input, Panel } from "@/components/ui/quiz-it-ui";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirectPath(searchParams.get("redirectTo"));
  const passwordUpdated = searchParams.get("passwordUpdated") === "1";
  const recoveryError = searchParams.get("error");
  const recoveryErrorMessage =
    recoveryError === "missing_pkce_state"
      ? "This link was opened in a different browser from the one that requested it. Request a new password link and try again."
      : "That password link is invalid or has expired. Request a new one.";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "reset">("signin");

  // Auth logic unchanged — presentation-only rebuild.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email) {
      setError("Enter your email and we'll send a reset link.");
      return;
    }
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl.toString(),
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice("We'll email you a reset link. It's valid for one hour.");
  }

  return (
    <main className="qi-app-shell qi-auth-shell">
      <Panel variant="elevated" className="qi-auth-card">
        <BrandLockup />
        <form
          onSubmit={mode === "signin" ? handleSubmit : handleReset}
        >
          {mode === "signin" ? <h1 className="m-0 text-3xl font-bold">Host sign in</h1> : null}
          {mode === "reset" ? (
            <div>
              <p className="qi-eyebrow">Account recovery</p>
              <h1 className="m-0 text-2xl font-bold">Reset your password</h1>
              <p className="mt-2 mb-0 text-[var(--qi-text-secondary)]">We&apos;ll email you a reset link. It&apos;s valid for one hour.</p>
            </div>
          ) : null}

          <Field label="Email">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="email" required autoComplete="email" placeholder="you@venue.com" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>

          {mode === "signin" ? (
            <Field label="Password">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
            </Field>
          ) : null}

          {error ? <Alert tone="error" className="mt-4">{error}</Alert> : null}
          {notice || passwordUpdated || recoveryError ? (
            <Alert tone={passwordUpdated || notice ? "success" : "warning"} className="mt-4">
              {notice || (passwordUpdated ? "Password updated. Sign in with your new password." : recoveryErrorMessage)}
            </Alert>
          ) : null}

          <Button type="submit" loading={loading} className="mt-5 w-full">
            {mode === "signin" ? "Sign in" : "Send reset link"}
          </Button>

          <button className="qi-auth-toggle" type="button" onClick={() => { setError(null); setNotice(null); setMode(mode === "signin" ? "reset" : "signin"); }}>
            {mode === "signin" ? "Forgotten your password?" : "← Back to sign in"}
          </button>
        </form>
      </Panel>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
