path = "app/host/session/page.tsx"
with open(path, "r") as f:
    content = f.read()

# 1. Add state for intermission fields
old1 = '  const [sessionId, setSessionId] = useState<string | null>(null);'
new1 = '''  const [sessionId, setSessionId] = useState<string | null>(null);
  const [intermissionOffers, setIntermissionOffers] = useState("");
  const [intermissionWhatsapp, setIntermissionWhatsapp] = useState("");
  const [intermissionOtherQuizzes, setIntermissionOtherQuizzes] = useState("");
  const [savingIntermission, setSavingIntermission] = useState(false);'''
c1 = content.count(old1)
print("state occurrences:", c1)
content = content.replace(old1, new1)

# 2. Populate fields when session is created
old2 = '''      if (!error && data) {
        setPin(newPin);
        setSessionId(data.id);
        setTeams([]);
        setStatus("waiting");
      }
      setCreating(false);'''
new2 = '''      if (!error && data) {
        setPin(newPin);
        setSessionId(data.id);
        setTeams([]);
        setStatus("waiting");
        setIntermissionOffers(data.intermission_offers || "");
        setIntermissionWhatsapp(data.intermission_whatsapp || "");
        setIntermissionOtherQuizzes(data.intermission_other_quizzes || "");
      }
      setCreating(false);'''
c2 = content.count(old2)
print("populate occurrences:", c2)
content = content.replace(old2, new2)

# 3. Add saveIntermission function after endQuiz
old3 = '''    async function endQuiz() {
    if (!sessionId) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ status: "finished" }).eq("id", sessionId);
    setStatus("finished");
  }'''
new3 = '''    async function endQuiz() {
    if (!sessionId) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ status: "finished" }).eq("id", sessionId);
    setStatus("finished");
  }

  async function saveIntermission() {
    if (!sessionId) return;
    setSavingIntermission(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({
      intermission_offers: intermissionOffers,
      intermission_whatsapp: intermissionWhatsapp,
      intermission_other_quizzes: intermissionOtherQuizzes,
    }).eq("id", sessionId);
    setSavingIntermission(false);
  }'''
c3 = content.count(old3)
print("function occurrences:", c3)
content = content.replace(old3, new3)

# 4. Add the editable form UI right before the "Teams Joined" panel
old4 = '''        <div style={{ background: "rgba(45,10,94,0.5)", border: "1px solid rgba(190,38,193,0.4)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>Teams Joined <span style={{ color:"#BE26C1" }}>{teams.length}</span></div>'''
new4 = '''        <div style={{ background: "rgba(45,10,94,0.5)", border: "1px solid rgba(190,38,193,0.4)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 12 }}>Intermission Screen</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>Shown automatically between rounds on the display and player phones.</div>
            <textarea value={intermissionOffers} onChange={e => setIntermissionOffers(e.target.value)} placeholder="Venue offers (e.g. 2-for-1 cocktails at the bar)..." rows={2}
              style={{ width:"100%", padding:"10px 12px", borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff", border:"1px solid rgba(190,38,193,0.3)", fontSize:14, marginBottom:10, fontFamily:"sans-serif", resize:"vertical" as const }} />
            <input value={intermissionWhatsapp} onChange={e => setIntermissionWhatsapp(e.target.value)} placeholder="WhatsApp number or link (e.g. https://wa.me/971...)"
              style={{ width:"100%", padding:"10px 12px", borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff", border:"1px solid rgba(190,38,193,0.3)", fontSize:14, marginBottom:10 }} />
            <textarea value={intermissionOtherQuizzes} onChange={e => setIntermissionOtherQuizzes(e.target.value)} placeholder="Other quiz nights (e.g. Tuesdays at venue X, Thursdays at venue Y)..." rows={2}
              style={{ width:"100%", padding:"10px 12px", borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff", border:"1px solid rgba(190,38,193,0.3)", fontSize:14, marginBottom:10, fontFamily:"sans-serif", resize:"vertical" as const }} />
            <button onClick={saveIntermission} disabled={savingIntermission} style={{ padding:"8px 18px", borderRadius:8, background:"rgba(190,38,193,0.3)", border:"1px solid #BE26C1", color:"#fff", fontSize:13, cursor:"pointer" }}>
              {savingIntermission ? "Saving..." : "Save Intermission Content"}
            </button>
        </div>

        <div style={{ background: "rgba(45,10,94,0.5)", border: "1px solid rgba(190,38,193,0.4)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>Teams Joined <span style={{ color:"#BE26C1" }}>{teams.length}</span></div>'''
c4 = content.count(old4)
print("UI occurrences:", c4)
content = content.replace(old4, new4)

with open(path, "w") as f:
    f.write(content)
