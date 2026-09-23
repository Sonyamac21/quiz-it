"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { BUILD_INFO } from "@/lib/platform/buildInfo";
import { HostButton, HostInput, HostLabel } from "@/components/fable/HostConsole";

export default function SettingsPage() {
  // One WhatsApp group link for the whole account - shown on the Display
  // screen (as a QR guests scan) and the player handset (as a tap-to-join
  // button) during intermission, at every venue this host runs. Previously
  // this was attempted as a per-venue field, but a host only runs one
  // community group across all their venues, so it belongs here instead -
  // set once, used everywhere, never re-entered per venue.
  const [whatsappLink, setWhatsappLink] = useState("");
  const [savedWhatsappLink, setSavedWhatsappLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) { setLoading(false); return; }
      const { data, error: fetchError } = await supabase
        .from("host_settings")
        .select("whatsapp_link")
        .eq("owner_id", uid)
        .maybeSingle();
      if (fetchError) setError(fetchError.message);
      else {
        setWhatsappLink(data?.whatsapp_link || "");
        setSavedWhatsappLink(data?.whatsapp_link || "");
      }
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setSavedMessage("");
    const supabase = createSupabaseBrowserClient();
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setError("Not signed in."); setSaving(false); return; }
    const { error: saveError } = await supabase
      .from("host_settings")
      .upsert({ owner_id: uid, whatsapp_link: whatsappLink.trim() || null, updated_at: new Date().toISOString() });
    if (saveError) setError(saveError.message);
    else { setSavedWhatsappLink(whatsappLink.trim()); setSavedMessage("Saved."); }
    setSaving(false);
  }

  const dirty = whatsappLink.trim() !== savedWhatsappLink;

  return (
    <main className="qi-bo-page">
      <header className="qi-bo-pagehead">
        <div>
          <p>Administration</p>
          <h1>Settings</h1>
          <span>Platform information and operational tools.</span>
        </div>
      </header>
      <div className="qi-bo-settings">
        <section className="qi-bo-card">
          <h2>WhatsApp group</h2>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6B5A8E" }}>
            Paste your community group&rsquo;s invite link from WhatsApp (Group &rarr; Invite via Link). Shown as a scannable QR on the Display screen during intermission, and as a tap-to-request-to-join button on players&rsquo; own phones, at every venue you run.
          </p>
          {loading ? (
            <p style={{ fontSize: 13, color: "#6B5A8E" }}>Loading…</p>
          ) : (
            <>
              <HostLabel>WhatsApp Group Invite Link</HostLabel>
              <HostInput value={whatsappLink} onChange={e => setWhatsappLink(e.target.value)} placeholder="https://chat.whatsapp.com/…" />
              {error && <div className="qi-bo-alert" role="alert" style={{ marginTop: 10 }}>{error}</div>}
              {savedMessage && !dirty && <div className="qi-bo-alert" role="status" style={{ marginTop: 10, color: "#2EE06E", borderColor: "rgba(46,224,110,.45)", background: "rgba(46,224,110,.08)" }}>{savedMessage}</div>}
              <div style={{ marginTop: 12 }}>
                <HostButton variant="pri" onClick={save} disabled={saving || !dirty}>{saving ? "Saving…" : "Save"}</HostButton>
              </div>
            </>
          )}
        </section>
        <section className="qi-bo-card">
          <h2>Platform</h2>
          <dl>
            <div><dt>Version</dt><dd>{BUILD_INFO.version}</dd></div>
            <div><dt>Environment</dt><dd>{BUILD_INFO.environment}</dd></div>
            <div><dt>Git commit</dt><dd>{BUILD_INFO.commit}</dd></div>
            <div><dt>Built</dt><dd>{BUILD_INFO.builtAt}</dd></div>
            <div><dt>Database</dt><dd>{BUILD_INFO.schemaVersion}</dd></div>
          </dl>
        </section>
        <section className="qi-bo-card">
          <h2>Live operations</h2>
          <p>Diagnostics remain part of the live-session workflow, separate from planning.</p>
          <Link className="qi-bo-primary" href="/host/session">Open Live Session Centre</Link>
        </section>
      </div>
    </main>
  );
}
