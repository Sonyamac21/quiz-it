import { NextRequest, NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { response, user } = await refreshSupabaseSession(request);

  if (!user) {
    const destination = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", safeRedirectPath(destination));
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/host/:path*"],
};
