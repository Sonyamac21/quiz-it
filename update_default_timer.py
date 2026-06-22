path = "app/host/quiz/page.tsx"
with open(path, "r") as f:
    content = f.read()

old1 = '  const [timerDuration, setTimerDuration] = useState(10);'
new1 = '  const [timerDuration, setTimerDuration] = useState(15);'
c1 = content.count(old1)
print("timerDuration:", c1)
content = content.replace(old1, new1)

old2 = '  const [timeLeft, setTimeLeft] = useState(10);'
new2 = '  const [timeLeft, setTimeLeft] = useState(15);'
c2 = content.count(old2)
print("timeLeft:", c2)
content = content.replace(old2, new2)

with open(path, "w") as f:
    f.write(content)
