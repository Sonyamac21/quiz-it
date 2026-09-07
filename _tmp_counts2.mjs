import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const text = fs.readFileSync(".env.local", "utf8");
const env = {};
for (const line of text.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { count, error } = await supabase.from("question_bank").select("id", { count: "exact", head: true }).eq("question_type","number");
console.log({count, error});
