path = "components/PlayerQuizScreen.tsx"
with open(path, "r") as f:
    lines = f.readlines()

insert_block = '''  if (phase === "intermission") {
    const hasContent = intermissionOffers || intermissionWhatsapp || intermissionOtherQuizzes;
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 16, textAlign: "center" as const, fontFamily: font }}>
        <div style={{ fontSize: 22, color: purple, letterSpacing: 4, fontWeight: 700 }}>INTERMISSION</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>Next round starting soon...</div>
        {!hasContent && (
          <img src="/me-logo.jpg" alt="ME" style={{ width: 70, height: 70, borderRadius: "50%", border: "2px solid " + purple, marginTop: 12 }} />
        )}
        {intermissionOffers && (
          <div style={{ padding: "16px 18px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(190,38,193,0.4)", width: "100%", maxWidth: 340 }}>
            <div style={{ fontSize: 11, color: purple, letterSpacing: 2, marginBottom: 6 }}>TONIGHT'S OFFERS</div>
            <div style={{ fontSize: 15, color: "#fff", lineHeight: 1.4 }}>{intermissionOffers}</div>
          </div>
        )}
        {intermissionWhatsapp && (
          <div style={{ padding: "16px 18px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(190,38,193,0.4)", width: "100%", maxWidth: 340 }}>
            <div style={{ fontSize: 11, color: purple, letterSpacing: 2, marginBottom: 10 }}>JOIN OUR WHATSAPP</div>
            <img src={"https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=" + encodeURIComponent(intermissionWhatsapp)} alt="WhatsApp QR" style={{ width: 140, height: 140, borderRadius: 10, background: "#fff", padding: 6 }} />
          </div>
        )}
        {intermissionOtherQuizzes && (
          <div style={{ padding: "16px 18px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(190,38,193,0.4)", width: "100%", maxWidth: 340 }}>
            <div style={{ fontSize: 11, color: purple, letterSpacing: 2, marginBottom: 6 }}>MORE QUIZ NIGHTS</div>
            <div style={{ fontSize: 14, color: "#fff", lineHeight: 1.4 }}>{intermissionOtherQuizzes}</div>
          </div>
        )}
      </div>
    );
  }
'''

idx = None
for i, line in enumerate(lines):
    if 'if (phase === "celebration")' in line:
        idx = i
        break

print("found celebration block at line:", idx+1 if idx is not None else None)

if idx is not None:
    lines.insert(idx, insert_block)
    with open(path, "w") as f:
        f.writelines(lines)
    print("inserted successfully")
else:
    print("NOT FOUND")
