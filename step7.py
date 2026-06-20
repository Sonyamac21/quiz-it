path = "app/host/display/page.tsx"
with open(path, "r") as f:
    content = f.read()

old = '''  // SCOREBOARD
  if (phase === "scoreboard") {'''

new = '''  // INTERMISSION
  if (phase === "intermission") {
    const hasContent = intermissionOffers || intermissionWhatsapp || intermissionOtherQuizzes;
    return (
      <div style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:font, padding:48 }}>
        <div style={{ fontSize:42, fontWeight:800, color:purple, letterSpacing:5, marginBottom:8 }}>INTERMISSION</div>
        <div style={{ fontSize:18, color:"rgba(255,255,255,0.4)", letterSpacing:2, marginBottom:40 }}>Next round starting soon...</div>
        {!hasContent ? (
          <img src="/me-logo.jpg" alt="ME" style={{ width:100, height:100, borderRadius:"50%", border:"3px solid "+purple }} />
        ) : (
          <div style={{ display:"flex", gap:48, alignItems:"flex-start", maxWidth:"90vw" }}>
            <div style={{ display:"flex", flexDirection:"column", gap:24, maxWidth:500 }}>
              {intermissionOffers && (
                <div style={{ padding:"24px 28px", borderRadius:16, background:"rgba(255,255,255,0.05)", border:"2px solid rgba(190,38,193,0.4)" }}>
                  <div style={{ fontSize:14, color:purple, letterSpacing:3, marginBottom:10 }}>TONIGHT'S OFFERS</div>
                  <div style={{ fontSize:24, color:"#fff", lineHeight:1.4 }}>{intermissionOffers}</div>
                </div>
              )}
              {intermissionOtherQuizzes && (
                <div style={{ padding:"24px 28px", borderRadius:16, background:"rgba(255,255,255,0.05)", border:"2px solid rgba(190,38,193,0.4)" }}>
                  <div style={{ fontSize:14, color:purple, letterSpacing:3, marginBottom:10 }}>MORE QUIZ NIGHTS</div>
                  <div style={{ fontSize:22, color:"#fff", lineHeight:1.4 }}>{intermissionOtherQuizzes}</div>
                </div>
              )}
            </div>
            {intermissionWhatsapp && (
              <div style={{ padding:"24px 28px", borderRadius:16, background:"rgba(255,255,255,0.05)", border:"2px solid rgba(190,38,193,0.4)", textAlign:"center" }}>
                <div style={{ fontSize:14, color:purple, letterSpacing:3, marginBottom:14 }}>JOIN OUR WHATSAPP</div>
                <img src={"https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(intermissionWhatsapp)} alt="WhatsApp QR" style={{ width:220, height:220, borderRadius:12, background:"#fff", padding:8 }} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  // SCOREBOARD
  if (phase === "scoreboard") {'''

count = content.count(old)
print("occurrences:", count)
content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)
