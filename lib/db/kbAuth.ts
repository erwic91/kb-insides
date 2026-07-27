import { getServiceClient } from "./client";
import type { KbTokens } from "../kickbase/auth";

export interface StoredAuth {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
}

/** Liest die (einzige) kb_auth-Zeile. Null, wenn noch kein Login erfolgte. */
export async function loadAuth(): Promise<StoredAuth | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("kb_auth")
    .select("access_token, refresh_token, expires_at, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw new Error(`kb_auth lesen fehlgeschlagen: ${error.message}`);
  if (!data) return null;
  return {
    accessToken: data.access_token ?? null,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_at ?? null,
    updatedAt: data.updated_at ?? null,
  };
}

/** Persistiert Tokens in die kb_auth-Singleton-Zeile (Upsert auf id=1). */
export async function saveAuth(tokens: KbTokens): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.from("kb_auth").upsert(
    {
      id: 1,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`kb_auth schreiben fehlgeschlagen: ${error.message}`);
}
