import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// --- very simple in-memory rate limiter ---
// Resets on cold start and is per-instance only — a basic speed bump on
// top of the auth check below, not a full replacement for it.
const RATE_LIMIT = 10; // max requests
const WINDOW_MS = 60_000; // per 1 minute
const requestLog = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = requestLog.get(key) ?? [];
  const recent = timestamps.filter((t) => now - t < WINDOW_MS);

  if (recent.length >= RATE_LIMIT) {
    requestLog.set(key, recent);
    return true;
  }

  recent.push(now);
  requestLog.set(key, recent);
  return false;
}

export async function POST(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createSupabaseServerClient(req, res);

  // 1. Require a real logged-in host session. This is checked here, not
  //    just in middleware, so a direct call to this URL (curl, script,
  //    bot) with no valid session cookie is rejected before it ever
  //    reaches the Claude API.
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Rate limit per logged-in user (not just per IP, since a host could
  //    be on a shared venue network).
  if (isRateLimited(data.user.id)) {
    return NextResponse.json(
      { error: "Too many requests, slow down." },
      { status: 429 },
    );
  }

  // 3. Validate the prompt.
  const { prompt } = await req.json();
  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }
  if (prompt.length > 8000) {
    return NextResponse.json({ error: "Prompt too long" }, { status: 400 });
  }

  const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const responseData = await apiRes.json();
  return NextResponse.json(responseData, { headers: res.headers });
}
