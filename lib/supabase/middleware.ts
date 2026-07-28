import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Erneuert die Supabase-Auth-Session (Cookie-Refresh) UND schützt die App
 * (Phase 2): unangemeldete Besucher werden auf /login umgeleitet. Ausgenommen
 * sind öffentliche Pfade — /login, /auth/* (Magic-Link-Callback/Logout) und
 * /api/* (die per CRON_SECRET geschützt sind, nicht per Nutzer-Session).
 */
function isPublicPath(path: string): boolean {
  return path === "/login" || path.startsWith("/auth") || path.startsWith("/api");
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Wichtig: getUser() aufrufen, damit Supabase den Token ggf. erneuert.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
