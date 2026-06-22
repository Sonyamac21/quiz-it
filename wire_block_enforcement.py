path = "components/PlayerQuizScreen.tsx"
with open(path, "r") as f:
    content = f.read()

old1 = '.select("phase, current_question, current_question_index, timer_started_at, timer_duration, fastest_team, fastest_song, hard_deck_team, hard_deck_status, hard_deck_potential, spin_offered, spin_choice, spin_target_idx, intermission_offers, intermission_whatsapp, intermission_other_quizzes")'
new1 = '.select("phase, current_question, current_question_index, timer_started_at, timer_duration, fastest_team, fastest_song, hard_deck_team, hard_deck_status, hard_deck_potential, spin_offered, spin_choice, spin_target_idx, intermission_offers, intermission_whatsapp, intermission_other_quizzes, block_until, block_team")'
c1 = content.count(old1)
print("select:", c1)
content = content.replace(old1, new1)

old2 = '  const [mySubmittedDisplay, setMySubmittedDisplay] = useState("");'
new2 = '''  const [mySubmittedDisplay, setMySubmittedDisplay] = useState("");
  const [blockUntil, setBlockUntil] = useState<string | null>(null);
  const [blockTeam, setBlockTeam] = useState<string | null>(null);
  const [blockSecondsLeft, setBlockSecondsLeft] = useState(0);'''
c2 = content.count(old2)
print("state:", c2)
content = content.replace(old2, new2)

old3 = '    setSpinTargetIdx((data.spin_target_idx as number) ?? null);'
new3 = '''    setSpinTargetIdx((data.spin_target_idx as number) ?? null);
    setBlockUntil((data.block_until as string) || null);
    setBlockTeam((data.block_team as string) || null);'''
c3 = content.count(old3)
print("populate:", c3)
content = content.replace(old3, new3)

with open(path, "w") as f:
    f.write(content)
