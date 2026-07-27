"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { LeagueLite } from "../lib/db/queries";

/**
 * Globaler Liga-Switch (SPEC §9) als Segment-Buttons. Beim Umschalten immer
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

  const switchTo = (id: string) => {
    if (id === active) return;
    router.push(`/?league=${encodeURIComponent(id)}`);
    // Router-Cache umgehen: sonst zeigt der gleiche Pfad (nur anderer
    // ?league-Param) teils noch die Daten der vorherigen Liga.
    router.refresh();
  };

  return (
    <div className="seg" role="group" aria-label="Liga wählen">
      {leagues.map((l) => (
        <button
          key={l.id}
          className={l.id === active ? "on" : ""}
          aria-pressed={l.id === active}
          onClick={() => switchTo(l.id)}
        >
          {l.name}
        </button>
      ))}
    </div>
  );
}
