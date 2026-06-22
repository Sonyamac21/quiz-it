path = "components/UnoCards.tsx"
with open(path, "r") as f:
    content = f.read()

old = '''  const playCard = async (cardType: string) => {
    if (used.includes(cardType) || playing) return;
    setPlaying(cardType);
    const supabase = createSupabaseBrowserClient();
    await supabase.from("uno_cards").insert({
      team_name: teamName,
      card_type: cardType,
      used: true,
      played_at: new Date().toISOString(),
      session_pin: sessionPin || "",
    });
    setUsed(prev => [...prev, cardType]);
    setPlaying(null);
  };'''

new = '''  const playCard = async (cardType: string) => {
    if (used.includes(cardType) || playing) return;
    setPlaying(cardType);
    const supabase = createSupabaseBrowserClient();
    await supabase.from("uno_cards").insert({
      team_name: teamName,
      card_type: cardType,
      used: true,
      played_at: new Date().toISOString(),
      session_pin: sessionPin || "",
    });
    if (cardType === "block" && sessionPin) {
      await supabase.from("sessions").update({
        block_until: new Date(Date.now() + 10000).toISOString(),
        block_team: teamName,
      }).eq("pin", sessionPin);
    }
    if (cardType === "reverse" && sessionPin) {
      const { data: existing } = await supabase.from("scores").select("total_points").eq("session_pin", sessionPin).eq("team_name", teamName).maybeSingle();
      if (existing) {
        const current = existing.total_points || 0;
        const sign = current < 0 ? -1 : 1;
        const reversed = sign * parseInt(Math.abs(current).toString().split("").reverse().join("") || "0", 10);
        await supabase.from("scores").update({ total_points: reversed }).eq("session_pin", sessionPin).eq("team_name", teamName);
      }
    }
    setUsed(prev => [...prev, cardType]);
    setPlaying(null);
  };'''

count = content.count(old)
print("occurrences:", count)
content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)
