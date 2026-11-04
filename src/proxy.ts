// Runs before every page. In database mode it refreshes the sign-in session and
// sends anyone not signed in to /login. This is only the first gate: every page
// and action checks again on the server, and the database's row-level security is
// the final word. In local mode (no Supabase settings) it does nothing.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { databaseSettings } from "@/lib/supabase/server";

export async function proxy(request: NextRequest) {
  const s = databaseSettings();
  if (!s) return NextResponse.next();

  let response = NextResponse.next({ request });
  const db = createServerClient(s.url, s.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet, headers) {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  // getClaims() checks the token's signature; it doesn't just trust the cookie.
  const { data } = await db.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  // "aal2" means this session passed two-factor; "aal1" means password only.
  const twoFactorDone = data?.claims?.aal === "aal2";
  const path = request.nextUrl.pathname;
  const onLogin = path === "/login";
  const onTwoFactor = path === "/mfa";

  if (!signedIn) return onLogin ? response : redirectTo("/login", request, response);
  if (!twoFactorDone) return onTwoFactor ? response : redirectTo("/mfa", request, response);
  if (onLogin || onTwoFactor) return redirectTo("/", request, response);
  return response;
}

/** Redirect while keeping any refreshed sign-in cookies. */
function redirectTo(path: string, request: NextRequest, from: NextResponse) {
  const to = NextResponse.redirect(new URL(path, request.url));
  for (const c of from.cookies.getAll()) to.cookies.set(c);
  return to;
}

export const config = {
  // Everything except Next's own files and icons.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
