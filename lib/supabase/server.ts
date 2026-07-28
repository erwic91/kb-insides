import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase-Client für Server-Komponenten / Route-Handler / Server-Actions.
 * Liest & schreibt die Auth-Session über die Next-Cookies. Für RLS-gebundene
 * Zugriffe (Phase 2) und um den eingeloggten Nutzer (`auth.getUser()`) zu
 * bestimmen. NICHT der Service-Role-Client — der bleibt in lib/db/client.ts.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // In Server-Komponenten ist set() nicht erlaubt — die Middleware
            // erneuert die Session. Hier bewusst ignorieren.
          }
        },
      },
    },
  );
}

/** Eingeloggten Nutzer bestimmen (oder null). */
export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
