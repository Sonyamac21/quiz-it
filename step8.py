path = "components/PlayerQuizScreen.tsx"
with open(path, "r") as f:
    content = f.read()

old = '.select("phase, current_question, current_question_index, timer_started_at, timer_duration, fastest_team, hard_deck_team, hard_deck_status, hard_deck_potential, spin_offered, spin_choice")'
new = '.select("phase, current_question, current_question_index, timer_started_at, timer_duration, fastest_team, hard_deck_team, hard_deck_status, hard_deck_potential, spin_offered, spin_choice, intermission_offers, intermission_whatsapp, intermission_other_quizzes")'

count = content.count(old)
print("occurrences:", count)
content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)
