import { getServiceClient } from "./client";

/** Kleiner Key/Value-Zugriff auf app_settings (Text-Werte). */

export async function getSetting(key: string): Promise<string | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  return (data.value as string) ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value }, { onConflict: "key" });
  if (error) throw new Error(`app_settings schreiben fehlgeschlagen: ${error.message}`);
}
