import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function middleware(req: NextRequest) {
  // Only guard host pages. Player join pages and the homepage stay public.
  if (!req.nextUrl.pathname.startsWith("/host")) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createSupabaseServerClient(req, res);

  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirectTo", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: ["/host/:path*"],
};
