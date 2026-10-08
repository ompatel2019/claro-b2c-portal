import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { clientEnv } from "@/env/client";

const PUBLIC_PAGES = ["/sign-in", "/sign-up", "/auth/callback"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the auth token. Do not add logic between createServerClient
  // and getClaims() — it can cause intermittent auth bugs.
  const { data } = await supabase.auth.getClaims();

  const path = request.nextUrl.pathname;
  const signedIn = Boolean(data?.claims.sub);
  const isPublic = PUBLIC_PAGES.includes(path);
  if (
    path.startsWith("/api/") ||
    signedIn === !isPublic ||
    path === "/auth/callback"
  ) {
    return supabaseResponse;
  }
  const redirect = NextResponse.redirect(
    new URL(signedIn ? "/" : "/sign-in", request.url),
  );
  supabaseResponse.cookies
    .getAll()
    .forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
