import { NextRequest, NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeRedirectPath(
    request.nextUrl.searchParams.get("next"),
    "/auth/update-password",
  );

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=invalid_recovery_link", request.url),
    );
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  const supabase = createSupabaseServerClient(request, response);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=expired_recovery_link", request.url),
    );
  }

  return response;
}
