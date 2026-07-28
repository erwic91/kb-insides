import { getServiceClient } from "./client";
import { seal, open } from "../security/crypto";
import { decideActivation, type ActivationDecision } from "../compute/leagueBinding";
import type { KbTokens } from "../kickbase/auth";

/**
 * Server-seitiger Zugriff auf `kb_connections` / `league_access` /
 * `league_switch_lock` (Design §4/§7.5). Schreibt über den Service-Role-Client
 * (RLS-Bypass); Tokens werden ver-/entschlüsselt (crypto.ts). NIE im Browser.
 */

export interface ConnectionTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

export interface ConnectionState {
  kbUserId: string;
  status: string;
  activeLeagueId: string | null;
  leagueActivatedAt: string | null;
  expiresAt: string | null;
}

/** Speichert (oder aktualisiert) die Verbindung mit verschlüsselten Tokens. */
export async function storeConnection(userId: string, kbUserId: string, tokens: KbTokens): Promise<void> {
  const supabase = getServiceClient();
  const access = seal(tokens.accessToken);
  const refresh = tokens.refreshToken ? seal(tokens.refreshToken) : null;
  const { error } = await supabase.from("kb_connections").upsert(
    {
      user_id: userId,
      kb_user_id: kbUserId,
      access_token: access.ct,
      token_iv: access.iv,
      token_tag: access.tag,
      // Refresh-Token teilt sich IV/Tag NICHT — wir speichern das Access-IV/-Tag
      // und packen den Refresh separat als eigenständiges Sealed in ein JSON.
      refresh_token: refresh ? JSON.stringify(refresh) : null,
      expires_at: tokens.expiresAt,
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`kb_connections speichern fehlgeschlagen: ${error.message}`);
}

/** Aktualisiert nur die Tokens (nach Refresh), Status → active. */
export async function updateStoredTokens(userId: string, tokens: KbTokens): Promise<void> {
  const supabase = getServiceClient();
  const access = seal(tokens.accessToken);
  const refresh = tokens.refreshToken ? seal(tokens.refreshToken) : null;
  const { error } = await supabase
    .from("kb_connections")
    .update({
      access_token: access.ct,
      token_iv: access.iv,
      token_tag: access.tag,
      refresh_token: refresh ? JSON.stringify(refresh) : null,
      expires_at: tokens.expiresAt,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) throw new Error(`Tokens aktualisieren fehlgeschlagen: ${error.message}`);
}

/** Markiert eine Verbindung als reconnect-bedürftig (Refresh/Login gescheitert). */
export async function markNeedsReconnect(userId: string): Promise<void> {
  const supabase = getServiceClient();
  await supabase.from("kb_connections").update({ status: "needs_reconnect" }).eq("user_id", userId);
}

/** Entschlüsselte Tokens einer Verbindung (null, wenn keine Verbindung). */
export async function getDecryptedTokens(userId: string): Promise<ConnectionTokens | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("kb_connections")
    .select("access_token, refresh_token, token_iv, token_tag, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const accessToken = open({
    ct: data.access_token as string,
    iv: data.token_iv as string,
    tag: data.token_tag as string,
  });
  let refreshToken: string | null = null;
  if (data.refresh_token) {
    try {
      refreshToken = open(JSON.parse(data.refresh_token as string));
    } catch {
      refreshToken = null;
    }
  }
  return { accessToken, refreshToken, expiresAt: (data.expires_at as string) ?? null };
}

/** Zustand der Verbindung (für UI/Collector), ohne Tokens zu entschlüsseln. */
export async function getConnectionState(userId: string): Promise<ConnectionState | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("kb_connections")
    .select("kb_user_id, status, active_league_id, league_activated_at, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    kbUserId: data.kb_user_id as string,
    status: data.status as string,
    activeLeagueId: (data.active_league_id as string) ?? null,
    leagueActivatedAt: (data.league_activated_at as string) ?? null,
    expiresAt: (data.expires_at as string) ?? null,
  };
}

interface SwitchLock {
  lastLeagueId: string | null;
  activatedAt: string | null;
}

async function getSwitchLock(userId: string): Promise<SwitchLock> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("league_switch_lock")
    .select("last_league_id, activated_at")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    lastLeagueId: (data?.last_league_id as string) ?? null,
    activatedAt: (data?.activated_at as string) ?? null,
  };
}

/**
 * Aktiviert `leagueId` für den Nutzer, sofern die 7-Tage-Wechselsperre es
 * zulässt. Bei Erlaubnis: kb_connections.active_league_id/league_activated_at
 * setzen, league_access (genau eine Zeile) ersetzen und league_switch_lock
 * fortschreiben. Gibt die Entscheidung zurück (auch die Ablehnung).
 */
export async function activateLeague(
  userId: string,
  args: { leagueId: string; kbManagerId: string; now?: number },
): Promise<ActivationDecision> {
  const supabase = getServiceClient();
  const now = args.now ?? Date.now();

  const [state, lock] = await Promise.all([getConnectionState(userId), getSwitchLock(userId)]);
  const decision = decideActivation({
    targetLeagueId: args.leagueId,
    currentLeagueId: state?.activeLeagueId ?? null,
    lockLeagueId: lock.lastLeagueId,
    lockActivatedAt: lock.activatedAt,
    now,
  });
  if (!decision.allowed) return decision;

  const nowIso = new Date(now).toISOString();
  // Bei „same" (Reconnect derselben Liga) die ursprüngliche Frist NICHT
  // zurücksetzen; nur bei first/switch neu stempeln.
  const stamp = decision.kind === "same" ? (lock.activatedAt ?? nowIso) : nowIso;

  const { error: connErr } = await supabase
    .from("kb_connections")
    .update({ active_league_id: args.leagueId, league_activated_at: stamp, updated_at: nowIso })
    .eq("user_id", userId);
  if (connErr) throw new Error(`Liga aktivieren fehlgeschlagen: ${connErr.message}`);

  // league_access: genau eine Zeile je Nutzer → alte entfernen, neue setzen.
  await supabase.from("league_access").delete().eq("user_id", userId);
  const { error: accErr } = await supabase.from("league_access").insert({
    user_id: userId,
    league_id: args.leagueId,
    kb_manager_id: args.kbManagerId,
  });
  if (accErr) throw new Error(`league_access setzen fehlgeschlagen: ${accErr.message}`);

  const { error: lockErr } = await supabase.from("league_switch_lock").upsert(
    { user_id: userId, last_league_id: args.leagueId, activated_at: stamp },
    { onConflict: "user_id" },
  );
  if (lockErr) throw new Error(`Sperr-Marker setzen fehlgeschlagen: ${lockErr.message}`);

  return decision;
}

/**
 * Trennt die Verbindung: kb_connections + league_access des Nutzers löschen.
 * league_switch_lock BLEIBT erhalten (Anti-Umgehung der 7-Tage-Sperre).
 */
export async function disconnect(userId: string): Promise<void> {
  const supabase = getServiceClient();
  await supabase.from("league_access").delete().eq("user_id", userId);
  const { error } = await supabase.from("kb_connections").delete().eq("user_id", userId);
  if (error) throw new Error(`Trennen fehlgeschlagen: ${error.message}`);
}
