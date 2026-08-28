"use client";

import { useRef, useState } from "react";
import ManagerTable from "./ManagerTable";
import ManagerPanel from "./ManagerPanel";
import { loadManagerPanel, type ManagerPanelData } from "../app/manager/panelAction";
import type { ManagerTableRow } from "../lib/db/queries";

/**
 * Dashboard-Explorer: Manager-Tabelle links, Detailpanel rechts DANEBEN (kein
 * Overlay). Eine Zeile wird aktiviert (Klick oder Pfeil hoch/runter); das Panel
 * rechts aktualisiert sich auf den jeweiligen Manager. Kennzahlen sofort aus der
 * Zeile, Kader/Transfers werden nachgeladen.
 */
export default function ManagerExplorer(props: {
  rows: ManagerTableRow[];
  showMoney: boolean;
  leagueId: string;
  title?: string;
  info?: string;
  note?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<ManagerPanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);

  const select = (id: string) => {
    setSelectedId(id);
    setData(null);
    setLoading(true);
    const seq = ++reqRef.current;
    void loadManagerPanel(props.leagueId, id)
      .then((d) => {
        if (reqRef.current !== seq) return; // veraltete Antwort verwerfen
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        if (reqRef.current === seq) setLoading(false);
      });
  };

  const selRow = selectedId ? props.rows.find((r) => r.id === selectedId) ?? null : null;

  return (
    <div className={`mgr-explorer ${selectedId ? "open" : ""}`}>
      <div className="mgr-explorer-main">
        <ManagerTable
          rows={props.rows}
          showMoney={props.showMoney}
          leagueId={props.leagueId}
          title={props.title}
          info={props.info}
          note={props.note}
          selectedId={selectedId}
          onSelect={select}
        />
      </div>
      {selectedId && (
        <aside className="mgr-explorer-side">
          <ManagerPanel
            row={selRow}
            data={data}
            loading={loading}
            leagueId={props.leagueId}
            onClose={() => setSelectedId(null)}
          />
        </aside>
      )}
    </div>
  );
}
