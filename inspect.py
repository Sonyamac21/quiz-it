path = "app/host/session/page.tsx"
with open(path, "r") as f:
    lines = f.readlines()
for i in range(128, 136):
    print(i+1, repr(lines[i]))
