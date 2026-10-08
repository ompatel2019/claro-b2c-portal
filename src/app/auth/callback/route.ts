import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/utils/supabase/server";

/** Email-confirmation link target: exchanges the PKCE code for a session. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.redirect(new URL("/sign-in", request.url));
}
