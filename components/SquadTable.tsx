import Link from "next/link";
import type { MySquad } from "../lib/db/queries";
import { eur, eurFull, eurSigned, num } from "../lib/format";

/**
 * Eigener Kader als Liste mit allen erfassten Infos (Marktwert, Kaufpreis,
 * Transfergewinn, Punkte, Ø, Status). Server-Komponente.
 */
export default function SquadTable({ squad, leagueId }: { squad: MySquad; leagueId: string }) {
  const href = (base: string) => `${base}?league=${encodeURIComponent(leagueId)}`;
  if (squad.rows.length === 0) {
    return (
      <div className="notice">
        Kein Kader erfasst — beim nächsten Sammel-Lauf erscheint deine Aufstellung.
      </div>
    );
  }
  const statusLabel = (st: number | null) => (st == null || st === 0 ? "fit" : "angeschlagen");
  const col = (v: number) => (v >= 0 ? "var(--gain)" : "var(--loss)");
  // Prozent mit Vorzeichen, deutsches Dezimalkomma (z. B. „+1,3 %").
  const fmtPct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1).replace(".", ",")} %`;

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th className="l">Pos</th>
            <th className="l">Spieler</th>
            <th className="l">Team</th>
            <th className="l">Status</th>
            <th>Marktwert</th>
            <th title="Marktwert-Änderung von gestern auf heute (€ und %); darunter klein die Steigerung des Vortages (vorgestern → gestern).">
              Entwicklung seit gestern
            </th>
            <th>Kaufpreis</th>
            <th>Gewinn</th>
            <th>Punkte</th>
            <th>Ø</th>
          </tr>
        </thead>
        <tbody>
          {squad.rows.map((p) => (
            <tr key={p.playerId}>
              <td className="l muted">{p.position ?? "—"}</td>
              <td className="l">
                <Link href={href(`/player/${p.playerId}`)} className="linklike">
                  {p.name}
                </Link>
              </td>
              <td className="l muted">{p.team ?? "—"}</td>
              <td className="l">
                <span style={{ color: p.status && p.status > 0 ? "var(--warn)" : "var(--mute)" }}>
                  {statusLabel(p.status)}
                </span>
              </td>
              <td title={eurFull(p.marketValue)}>{eur(p.marketValue)}</td>
              <td>
                {p.mvChangeDay == null ? (
                  "—"
                ) : (
                  <>
                    <span style={{ color: col(p.mvChangeDay) }} title={eurFull(p.mvChangeDay)}>
                      {eurSigned(p.mvChangeDay)}
                      {p.mvChangeDayPct != null && ` (${fmtPct(p.mvChangeDayPct)})`}
                    </span>
                    {p.mvChangePrev != null && (
                      <div style={{ fontSize: 11, marginTop: 2, color: "var(--mute)" }}>
                        vorgestern{" "}
                        <span style={{ color: col(p.mvChangePrev) }} title={eurFull(p.mvChangePrev)}>
                          {eurSigned(p.mvChangePrev)}
                          {p.mvChangePrevPct != null && ` (${fmtPct(p.mvChangePrevPct)})`}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </td>
              <td title={eurFull(p.buyPrice)}>{p.buyPrice != null ? eur(p.buyPrice) : "—"}</td>
              <td
                style={{
                  color: p.profit == null ? undefined : p.profit >= 0 ? "var(--gain)" : "var(--loss)",
                }}
                title={p.profit != null ? eurFull(p.profit) : undefined}
              >
                {p.profit != null ? eurSigned(p.profit) : "—"}
              </td>
              <td>{num(p.points)}</td>
              <td className="muted">{num(p.avgPoints)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="l" colSpan={4}>
              <strong>Summe · {squad.rows.length} Spieler</strong>
            </td>
            <td title={eurFull(squad.teamValue)}>
              <strong>{eur(squad.teamValue)}</strong>
            </td>
            <td />
            <td />
            <td
              style={{ color: squad.totalProfit >= 0 ? "var(--gain)" : "var(--loss)" }}
              title={eurFull(squad.totalProfit)}
            >
              <strong>{eurSigned(squad.totalProfit)}</strong>
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
