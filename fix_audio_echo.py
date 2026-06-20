path = "app/host/quiz/page.tsx"
with open(path, "r") as f:
    content = f.read()

old = "    await supabase.from(\"sessions\").update({ phase: \"celebration\", fastest_team: fastestTeamName, fastest_song: song, spin_used: false, spin_offered: false, spin_choice: null }).eq(\"id\", sessionId);\n    if (song) playVictorySong(song);\n  }"
new = "    await supabase.from(\"sessions\").update({ phase: \"celebration\", fastest_team: fastestTeamName, fastest_song: song, spin_used: false, spin_offered: false, spin_choice: null }).eq(\"id\", sessionId);\n    // Victory song now plays only on the display screen to avoid duplicate/echoing audio\n  }"

count = content.count(old)
print("occurrences found:", count)
content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)
