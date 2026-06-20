path = "app/host/quiz/page.tsx"
with open(path, "r") as f:
    content = f.read()

# 1. Add helper function for per-team power card usage, right after teamAnswer helper
old1 = '  const teamHasAnswered = (teamName: string) => answers.some(a => a.team_name === teamName);\n  const teamAnswer = (teamName: string) => answers.find(a => a.team_name === teamName)?.answer_text || "";'
new1 = '''  const teamHasAnswered = (teamName: string) => answers.some(a => a.team_name === teamName);
  const teamAnswer = (teamName: string) => answers.find(a => a.team_name === teamName)?.answer_text || "";
  const teamCardsUsed = (teamName: string) => new Set(unoCards.filter(c => c.team_name === teamName).map(c => c.card_type));
  const PowerCardDots = ({ teamName }: { teamName: string }) => {
    const used = teamCardsUsed(teamName);
    return (
      <div style={{ display:"flex", gap:4 }}>
        {(["block","reverse","x2"] as const).map(ct => (
          <span key={ct} title={cardLabel[ct] + (used.has(ct) ? " (used)" : " (available)")}
            style={{ width:8, height:8, borderRadius:"50%", background: used.has(ct) ? "rgba(255,255,255,0.12)" : cardColor[ct], border: used.has(ct) ? "1px solid rgba(255,255,255,0.15)" : "none" }} />
        ))}
      </div>
    );
  };'''

count1 = content.count(old1)
print("helper occurrences:", count1)
content = content.replace(old1, new1)

# 2. Add a pre-score team list (shown before scores are initialised) so host sees connected teams immediately
old2 = '''            {scores.length === 0 && teams.length > 0 && (
              <button onClick={() => ensureScores(sessionPin, teams)} style={{ width:"100%", padding:"8px", borderRadius:8, background:"rgba(190,38,193,0.2)", border:"1px solid rgba(190,38,193,0.4)", color:"#BE26C1", fontSize:13, cursor:"pointer", marginBottom:10 }}>Initialise Scores</button>
            )}'''
new2 = '''            {scores.length === 0 && teams.length > 0 && (
              <>
                <button onClick={() => ensureScores(sessionPin, teams)} style={{ width:"100%", padding:"8px", borderRadius:8, background:"rgba(190,38,193,0.2)", border:"1px solid rgba(190,38,193,0.4)", color:"#BE26C1", fontSize:13, cursor:"pointer", marginBottom:10 }}>Initialise Scores</button>
                {teams.map(t => (
                  <div key={t.id} style={{ padding:"8px 10px", borderRadius:10, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", marginBottom:6 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e", flexShrink:0 }} />
                      <span style={{ fontWeight:700, fontSize:13, flex:1, color:"#fff" }}>{t.team_name}</span>
                      <PowerCardDots teamName={t.team_name} />
                    </div>
                    {t.victory_song && (
                      <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)", paddingLeft:13, marginTop:3 }}>♪ {t.victory_ng.replace(/\\s*SQS\\s*$/i,"").replace(/[-_]+$/,"").replace(/[-_]/g," ").trim()}</div>
                    )}
                  </div>
                ))}
              </>
            )}'''

count2 = content.count(old2)
print("pre-score list occurrences:", count2)
content = content.replace(old2, new2)

# 3. Add victory song + power card dots to each scored team row
old3 = '''                  <div style={{ display:"flex", alignItems:"center", paddingLeft:28, marginTop:3, gap:6 }}>
                    <span style={{ fontSize:11, color:"rgba(255,255,255,0.3)" }}>Rd: +{s.round_points}</span>
                    {answered && <span style={{ fontSize:11, color:"#22c55e", fontStyle:"italic", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{ans}</span>}'''
new3 = '''                  <div style={{ display:"flex", alignItems:"center", paddingLeft:28, marginTop:3, gap:6 }}>
                    <span style={{ fontSize:11, color:"rgba(255,255,255,0.3)" }}>Rd: +{s.round_points}</span>
                    {answered && <span style={{ fontSize:11, color:"#22c55e", fontStyle:"italic", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{ans}</span>}
                    <PowerCardDots teamName={s.team_name} />'''

count3 = content.count(old3)
print("scored row occurrences:", count3)
content = content.replace(old3, new3)

with open(path, "w") as f:
    f.write(content)
