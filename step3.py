path = "app/host/session/page.tsx"
with open(path, "r") as f:
    content = f.read()

old = "  async function startQuiz() {"
new = """  async function saveIntermission() {
    if (!sessionId) return;
    setSavingIntermission(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({
      intermission_offers: intermissionOffers,
      intermission_whatsapp: intermissionWhatsapp,
      intermission_other_quizzes: intermissionOtherQuizzes,
    }).eq("id", sessionId);
    setSavingIntermission(false);
  }
  async function startQuiz() {"""

count = content.count(old)
print("occurrences:", count)
content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)
