"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/supabase/server";
import { isAdminEmail, setUserMaxLeagues, premiumMaxLeagues } from "../../lib/db/admin";

/**
 * Rolle eines Nutzers setzen (Free/Premium). Server-seitiger Admin-Check —
 * die Seite blendet die Aktion zwar nur für Admins ein, aber die Action prüft
 * unabhängig davon erneut (nie dem UI-Gate allein vertrauen).
 */
export async function setUserRole(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/");

  const userId = String(formData.get("userId") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (!userId) redirect("/admin");

  await setUserMaxLeagues(userId, role === "premium" ? premiumMaxLeagues() : 1);
  redirect("/admin?ok=1");
}
