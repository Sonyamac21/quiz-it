path = "app/host/quiz/page.tsx"
with open(path, "r") as f:
    content = f.read()

old = '''  async function doEndRound() {
    if (!sessionId) return;
    stopVictorySong();
    stopTickAudio();
    setHostPhase("round_end");
    playSound("round-end.mp3");
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ phase: "round_end" }).eq("id", sessionId);
    setRoundNumber(prev => prev + 1);
  }'''

new = '''  async function doEndRound() {
    if (!sessionId) return;
    stopVictorySong();
    stopTickAudio();
    setHostPhase("round_end");
    playSound("round-end.mp3");
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ phase: "intermission" }).eq("id", sessionId);
    setRoundNumber(prev => prev + 1);
  }'''

count = content.count(old)
print("occurrences:", count)
content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)
