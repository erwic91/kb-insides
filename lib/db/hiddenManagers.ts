import { getServiceClient } from "./client";

/**
 * Schreibzugriff auf `hidden_managers` (global, liga-übergreifend). Lesen läuft
 * über den RLS-Client in queries.ts; hier nur Setzen/Entfernen über den
 * Service-Role-Client (nach Auth-Check in der Server-Action).
 */
export async function setManagerHidden(
  managerId: string,
  hidden: boolean,
  note: string | null = null,
): Promise<void> {
  const supabase = getServiceClient();
  if (hidden) {
    const { error } = await supabase
      .from("hidden_managers")
      .upsert({ manager_id: managerId, note }, { onConflict: "manager_id" });
    if (error) throw new Error(`Manager ausblenden fehlgeschlagen: ${error.message}`);
  } else {
    const { error } = await supabase.from("hidden_managers").delete().eq("manager_id", managerId);
    if (error) throw new Error(`Manager einblenden fehlgeschlagen: ${error.message}`);
  }
}
