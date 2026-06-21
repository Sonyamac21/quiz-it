path = "app/host/quiz/page.tsx"
with open(path, "r") as f:
    content = f.read()

old = '''  function startTickAudio(duration: number) {
    try {
      const ctx = new AudioContext();
      tickAudioRef.current = ctx;'''

new = '''  function startTickAudio(duration: number) {
    try {
      const ctx = tickAudioRef.current && tickAudioRef.current.state !== "closed" ? tickAudioRef.current : new AudioContext();
      tickAudioRef.current = ctx;
      ctx.resume();'''

count = content.count(old)
print("occurrences:", count)
content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)
