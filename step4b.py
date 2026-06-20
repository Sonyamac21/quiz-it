path = "app/host/session/page.tsx"
with open(path, "r") as f:
    lines = f.readlines()

insert_block = '''          <div style={{ background: "rgba(45,10,94,0.5)", border: "1px solid rgba(190,38,193,0.4)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 12 }}>Intermission Screen</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>Shown automatically between rounds on the display and player phones.</div>
            <textarea value={intermissionOffers} onChange={e => setIntermissionOffers(e.target.value)} placeholder="Venue offers..." rows={2} style={{ width:"100%", padding:"10px 12px", borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff", border:"1px solid rgba(190,38,193,0.3)", fontSize:14, marginBottom:10, fontFamily:"sans-serif" }} />
            <input value={intermissionWhatsapp} onChange={e => setIntermissionWhatsapp(e.target.value)} placeholder="WhatsApp number or link" style={{ width:"100%", padding:"10px 12px", borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff", border:"1px solid rgba(190,38,193,0.3)", fontSize:14, marginBottom:10 }} />
            <textarea value={intermissionOtherQuizzes} onChange={e => setIntermissionOtherQuizzes(e.target.value)} placeholder="Other quiz nights..." rows={2} style={{ width:"100%", padding:"10px 12px", borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff", border:"1px solid rgba(190,38,193,0.3)", fontSize:14, marginBottom:10, fontFamily:"sans-serif" }} />
            <button onClick={saveIntermission} disabled={savingIntermission} style={{ padding:"8px 18px", borderRadius:8, background:"rgba(190,38,193,0.3)", border:"1px solid #BE26C1", color:"#fff", fontSize:13, cursor:"pointer" }}>{savingIntermission ? "Saving..." : "Save Intermission Content"}</button>
          </div>

'''

target = '          <div style={{ background: "rgba(45,10,94,0.5)", border: "1px solid rgba(190,38,193,0.4)", borderRadius:12, padding: 20, marginBottom: 20 }}>\n'

idx = None
for i, line in enumerate(lines):
    if line == target:
        idx = i
        break

print("found at line:", idx+1 if idx is not None else None)

if idx is not None:
    lines.insert(idx, insert_block)
    with open(path, "w") as f:
        f.writelines(lines)
    print("inserted successfully")
else:
    print("NOT FOUND - no changes made")
