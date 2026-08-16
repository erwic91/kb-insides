import { getServiceClient } from "./client";
import { optionalEnv } from "../env";

/**
 * Admin-Funktionen (Rollenverwaltung). Zugriff ist auf die in ADMIN_EMAILS
 * gelisteten Adressen beschränkt (Default: hello@ericwicker.de). Alle Lese-/
 * Schreibzugriffe laufen über den Service-Role-Client — Aufrufer MÜSSEN vorher
 * isAdminEmail() gegen den eingeloggten Nutzer prüfen.
 */

const DEFAULT_ADMIN = "hello@ericwicker.de";
const PREMIUM_MAX_LEAGUES = 10;

export function adminEmails(): string[] {
  const raw = optionalEnv("ADMIN_EMAILS") ?? DEFAULT_ADMIN;
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

/** Premium-Wert für die Rolle (max_leagues). Free = 1. */
export function premiumMaxLeagues(): number {
  return PREMIUM_MAX_LEAGUES;
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  maxLeagues: number;
  isPremium: boolean;
  activeLeagues: number;
  connectionStatus: string | null;
  createdAt: string | null;
}

/** Alle Nutzer (auth.users) mit Rolle, aktiven Ligen und Verbindungsstatus. */
export async function listUsersForAdmin(): Promise<AdminUserRow[]> {
  const supabase = getServiceClient();
  const { data: list, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Nutzerliste laden fehlgeschlagen: ${error.message}`);
  const users = list.users;
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return [];

  const [profRes, accessRes, connRes] = await Promise.all([
    supabase.from("profiles").select("user_id, max_leagues").in("user_id", ids),
    supabase.from("league_access").select("user_id").in("user_id", ids),
    supabase.from("kb_connections").select("user_id, status").in("user_id", ids),
  ]);

  const maxByUser = new Map<string, number>();
  for (const p of profRes.data ?? []) maxByUser.set(p.user_id as string, (p.max_leagues as number) ?? 1);
  const accessCount = new Map<string, number>();
  for (const a of accessRes.data ?? []) {
    const uid = a.user_id as string;
    accessCount.set(uid, (accessCount.get(uid) ?? 0) + 1);
  }
  const statusByUser = new Map<string, string>();
  for (const c of connRes.data ?? []) statusByUser.set(c.user_id as string, c.status as string);

  return users
    .map((u) => {
      const maxLeagues = maxByUser.get(u.id) ?? 1;
      return {
        id: u.id,
        email: u.email ?? null,
        maxLeagues,
        isPremium: maxLeagues > 1,
        activeLeagues: accessCount.get(u.id) ?? 0,
        connectionStatus: statusByUser.get(u.id) ?? null,
        createdAt: u.created_at ?? null,
      };
    })
    .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
}

/** Setzt die Rolle eines Nutzers (max_leagues) — legt die profiles-Zeile bei Bedarf an. */
export async function setUserMaxLeagues(userId: string, maxLeagues: number): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, max_leagues: maxLeagues }, { onConflict: "user_id" });
  if (error) throw new Error(`Rolle setzen fehlgeschlagen: ${error.message}`);
}
