import { getServiceClient } from "./client";
import { seal, open } from "../security/crypto";
import {
  decideAddLeague,
  decideRemoveLeague,
  type AddDecision,
  type RemoveDecision,
} from "../compute/leagueBinding";
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

export interface UserLeague {
  leagueId: string;
  activatedAt: string | null;
}

/** Aktive Ligen eines Nutzers (league_access). */
export async function getUserLeagues(userId: string): Promise<UserLeague[]> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("league_access")
    .select("league_id, activated_at")
    .eq("user_id", userId)
    .order("activated_at", { ascending: true });
  return (data ?? []).map((r) => ({
    leagueId: r.league_id as string,
    activatedAt: (r.activated_at as string) ?? null,
  }));
}

/** Liga-Limit des Nutzers (profiles.max_leagues; Standard 1 = free). */
export async function getMaxLeagues(userId: string): Promise<number> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("profiles")
    .select("max_leagues")
    .eq("user_id", userId)
    .maybeSingle();
  const n = data?.max_leagues as number | undefined;
  return n && n > 0 ? n : 1;
}

/**
 * Aktiviert (fügt hinzu) `leagueId` für den Nutzer — bis zum Liga-Limit.
 * Bereits aktiv → No-op. Limit erreicht → Ablehnung (erst eine Liga entfernen).
 * Setzt zusätzlich kb_connections.active_league_id auf die zuletzt aktivierte
 * Liga (Kompatibilität/„primäre" Liga).
 */
export async function activateLeague(
  userId: string,
  args: { leagueId: string; kbManagerId: string; now?: number },
): Promise<AddDecision> {
  const supabase = getServiceClient();
  const now = args.now ?? Date.now();
  const nowIso = new Date(now).toISOString();

  const [leagues, maxLeagues] = await Promise.all([
    getUserLeagues(userId),
    getMaxLeagues(userId),
  ]);
  const decision = decideAddLeague({
    targetLeagueId: args.leagueId,
    activeLeagueIds: leagues.map((l) => l.leagueId),
    maxLeagues,
  });
  if (!decision.allowed) return decision;
  if (decision.kind === "present") return decision; // schon aktiv → nichts tun

  const { error: accErr } = await supabase.from("league_access").upsert(
    {
      user_id: userId,
      league_id: args.leagueId,
      kb_manager_id: args.kbManagerId,
      activated_at: nowIso,
    },
    { onConflict: "user_id,league_id" },
  );
  if (accErr) throw new Error(`league_access setzen fehlgeschlagen: ${accErr.message}`);

  await supabase
    .from("kb_connections")
    .update({ active_league_id: args.leagueId, league_activated_at: nowIso, updated_at: nowIso })
    .eq("user_id", userId);

  return decision;
}

/**
 * Entfernt eine aktive Liga — erst nach der 7-Tage-Sperre (Anti-Hopping).
 * Aktualisiert die „primäre" active_league_id auf eine verbleibende Liga.
 */
export async function deactivateLeague(
  userId: string,
  leagueId: string,
  now: number = Date.now(),
): Promise<RemoveDecision> {
  const supabase = getServiceClient();
  const leagues = await getUserLeagues(userId);
  const target = leagues.find((l) => l.leagueId === leagueId);
  if (!target) return { allowed: true }; // nicht aktiv → nichts zu tun

  const decision = decideRemoveLeague({ activatedAt: target.activatedAt, now });
  if (!decision.allowed) return decision;

  const { error } = await supabase
    .from("league_access")
    .delete()
    .eq("user_id", userId)
    .eq("league_id", leagueId);
  if (error) throw new Error(`Liga entfernen fehlgeschlagen: ${error.message}`);

  // Primäre Liga aktualisieren (irgendeine verbleibende, sonst null).
  const remaining = leagues.filter((l) => l.leagueId !== leagueId);
  await supabase
    .from("kb_connections")
    .update({ active_league_id: remaining[0]?.leagueId ?? null, updated_at: new Date(now).toISOString() })
    .eq("user_id", userId);

  return decision;
}

export interface CollectionTarget {
  userId: string;
  kbUserId: string;
  leagueId: string;
}

/**
 * Sammel-Ziele für den Collector: je (Nutzer, aktive Liga) ein Eintrag —
 * aus league_access, verknüpft mit aktiven Verbindungen. Service-Role.
 */
export async function getCollectionTargets(): Promise<CollectionTarget[]> {
  const supabase = getServiceClient();
  const { data: conns, error } = await supabase
    .from("kb_connections")
    .select("user_id, kb_user_id")
    .eq("status", "active");
  if (error) throw new Error(`Verbindungen laden fehlgeschlagen: ${error.message}`);
  const byUser = new Map<string, string>();
  for (const c of conns ?? []) byUser.set(c.user_id as string, c.kb_user_id as string);
  if (byUser.size === 0) return [];

  const { data: access } = await supabase
    .from("league_access")
    .select("user_id, league_id")
    .in("user_id", [...byUser.keys()]);
  const targets: CollectionTarget[] = [];
  for (const a of access ?? []) {
    const kbUserId = byUser.get(a.user_id as string);
    if (!kbUserId) continue;
    targets.push({
      userId: a.user_id as string,
      kbUserId,
      leagueId: a.league_id as string,
    });
  }
  return targets;
}

/** Schreibt den nutzer-privaten exakten Kontostand (aus /me/budget). */
export async function upsertUserBudget(
  userId: string,
  leagueId: string,
  day: number,
  cashActual: number | null,
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.from("user_budget").upsert(
    {
      user_id: userId,
      league_id: leagueId,
      day,
      cash_actual: cashActual,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,league_id,day" },
  );
  if (error) throw new Error(`user_budget schreiben fehlgeschlagen: ${error.message}`);
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
