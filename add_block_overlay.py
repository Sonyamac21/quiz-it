path = "components/PlayerQuizScreen.tsx"
with open(path, "r") as f:
    content = f.read()

old = '''  if ((phase === "question") && question) {
    const isPicture = question.question_type === "picture";
    const isMultiChoice = question.question_type === "multiple_choice";
    const isSequence = question.question_type === "sequence";
    const isMultiTap = question.question_type === "multi_tap";
    const imageUrl = isPicture ? question.option_b : null;
    // PICTURE ROUND - show image full screen, tap to dismiss
    if (isPicture && imageUrl) {'''

new = '''  if ((phase === "question") && question) {
    const isPicture = question.question_type === "picture";
    const isMultiChoice = question.question_type === "multiple_choice";
    const isSequence = question.question_type === "sequence";
    const isMultiTap = question.question_type === "multi_tap";
    const imageUrl = isPicture ? question.option_b : null;
    const isBlocked = !!blockUntil && blockTeam !== teamName && new Date(blockUntil).getTime() > Date.now();
    if (isBlocked && !submitted) {
      return (
        <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 12, textAlign: "center" as const, fontFamily: font }}>
          <div style={{ fontSize: 40 }}>{"\u23F8"}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#f87171" }}>TIME-OUT!</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}>{blockTeam} played Time-Out</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", marginTop: 8 }}>{blockSecondsLeft}s</div>
        </div>
      );
    }
    // PICTURE ROUND - show image full screen, tap to dismiss
    if (isPicture && imageUrl) {'''

count = content.count(old)
print("occurrences:", count)
content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)
