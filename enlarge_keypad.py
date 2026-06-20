import re

path = "components/AnswerKeypad.tsx"
with open(path, "r") as f:
    content = f.read()

replacements = [
    ('padding: "10px 0",', 'padding: "16px 0",'),
    ('fontSize: 15,\n    fontFamily: font,\n    cursor: "pointer",', 'fontSize: 18,\n    fontFamily: font,\n    cursor: "pointer",'),
    ('style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>', 'style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>'),
    ('style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>\n            {ROWS.map', 'style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>\n            {ROWS.map'),
    ('style={{ display: "flex", gap: 4, justifyContent: "center" }}>', 'style={{ display: "flex", gap: 6, justifyContent: "center" }}>'),
    ('padding: "12px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: value ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 14,',
     'padding: "16px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: value ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 16,'),
    ('padding: "12px", borderRadius: 10, background: value.trim() ? purple : "#1a1a2e", color: value.trim() ? "#fff" : "rgba(255,255,255,0.3)", border: "none", fontSize: 15,',
     'padding: "16px", borderRadius: 10, background: value.trim() ? purple : "#1a1a2e", color: value.trim() ? "#fff" : "rgba(255,255,255,0.3)", border: "none", fontSize: 17,'),
]

missing = []
for old, new in replacements:
    if old not in content:
        missing.append(old)
    else:
        content = content.replace(old, new)

if missing:
    print("MISSING (not found, skipped):")
    for m in missing:
        print(repr(m))
else:
    print("All replacements applied successfully.")

with open(path, "w") as f:
    f.write(content)
