import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service-role key.
 *
 * The service-role key bypasses RLS. It MUST NEVER be imported into any
 * client component or shipped to the browser. Every table has RLS enabled
 * with no public policies (see migration 0001), so all data access happens
 * exclusively through this server-side client.
 */
let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  // Harter Schutz: der Service-Role-Key darf nie im Browser laufen. Sollte diese
  // Datei je versehentlich in ein Client-Bundle geraten, schlägt es hier fehl.
  if (typeof window !== "undefined") {
    throw new Error("getServiceClient() ist server-only und darf nicht im Browser laufen.");
  }
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.",
    );
  }

  cached = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cached;
}
