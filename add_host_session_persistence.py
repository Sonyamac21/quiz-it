path = "app/host/session/page.tsx"
with open(path, "r") as f:
    lines = f.readlines()

# 1. Add STORAGE_KEY constant after generatePin function
idx1 = None
for i, line in enumerate(lines):
    if line.strip() == "}" and i > 0 and "generatePin" in lines[i-1]:
        idx1 = i
        break
print("generatePin end found at:", idx1+1 if idx1 is not None else None)
if idx1 is not None:
    lines.insert(idx1 + 1, '\nconst HOST_STORAGE_KEY = "quizit_host_session";\n')

# 2. Add restoring state near sessionId
idx2 = None
for i, line in enumerate(lines):
    if 'const [sessionId, setSessionId] = useState<string | null>(null);' in line:
        idx2 = i
        break
print("sessionId state found at:", idx2+1 if idx2 is not None else None)
if idx2 is not None:
    lines.insert(idx2 + 1, '  const [restoringHost, setRestoringHost] = useState(true);\n')

with open(path, "w") as f:
    f.writelines(lines)
print("step1 done")
