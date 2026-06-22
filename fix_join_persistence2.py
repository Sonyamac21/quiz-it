path = "app/join/join-form.tsx"
with open(path, "r") as f:
    lines = f.readlines()

# 1. Insert localStorage save right after setSessionPin(pin);
idx1 = None
for i, line in enumerate(lines):
    if line.strip() == "setSessionPin(pin);":
        idx1 = i
        break
print("setSessionPin found at:", idx1+1 if idx1 is not None else None)
if idx1 is not None:
    lines.insert(idx1 + 1, '      localStorage.setItem(STORAGE_KEY, JSON.stringify({ teamName: teamName.trim(), sessionPin: pin }));\n')

# 2. Insert restoring guard right before "if (done) {"
idx2 = None
for i, line in enumerate(lines):
    if line.strip() == "if (done) {":
        idx2 = i
        break
print("if (done) found at:", idx2+1 if idx2 is not None else None)
if idx2 is not None:
    guard = '''    if (restoring) {
      return <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.4)", fontFamily: "'Bruno Ace SC',sans-serif", fontSize: 13, letterSpacing: 2 }}>Reconnecting...</div>;
    }
'''
    lines.insert(idx2, guard)

with open(path, "w") as f:
    f.writelines(lines)
print("done")
