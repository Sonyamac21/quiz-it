path = "app/host/session/page.tsx"
with open(path, "r") as f:
    lines = f.readlines()

idx = None
for i, line in enumerate(lines):
    if line.strip() == "export default function SessionPage() {":
        idx = i
        break
print("export default found at:", idx+1 if idx is not None else None)

if idx is not None:
    lines.insert(idx, 'const HOST_STORAGE_KEY = "quizit_host_session";\n\n')
    with open(path, "w") as f:
        f.writelines(lines)
    print("inserted successfully")
else:
    print("NOT FOUND")
