path = "components/AnswerKeypad.tsx"
with open(path, "r") as f:
    content = f.read()

old = '<div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>'
new = '<div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>'

count = content.count(old)
print("occurrences found:", count)
content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)
