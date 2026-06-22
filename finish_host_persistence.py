path = "app/host/session/page.tsx"
with open(path, "r") as f:
    lines = f.readlines()

# 1. Save to localStorage right after createSession succeeds
idx1 = None
for i, line in enumerate(lines):
    if "setSessionId(data.id);" in line:
        idx1 = i
        break
print("setSessionId(data.id) found at:", idx1+1 if idx1 is not None else None)
if idx1 is not None:
    lines.insert(idx1 + 1, '      localStorage.setItem(HOST_STORAGE_KEY, JSON.stringify({ pin: newPin, sessionId: data.id }));\n')

# 2. Add restoring guard right before "return ("
idx2 = None
for i, line in enumerate(lines):
    if line.strip() == "return (":
        idx2 = i
        break
print("return ( found at:", idx2+1 if idx2 is not None else None)
if idx2 is not None:
    guard = '''  if (restoringHost) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #1a0535 0%, #0d0225 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontFamily: "sans-serif" }}>
        Reconnecting...
      </div>
    );
  }
'''
    lines.insert(idx2, guard)

with open(path, "w") as f:
    f.writelines(lines)
print("done")
