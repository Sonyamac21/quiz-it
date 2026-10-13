"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { HostButton, HostInput } from "@/components/fable/HostConsole";

export default function AccountPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data, error } = await createSupabaseBrowserClient().auth.getUser();
        if (error) throw error;
        if (!data.user) { router.replace("/login?redirectTo=%2Fhost%2Faccount"); return; }
        if (!active) return;
        const hostName = String(data.user.user_metadata?.full_name || data.user.user_metadata?.name || "");
        setName(hostName); setSavedName(hostName); setEmail(data.user.email || "");
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : "We couldn't load your account. Please refresh and try again.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [router]);

  async function run(action: "name" | "password" | "signout") {
    if (busy || loading || !email) return;
    setBusy(action); setError(""); setNotice("");
    try {
      const supabase = createSupabaseBrowserClient();
      if (action === "name") {
        const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
        if (error) throw error;
        setSavedName(name.trim()); setName(name.trim()); setNotice("Your host name has been saved.");
      } else if (action === "password") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: new URL("/auth/callback", window.location.origin).toString() });
        if (error) throw error;
        setNotice("Password reset email sent. Open the link in this browser to choose a new password.");
      } else {
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) throw error;
        router.replace("/login"); router.refresh();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "That didn't work. Please try again.");
    } finally { setBusy(null); }
  }

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim()) void run("name");
  }

  return <main className="qi-bo-page">
    <header className="qi-bo-pagehead"><div><p>Host settings</p><h1>Your account</h1><span>Manage your host details and sign-in options.</span></div></header>
    {error && <div className="qi-bo-alert" role="alert">{error}</div>}
    {notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">Loading your account…</p> : <div className="qi-bo-settings">
      <section className="qi-bo-card">
        <h2>Host details</h2><p>Your name appears when planning events and managing venues.</p>
        <form onSubmit={saveName}>
          <label htmlFor="host-name">Host name</label>
          <HostInput id="host-name" autoComplete="name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} disabled={!!busy || !email} />
          <p><HostButton variant="pri" type="submit" disabled={!!busy || !email || !name.trim() || name.trim() === savedName}>{busy === "name" ? "Saving…" : "Save host name"}</HostButton></p>
        </form>
        <label htmlFor="host-email">Sign-in email</label><HostInput id="host-email" type="email" value={email} readOnly />
      </section>
      <section className="qi-bo-card">
        <h2>Password</h2><p>We’ll send a secure reset link to your sign-in email so you can choose a new password.</p>
        <HostButton onClick={() => void run("password")} disabled={!!busy || !email}>{busy === "password" ? "Sending…" : "Send password reset email"}</HostButton>
      </section>
      <section className="qi-bo-card">
        <h2>Quiz preferences</h2><p>Manage your WhatsApp group link and other quiz settings.</p>
        <Link className="qi-bo-primary" href="/host/settings">Open preferences</Link>
      </section>
      <section className="qi-bo-card">
        <h2>Sign out</h2><p>Sign out of this browser when you’ve finished, especially on a shared computer. Save any quiz changes first.</p>
        <HostButton onClick={() => void run("signout")} disabled={!!busy || !email}>{busy === "signout" ? "Signing out…" : "Sign out of this browser"}</HostButton>
      </section>
    </div>}
  </main>;
}
