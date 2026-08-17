import { getServiceClient } from "./client";

/**
 * Schreibzugriff auf `hidden_managers` (PRO LIGA). Lesen läuft über den
 * RLS-Client in queries.ts; hier nur Setzen/Entfernen über den Service-Role-
 * Client (nach Auth-Check in der Server-Action). Ausblenden gilt nur für die
 * angegebene Liga — dieselbe Person kann in einer anderen Liga sichtbar bleiben.
 */
export async function setManagerHidden(
  leagueId: string,
  managerId: string,
  hidden: boolean,
  note: string | null = null,
): Promise<void> {
  const supabase = getServiceClient();
  if (hidden) {
    const { error } = await supabase
      .from("hidden_managers")
      .upsert({ league_id: leagueId, manager_id: managerId, note }, { onConflict: "league_id,manager_id" });
    if (error) throw new Error(`Manager ausblenden fehlgeschlagen: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("hidden_managers")
      .delete()
      .eq("league_id", leagueId)
      .eq("manager_id", managerId);
    if (error) throw new Error(`Manager einblenden fehlgeschlagen: ${error.message}`);
  }
}
