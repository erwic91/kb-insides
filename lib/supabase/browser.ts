import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase-Client fürs Browser (Auth-Session in Cookies). Nutzt die
 * öffentlichen NEXT_PUBLIC_-Variablen (anon/publishable Key ist safe im Client).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
