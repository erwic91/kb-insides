import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Erneuert die Supabase-Auth-Session bei jedem Request (Cookie-Refresh).
 *
 * BEWUSST NICHT-BLOCKIEREND (Phase 1): unangemeldete Besucher werden NICHT
 * umgeleitet — das bestehende Single-User-Dashboard (Service-Client) bleibt
 * erreichbar, bis in Phase 2 der Lesepfad auf RLS umgestellt ist. Der
 * Route-Schutz wird dort ergänzt.
 */
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
  await supabase.auth.getUser();
  return response;
}
