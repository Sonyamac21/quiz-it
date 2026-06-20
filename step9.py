path = "components/PlayerQuizScreen.tsx"
with open(path, "r") as f:
    content = f.read()

old1 = 'type Phase = "waiting" | "question" | "answer" | "celebration" | "hard_deck";'
new1 = 'type Phase = "waiting" | "question" | "answer" | "celebration" | "hard_deck" | "intermission";'
c1 = content.count(old1)
print("phase type:", c1)
content = content.replace(old1, new1)

old2 = '    setSpinChoice((data.spin_choice as string) || null);'
new2 = '''    setSpinChoice((data.spin_choice as string) || null);
    setIntermissionOffers((data.intermission_offers as string) || "");
    setIntermissionWhatsapp((data.intermission_whatsapp as string) || "");
    setIntermissionOtherQuizzes((data.intermission_other_quizzes as string) || "");'''
c2 = content.count(old2)
print("populate:", c2)
content = content.replace(old2, new2)

old3 = '  const [hardDeckPotential, setHardDeckPotential] = useState(0);'
new3 = '''  const [hardDeckPotential, setHardDeckPotential] = useState(0);
  const [intermissionOffers, setIntermissionOffers] = useState("");
  const [intermissionWhatsapp, setIntermissionWhatsapp] = useState("");
  const [intermissionOtherQuizzes, setIntermissionOtherQuizzes] = useState("");'''
c3 = content.count(old3)
print("state:", c3)
content = content.replace(old3, new3)

with open(path, "w") as f:
    f.write(content)
