import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Without this, Vercel can kill the function before the Claude API call
// finishes (default timeout is short), which terminates the process mid-flight
// with NO chance to return a response - that's what an empty 500 with no body
// looks like from the browser, and no try/catch inside the function can catch
// a platform-level kill. 30s gives the Anthropic call plenty of room.
export const maxDuration = 30;

// --- very simple in-memory rate limiter ---
// Resets on cold start and is per-instance only — a basic speed bump on
// top of the auth check below, not a full replacement for it.
const RATE_LIMIT = 60; // max requests
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
  // Wrap EVERYTHING in this route in one top-level try/catch. The earlier fix only
  // covered the Anthropic fetch call - but createSupabaseServerClient() throws if
  // NEXT_PUBLIC_SUPABASE_URL/ANON_KEY are missing, and that happens before the
  // Anthropic call is even reached, crashing the whole function with no response
  // body at all. That's the actual "Unexpected end of JSON input" the client saw.
  try {
    // NextResponse.next() is only valid inside middleware - using it here in a
    // regular API route handler throws immediately on every single call, which is
    // why every generation attempt failed with a completely empty 500 response no
    // matter what else we tried (timeout, token limit, etc). A plain NextResponse
    // instance works exactly the same for attaching cookies via res.cookies.set().
    const res = new NextResponse();
    const supabase = createSupabaseServerClient(req, res);

    // 1. Require a real logged-in host session. This is checked here, not
    //    just in middleware, so a direct call to this URL (curl, script,
    //    bot) with no valid session cookie is rejected before it ever
    //    reaches the Claude API.
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return NextResponse.json({ error: { message: "Not logged in - please log in again." } }, { status: 401 });
    }
    const userId = data.user.id;

    // 2. Rate limit per logged-in user (not just per IP, since a host could
    //    be on a shared venue network).
    if (isRateLimited(userId)) {
      return NextResponse.json(
        { error: { message: "Too many requests, slow down." } },
        { status: 429 },
      );
    }

    // 3. Validate the prompt.
    const { prompt, maxTokens } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: { message: "Missing prompt" } }, { status: 400 });
    }
    if (prompt.length > 8000) {
      return NextResponse.json({ error: { message: "Prompt too long" } }, { status: 400 });
    }
    // Clamp to a sane range - the fact-check call only needs a short JSON verdict
    // and was previously forced through the same 8000-token ceiling as full
    // question generation, which slowed every single check down for no reason.
    const tokenLimit = Math.min(8000, Math.max(100, Number(maxTokens) || 8000));

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: { message: "ANTHROPIC_API_KEY is missing on the server - check Vercel env vars (Production scope)." } },
        { status: 500 },
      );
    }

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: tokenLimit,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const text = await apiRes.text();
    let responseData;
    try {
      responseData = JSON.parse(text);
    } catch {
      // Anthropic (or a proxy/gateway in between) returned a non-JSON body -
      // surface the raw text instead of crashing with no useful information.
      return NextResponse.json(
        { error: { message: "Non-JSON response from Anthropic API (status " + apiRes.status + "): " + text.slice(0, 300) } },
        { status: 502 },
      );
    }

    if (!apiRes.ok) {
      return NextResponse.json(
        { error: { message: responseData?.error?.message || ("Anthropic API error (status " + apiRes.status + ")") } },
        { status: apiRes.status },
      );
    }

    return NextResponse.json(responseData, { headers: res.headers });
  } catch (e) {
    // Catches everything - including createSupabaseServerClient() throwing on
    // missing env vars, which was the actual cause of the empty/crashed response.
    return NextResponse.json(
      { error: { message: e instanceof Error ? e.message : "Unknown server error" } },
      { status: 500 },
    );
  }
}
