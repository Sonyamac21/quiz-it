path = "app/host/display/page.tsx"
with open(path, "r") as f:
    content = f.read()

# 1. Add "intermission" to Phase type
old1 = 'type Phase = "waiting" | "round_start" | "question" | "answer" | "celebration" | "round_end" | "scoreboard" | "quiz_end" | "hard_deck";'
new1 = 'type Phase = "waiting" | "round_start" | "question" | "answer" | "celebration" | "round_end" | "scoreboard" | "quiz_end" | "hard_deck" | "intermission";'
c1 = content.count(old1)
print("phase type:", c1)
content = content.replace(old1, new1)

# 2. Add state for intermission fields
old2 = '  const [trophyVisible, setTrophyVisible] = useState(false);'
new2 = '''  const [trophyVisible, setTrophyVisible] = useState(false);
  const [intermissionOffers, setIntermissionOffers] = useState("");
  const [intermissionWhatsapp, setIntermissionWhatsapp] = useState("");
  const [intermissionOtherQuizzes, setIntermissionOtherQuizzes] = useState("");'''
c2 = content.count(old2)
print("state:", c2)
content = content.replace(old2, new2)

# 3. Populate fields in applySession
old3 = '    setHardDeckWheelTarget((data.hard_deck_wheel_target as number) ?? null);'
new3 = '''    setHardDeckWheelTarget((data.hard_deck_wheel_target as number) ?? null);
    setIntermissionOffers((data.intermission_offers as string) || "");
    setIntermissionWhatsapp((data.intermission_whatsapp as string) || "");
    setIntermissionOtherQuizzes((data.intermission_other_quizzes as string) || "");'''
c3 = content.count(old3)
print("populate:", c3)
content = content.replace(old3, new3)

with open(path, "w") as f:
    f.write(content)
