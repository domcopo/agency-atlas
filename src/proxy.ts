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
  const onLogin = request.nextUrl.pathname === "/login";

  if (!signedIn && !onLogin) return NextResponse.redirect(new URL("/login", request.url));
  if (signedIn && onLogin) return NextResponse.redirect(new URL("/", request.url));
  return response;
}

export const config = {
  // Everything except Next's own files and icons.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
