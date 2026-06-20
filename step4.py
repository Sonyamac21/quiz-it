path = "app/host/session/page.tsx"
with open(path, "r") as f:
    content = f.read()

old = '          <div style={{ background: "rgba(45,10,94,0.5)", border: "1px solid rgba(190,38,193,0.4)", borderRadius: 12, padding: 20, marginBottom: 20 }}>\n            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16}}>\n              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>Teams Joined <span style={{ color: "#BE26C1" }}>{teams.length}</span></div>'

new = '''          <div style={{ background: "rgba(45,10,94,0.5)", border: "1px solid rgba(190,38,193,0.4)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 12 }}>Intermission Screen</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>Shown automatically between rounds on the display and player phones.</div>
            <textarea value={intermissionOffers} onChange={e => setIntermissionOffers(e.target.value)} placeholder="Venue offers..." rows={2} style={{ width:"100%", padding:"10px 12px", borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff", border:"1px solid rgba(190,38,193,0.3)", fontSize:14, marginBottom:10, fontFamily:"sans-serif" }} />
            <input value={intermissionWhatsapp} onChange={e => setIntermissionWhatsapp(e.target.value)} placeholder="WhatsApp number or link" style={{ width:"100%", padding:"10px 12px", borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff", border:"1px solid rgba(190,38,193,0.3)", fontSize:14, marginBottom:10 }} />
            <textarea value={intermissionOtherQuizzes} onChange={e => setIntermissionOtherQuizzes(e.target.value)} placeholder="Other quiz nights..." rows={2} style={{ width:"100%", padding:"10px 12px", borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff", border:"1px solid rgba(190,38,193,0.3)", fontSize:14, marginBottom:10, fontFamily:"sans-serif" }} />
            <button onClick={saveIntermission} disabled={savingIntermission} style={{ padding:"8px 18px", borderRadius:8, background:"rgba(190,38,193,0.3)", border:"1px solid #BE26C1", color:"#fff", fontSize:13, cursor:"pointer" }}>{savingIntermission ? "Saving..." : "Save Intermission Content"}</button>
          </div>

          <div style={{ background: "rgba(45,10,94,0.5)", border: "1px solid rgba(190,38,193,0.4)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16}}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>Teams Joined <span style={{ color: "#BE26C1" }}>{teams.length}</span></div>'''

count = content.count(old)
print("occurrences:", count)
content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)
