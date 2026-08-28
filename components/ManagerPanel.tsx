"use client";

import Link from "next/link";
import type { ManagerTableRow } from "../lib/db/queries";
import type { ManagerPanelData } from "../app/manager/panelAction";
import { eur, eurFull, eurSigned, num, date } from "../lib/format";
import SquadTable from "./SquadTable";
import OffcanvasTabs from "./OffcanvasTabs";

/**
 * Dashboard-Seitenpanel (Explorer): Kennzahlen sofort aus der Tabellenzeile,
 * Handelsbilanz/Kader/Transfers werden nachgeladen (Skelett währenddessen).
 */
export default function ManagerPanel({
  row,
  data,
  loading,
  leagueId,
  onClose,
}: {
  row: ManagerTableRow | null;
  data: ManagerPanelData | null;
  loading: boolean;
  leagueId: string;
  onClose: () => void;
}) {
  if (!row) return null;
  const leagueHref = (base: string) => `${base}?league=${encodeURIComponent(leagueId)}`;
  const m = data?.detail ?? null;
  const squad = data?.squad ?? null;
  const net = m ? m.sold - m.bought : null;

  const kader =
    squad && squad.rows.length > 0 ? (
      <SquadTable squad={squad} leagueId={leagueId} cash={m?.cash ?? row.cash} />
    ) : loading ? (
      <div className="sk sk-line" style={{ height: 180, borderRadius: 10 }} />
    ) : (
      <div className="notice">Kein Kader erfasst.</div>
    );

  const history =
    m == null ? (
      <div className="sk sk-line" style={{ height: 120, borderRadius: 10 }} />
    ) : m.transfers.length === 0 ? (
      <div className="notice">Noch keine Transfers erfasst.</div>
    ) : (
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th className="l">Datum</th>
              <th className="l">Spieler</th>
              <th className="l">Richtung</th>
              <th>Preis</th>
            </tr>
          </thead>
          <tbody>
            {m.transfers.map((t) => (
              <tr key={t.id}>
                <td className="l muted">{date(t.ts)}</td>
                <td className="l">
                  <Link href={leagueHref(`/player/${t.playerId}`)} className="linklike">
                    {t.playerName}
                  </Link>
                </td>
                <td className="l">{t.direction === "buy" ? "Kauf" : "Verkauf"}</td>
                <td>{eurFull(t.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <div className="mgr-panel">
      <div className="mgr-panel-head">
        <div>
          <span className="eyebrow">Manager</span>
          <h3 className="mgr-panel-title">
            {row.name} {row.isMe && <span className="badge me">du</span>}
          </h3>
        </div>
        <button type="button" className="oc-close" aria-label="Schließen" onClick={onClose} style={{ position: "static" }}>
          ✕
        </button>
      </div>

      <div className="mgr-panel-body">
        <div className="mp-metrics">
          <div className="mp-metric">
            <span className="mp-m-lbl">Kaderwert</span>
            <span className="mp-m-val" title={eurFull(row.teamValue)}>{eur(row.teamValue)}</span>
          </div>
          <div className="mp-metric">
            <span className="mp-m-lbl">Punkte</span>
            <span className="mp-m-val">{num(row.points)}</span>
          </div>
          <div className="mp-metric">
            <span className="mp-m-lbl">Konto</span>
            <span className="mp-m-val" style={{ color: (row.cash ?? 0) < 0 ? "var(--loss)" : undefined }}>
              {eur(row.cash)}
            </span>
          </div>
          <div className="mp-metric">
            <span className="mp-m-lbl">Max-Gebot</span>
            <span className="mp-m-val">{eur(row.maxBid)}</span>
          </div>
          <div className="mp-metric">
            <span className="mp-m-lbl">Gesamt</span>
            <span className="mp-m-val" title={eurFull(row.total)}>{eur(row.total)}</span>
          </div>
        </div>

        {m && (
          <div className="note" style={{ margin: "2px 0 8px", color: "var(--mute)", fontSize: 11 }}>
            Käufe {eur(m.bought)} · Verkäufe {eur(m.sold)} · Netto {eurSigned(net ?? 0)}
          </div>
        )}

        <OffcanvasTabs
          tabs={[
            { key: "kader", label: `Kader${squad ? ` (${squad.rows.length})` : ""}`, content: kader },
            { key: "history", label: `Transfers${m ? ` (${m.transfers.length})` : ""}`, content: history },
          ]}
        />

        <div style={{ marginTop: 14 }}>
          <a href={leagueHref(`/manager/${row.id}`)} className="linklike">
            Ganze Detailseite öffnen (Korrekturen, Ein-/Ausblenden) →
          </a>
        </div>
      </div>
    </div>
  );
}
