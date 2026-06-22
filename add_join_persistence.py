path = "app/join/join-form.tsx"
with open(path, "r") as f:
    content = f.read()

old1 = '''"use client";
import { PlayerQuizScreen } from "@/components/PlayerQuizScreen";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";'''
new1 = '''"use client";
import { PlayerQuizScreen } from "@/components/PlayerQuizScreen";
import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const STORAGE_KEY = "quizit_player_session";'''
c1 = content.count(old1)
print("imports:", c1)
content = content.replace(old1, new1)

old2 = '''  const [sessionPin, setSessionPin] = useState("");
  const [preview, setPreview] = useState<HTMLAudioElement | null>(null);'''
new2 = '''  const [sessionPin, setSessionPin] = useState("");
  const [preview, setPreview] = useState<HTMLAudioElement | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) { setRestoring(false); return; }
        const parsed = JSON.parse(saved);
        if (!parsed?.teamName || !parsed?.sessionPin) { setRestoring(false); return; }
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.from("sessions").select("status").eq("pin", parsed.sessionPin).single();
        if (data && data.status !== "finished") {
          setTeamName(parsed.teamName);
          setSessionPin(parsed.sessionPin);
          setDone(true);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
      } finally {
        setRestoring(false);
      }
    })();
  }, []);'''
c2 = content.count(old2)
print("restore effect:", c2)
content = content.replace(old2, new2)

old3 = '''        setSessionPin(pin);
        if (dbError) throw dbError;
        setDone(true);'''
new3 = '''        setSessionPin(pin);
        if (dbError) throw dbError;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ teamName: teamName.trim(), sessionPin: pin }));
        setDone(true);'''
c3 = content.count(old3)
print("save on join:", c3)
content = content.replace(old3, new3)

old4 = '''      if (done) {
        return <PlayerQuizScreen teamName={teamName} sessionPin={sessionPin} />;
      }

    if (step === "pin") {'''
new4 = '''      if (restoring) {
        return <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.4)", fontFamily: "'Bruno Ace SC',sans-serif", fontSize: 13, letterSpacing: 2 }}>Reconnecting...</div>;
      }

      if (done) {
        return <PlayerQuizScreen teamName={teamName} sessionPin={sessionPin} />;
      }

    if (step === "pin") {'''
c4 = content.count(old4)
print("restoring guard:", c4)
content = content.replace(old4, new4)

with open(path, "w") as f:
    f.write(content)
