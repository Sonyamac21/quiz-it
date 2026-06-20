path = "app/host/session/page.tsx"
with open(path, "r") as f:
    content = f.read()

old = "      setPin(newPin);\n      setSessionId(data.id);\n      setTeams([]);\n      setStatus(\"waiting\");\n    }\n    setCreating(false);"
new = "      setPin(newPin);\n      setSessionId(data.id);\n      setTeams([]);\n      setStatus(\"waiting\");\n      setIntermissionOffers(data.intermission_offers || \"\");\n      setIntermissionWhatsapp(data.intermission_whatsapp || \"\");\n      setIntermissionOtherQuizzes(data.intermission_other_quizzes || \"\");\n    }\n    setCreating(false);"

count = content.count(old)
print("occurrences:", count)
content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)
