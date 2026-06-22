path = "app/host/session/page.tsx"
with open(path, "r") as f:
    lines = f.readlines()

idx = None
for i, line in enumerate(lines):
    if "const loadTeams = useCallback" in line:
        idx = i
        break
print("loadTeams found at:", idx+1 if idx is not None else None)

restore_effect = '''  useEffect(() => {
    (async () => {
      try {
        const saved = localStorage.getItem(HOST_STORAGE_KEY);
        if (!saved) { setRestoringHost(false); return; }
        const parsed = JSON.parse(saved);
        if (!parsed?.pin || !parsed?.sessionId) { setRestoringHost(false); return; }
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.from("sessions").select("*").eq("id", parsed.sessionId).single();
        if (data && data.status !== "finished") {
          setPin(parsed.pin);
          setSessionId(parsed.sessionId);
          setStatus(data.status);
          setIntermissionOffers(data.intermission_offers || "");
          setIntermissionWhatsapp(data.intermission_whatsapp || "");
          setIntermissionOtherQuizzes(data.intermission_other_quizzes || "");
          const { data: teamData } = await supabase.from("teams").select("*").eq("session_pin", parsed.pin).order("created_at", { ascending: true });
          if (teamData) setTeams(teamData);
        } else {
          localStorage.removeItem(HOST_STORAGE_KEY);
        }
      } catch {
      } finally {
        setRestoringHost(false);
      }
    })();
  }, []);
'''

if idx is not None:
    lines.insert(idx, restore_effect)
    with open(path, "w") as f:
        f.writelines(lines)
    print("inserted at:", idx+1)
else:
    print("NOT FOUND")
