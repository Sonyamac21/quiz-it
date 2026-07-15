"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { HostShell, HostButton, HostInput, HostLabel } from "@/components/fable/HostConsole";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/host";

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
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice("We'll email you a reset link. It's valid for one hour.");
  }

  return (
    <HostShell>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0A0118",
          padding: 24,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse 45% 40% at 50% 45%,rgba(190,38,193,.14),transparent 70%)",
          }}
        />
        <form
          onSubmit={mode === "signin" ? handleSubmit : handleReset}
          style={{ position: "relative", width: 320, textAlign: "center" }}
        >
          <div
            style={{
              fontFamily: "'Bruno Ace SC',var(--font-logo),cursive",
              fontSize: 26,
              letterSpacing: ".05em",
              marginBottom: 6,
            }}
          >
            <span style={{ color: "#BE26C1" }}>QUIZ-</span>IT
          </div>
          <div style={{ font: "400 11px 'Inter'", color: "#6B5A8E", marginBottom: 22, letterSpacing: ".06em" }}>
            POWERED BY MAC ENTERTAINMENT
          </div>

          <div style={{ textAlign: "left" }}>
            {mode === "reset" && (
              <>
                <div
                  style={{
                    fontFamily: "'Bruno Ace SC',var(--font-logo),cursive",
                    fontSize: 15,
                    letterSpacing: ".06em",
                    marginBottom: 4,
                  }}
                >
                  Reset Password
                </div>
                <div style={{ font: "400 12px 'Inter'", color: "#B9A8D9", marginBottom: 8 }}>
                  We&apos;ll email you a reset link. It&apos;s valid for one hour.
                </div>
              </>
            )}

            <HostLabel>Email</HostLabel>
            <HostInput
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@venue.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {mode === "signin" && (
              <>
                <HostLabel>Password</HostLabel>
                <HostInput
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </>
            )}

            {error && (
              <div
                style={{
                  font: "600 11.5px 'Inter'",
                  color: "#D94FDC",
                  border: "1px solid #2E1A52",
                  borderRadius: 12,
                  padding: "8px 12px",
                  marginTop: 12,
                }}
              >
                {error}
              </div>
            )}
            {notice && (
              <div
                style={{
                  font: "600 11.5px 'Inter'",
                  color: "#B9A8D9",
                  border: "1px solid #2E1A52",
                  borderRadius: 12,
                  padding: "8px 12px",
                  marginTop: 12,
                }}
              >
                {notice}
              </div>
            )}

            <div style={{ height: 18 }} />
            <HostButton type="submit" variant="pri" disabled={loading} style={{ width: "100%" }}>
              {loading
                ? mode === "signin"
                  ? "SIGNING IN…"
                  : "SENDING…"
                : mode === "signin"
                  ? "SIGN IN"
                  : "SEND RESET LINK"}
            </HostButton>

            <div
              style={{ textAlign: "center", font: "600 11.5px 'Inter'", color: "#B9A8D9", marginTop: 14, cursor: "pointer" }}
              onClick={() => {
                setError(null);
                setNotice(null);
                setMode(mode === "signin" ? "reset" : "signin");
              }}
              role="button"
              tabIndex={0}
            >
              {mode === "signin" ? "Forgotten your password?" : "← Back to sign in"}
            </div>
          </div>
        </form>
      </div>
    </HostShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
