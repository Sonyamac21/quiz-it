path = "app/host/quiz/page.tsx"
with open(path, "r") as f:
    content = f.read()

old = "t.victory_ng.replace"
new = "t.victory_song.replace"

count = content.count(old)
print("occurrences found:", count)
content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)
