import { NextRequest, NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const next = safeRedirectPath(
    request.nextUrl.searchParams.get("next"),
    "/auth/update-password",
  );

  const isTokenHashRecovery = Boolean(tokenHash) && type === "recovery";
  if (!code && !isTokenHashRecovery) {
    return NextResponse.redirect(
      new URL("/login?error=invalid_recovery_link", request.url),
    );
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  const supabase = createSupabaseServerClient(request, response);
  const { error } = isTokenHashRecovery
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: "recovery" })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (error) {
    const recoveryError =
      error.code === "pkce_code_verifier_not_found"
        ? "missing_pkce_state"
        : "expired_recovery_link";
    return NextResponse.redirect(
      new URL(`/login?error=${recoveryError}`, request.url),
    );
  }

  return response;
}
