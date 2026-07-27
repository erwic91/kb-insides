"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { LeagueLite } from "../lib/db/queries";

/**
 * Globaler Liga-Switch (SPEC §9): wählt die aktive Liga. Beim Umschalten immer
 * zurück aufs Dashboard der neuen Liga (IDs sind ligaspezifisch, dürfen nicht
 * über Ligagrenzen mitgenommen werden).
 */
export default function LeagueSwitch({
  leagues,
  defaultId,
}: {
  leagues: Pick<LeagueLite, "id" | "name">[];
  defaultId?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get("league") ?? defaultId ?? leagues[0]?.id ?? "";

  if (leagues.length === 0) return null;

  return (
    <div className="league-switch">
      <select
        value={active}
        onChange={(e) => router.push(`/?league=${encodeURIComponent(e.target.value)}`)}
        aria-label="Liga wählen"
      >
        {leagues.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}
