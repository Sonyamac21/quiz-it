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
//
// Was 60/min. Since the Haiku validation split (moderation/theme/quality/
// balance now each cost their own request instead of riding along with
// generation) plus the concurrency increase (MAX_AI_CONCURRENCY 3->5,
// per-round pipeline depth 2->3) landed, a single accepted question can cost
// up to 5 requests instead of 1-2, and "Generate All Rounds" fires several
// rounds' pipelines at once. That combination routinely blew past 60/min
// during totally normal use, and the resulting 429 ("Too many requests, slow
// down") is worded exactly like the persistent-failure patterns
// generateRound.ts bails out on immediately - so a legitimate Generate All
// burst looked identical to a real auth/quota failure and gave up after a
// single attempt per round instead of just slowing down. Raised generously
// for a single-host tool (this isn't multi-tenant abuse protection, just a
// sanity ceiling) rather than tuned to the exact new call volume, since that
// volume will keep shifting as generation logic changes.
const RATE_LIMIT = 300; // max requests
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
    const { prompt, maxTokens, structuredOutput, webSearch, model } = await req.json();
    // Only two models are ever allowed through from the client - this is
    // NOT a general passthrough (a caller can't ask the server to bill an
    // arbitrary/expensive model), just a choice between the two this app
    // actually uses: full-price Sonnet for the creative question-writing
    // call, and cheaper Haiku for the simple pass/fail validation calls
    // (moderation/theme/quality/balance) that make up the majority of
    // requests per question generated.
    // "claude-sonnet-4-6" was a stale/invalid model string - not one of
    // Anthropic's actual current model IDs. Anthropic's API can silently
    // accept an unrecognised model alias and route it to a fallback/older
    // snapshot rather than hard-erroring, which would explain question
    // quality being noticeably weaker than expected from "the strong model"
    // despite no errors ever surfacing. Corrected to the real current model.
    const allowedModels = new Set(["claude-sonnet-5", "claude-haiku-4-5-20251001"]);
    const resolvedModel = typeof model === "string" && allowedModels.has(model) ? model : "claude-sonnet-5";
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

    const requestBody: Record<string, unknown> = {
      model: resolvedModel,
      max_tokens: tokenLimit,
      messages: [{ role: "user", content: prompt }],
    };
    if (structuredOutput === true) {
      requestBody.tools = [{
        name: "return_validation_result",
        description: "Return the final quiz validation decision as structured data. Always call this tool exactly once after evaluating the supplied question.",
        input_schema: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            note: { type: "string" },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            candidate_subtopic: { type: ["string", "null"] },
            candidate_entity: { type: ["string", "null"] },
            conflict_index: { type: ["integer", "null"] },
            rejection_reason: { type: "string" },
          },
          required: ["ok", "note"],
          additionalProperties: false,
        },
      }];
      requestBody.tool_choice = { type: "tool", name: "return_validation_result" };
    } else if (webSearch === true) {
      // Claude's server-side web search tool: Anthropic itself runs the
      // search and feeds the results back into the same request before the
      // model writes its final answer - we don't have to run a separate
      // search API or a manual tool-use loop, and the final text block still
      // comes back through the normal content array exactly like a
      // non-search response, so the existing text-extraction logic in
      // lib/quiz/generateRound.ts's callAPI() needs no changes to consume it.
      // Only used for the "recent entertainment news" / "celebrity and pop
      // culture moments" topics - every other topic still generates purely
      // from the model's own knowledge, which is faster and cheaper and
      // doesn't need grounding for evergreen trivia.
      requestBody.tools = [{
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 3,
      }];
    }

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(requestBody),
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
