import { getServiceClient } from "./client";
import { createSupabaseServerClient } from "../supabase/server";

/**
 * Manuelle Kontostand-Korrekturen je Manager (Admin-Strafen/-Boni). Lesen läuft
 * RLS-gebunden (nur eigene Ligen sichtbar); Schreiben server-seitig über den
 * Service-Client nach Zugriffsprüfung (siehe manager-actions). Signierter Betrag:
 * negativ = Strafe, positiv = Bonus.
 */

export interface Adjustment {
  id: string;
  leagueId: string;
  managerId: string;
  amount: number;
  note: string | null;
  createdAt: string;
}

async function readClient() {
  try {
    return await createSupabaseServerClient();
  } catch {
    return null;
  }
}

/** Summe der Korrekturen je Manager (für die Rekonstruktion). RLS-gebunden. */
export async function getAdjustmentSums(leagueId: string): Promise<Map<string, number>> {
  const supabase = await readClient();
  const out = new Map<string, number>();
  if (!supabase) return out;
  const { data } = await supabase
    .from("manager_adjustments")
    .select("manager_id, amount")
    .eq("league_id", leagueId);
  for (const r of data ?? []) {
    const mid = r.manager_id as string;
    out.set(mid, (out.get(mid) ?? 0) + ((r.amount as number) ?? 0));
  }
  return out;
}

/** Einzelne Korrekturen eines Managers (für die Detailseite). RLS-gebunden. */
export async function getAdjustments(leagueId: string, managerId: string): Promise<Adjustment[]> {
  const supabase = await readClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("manager_adjustments")
    .select("id, league_id, manager_id, amount, note, created_at")
    .eq("league_id", leagueId)
    .eq("manager_id", managerId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    leagueId: r.league_id as string,
    managerId: r.manager_id as string,
    amount: (r.amount as number) ?? 0,
    note: (r.note as string) ?? null,
    createdAt: r.created_at as string,
  }));
}

/** Neue Korrektur anlegen (Service-Client; Zugriffsprüfung erfolgt im Aufrufer). */
export async function addAdjustment(args: {
  leagueId: string;
  managerId: string;
  amount: number;
  note: string | null;
  userId: string;
}): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.from("manager_adjustments").insert({
    league_id: args.leagueId,
    manager_id: args.managerId,
    amount: args.amount,
    note: args.note,
    created_by: args.userId,
  });
  if (error) throw new Error(`Korrektur anlegen fehlgeschlagen: ${error.message}`);
}

/** Korrektur löschen (nur innerhalb der angegebenen Liga). Service-Client. */
export async function deleteAdjustment(id: string, leagueId: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("manager_adjustments")
    .delete()
    .eq("id", id)
    .eq("league_id", leagueId);
  if (error) throw new Error(`Korrektur löschen fehlgeschlagen: ${error.message}`);
}
