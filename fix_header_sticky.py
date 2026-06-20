path = "components/quiz-it-header.tsx"
with open(path, "r") as f:
    content = f.read()

old = '<header className="w-full bg-[#0d0520] border-b border-[#BE26C1]/40 px-4 py-3">'
new = '<header className="w-full bg-[#0d0520] border-b border-[#BE26C1]/40 px-4 py-3 sticky top-0 z-50">'

count = content.count(old)
print("occurrences found:", count)
content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)
