"use client";

import { useState } from "react";
import Link from "next/link";
import type { MySquad } from "../lib/db/queries";
import { eur, eurFull, eurSigned, num } from "../lib/format";

/**
 * Kader eines Managers als Liste mit allen erfassten Infos (Marktwert, Kaufpreis,
 * Transfergewinn, Punkte, Ø, Status). Zusätzlich Bulk-Select über Checkboxen
 * links: die Summe der Marktwerte (= Verkaufswert) der markierten Spieler wird in
 * einer Toast-Leiste unten angezeigt, inkl. „Konto nach Verkauf" (Kontostand +
 * Verkaufswert) — praktisch, um zu sehen, welche Spieler ein Manager im Minus
 * verkaufen müsste, um ins Plus zu kommen.
 */
export default function SquadTable({
  squad,
  leagueId,
  cash,
}: {
  squad: MySquad;
  leagueId: string;
  /** Kontostand des Managers (exakt oder rekonstruiert) — für „Konto nach Verkauf". */
  cash?: number | null;
}) {
  const href = (base: string) => `${base}?league=${encodeURIComponent(leagueId)}`;
  const [sel, setSel] = useState<Set<string>>(new Set());

  if (squad.rows.length === 0) {
    return (
      <div className="notice">
        Kein Kader erfasst — beim nächsten Sammel-Lauf erscheint deine Aufstellung.
      </div>
    );
  }

  const statusLabel = (st: number | null) => (st == null || st === 0 ? "fit" : "angeschlagen");
  const col = (v: number) => (v >= 0 ? "var(--gain)" : "var(--loss)");
  const fmtPct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1).replace(".", ",")} %`;

  const toggle = (pid: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  const allSelected = sel.size === squad.rows.length && squad.rows.length > 0;
  const toggleAll = () =>
    setSel(() => (allSelected ? new Set() : new Set(squad.rows.map((p) => p.playerId))));
  const clear = () => setSel(new Set());

  const selRows = squad.rows.filter((p) => sel.has(p.playerId));
  const sumMv = selRows.reduce((s, p) => s + (p.marketValue ?? 0), 0);
  const cashKnown = cash != null;
  const after = cashKnown ? (cash as number) + sumMv : null;
  // Hellere Ampelfarben für die dunkle Toast-Leiste (das Standard-Grün/-Rot ist
  // auf hellen Flächen abgestimmt und auf Dunkel zu kontrastarm).
  const GREEN = "#3ddc97";
  const RED = "#ff6b8a";

  return (
    <div className="table-wrap">
      <table className="data squad-sel">
        <thead>
          <tr>
            <th className="l chk">
              <input
                type="checkbox"
                aria-label="Alle auswählen"
                checked={allSelected}
                onChange={toggleAll}
              />
            </th>
            <th className="l">Pos</th>
            <th className="l">Spieler</th>
            <th className="l">Team</th>
            <th className="l">Status</th>
            <th>Marktwert</th>
            <th title="Momentum der Marktwert-Steigerung. € = Änderung von gestern auf heute. Orange, wenn diese Steigerung KLEINER ist als die vorgestrige (Anstieg lässt nach = Warnsignal); grün, wenn gleich groß oder größer (Anstieg hält/beschleunigt). Die % in Klammern = um wie viel die gestrige Steigerung gegenüber der vorgestrigen zu- oder abgenommen hat. Darunter klein: die vorgestrige Steigerung als Vergleichswert.">
              Entwicklung seit gestern
            </th>
            <th>Kaufpreis</th>
            <th>Gewinn</th>
            <th>Punkte</th>
            <th>Ø</th>
          </tr>
        </thead>
        <tbody>
          {squad.rows.map((p) => {
            const checked = sel.has(p.playerId);
            return (
              <tr key={p.playerId} className={checked ? "sel-on" : ""}>
                <td className="l chk">
                  <input
                    type="checkbox"
                    aria-label={`${p.name} auswählen`}
                    checked={checked}
                    onChange={() => toggle(p.playerId)}
                  />
                </td>
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
                      <span
                        style={{
                          color:
                            p.mvChangePrev != null
                              ? p.mvChangeDay < p.mvChangePrev
                                ? "var(--warn)"
                                : "var(--gain)"
                              : col(p.mvChangeDay),
                        }}
                        title={eurFull(p.mvChangeDay)}
                      >
                        {eurSigned(p.mvChangeDay)}
                        {p.mvChangeDay !== 0 &&
                          p.mvChangePrev != null &&
                          p.mvChangePrev !== 0 &&
                          ` (${fmtPct((p.mvChangeDay - p.mvChangePrev) / Math.abs(p.mvChangePrev))})`}
                      </span>
                      {p.mvChangePrev != null && (
                        <div style={{ fontSize: 11, marginTop: 2, color: "var(--mute)" }}>
                          vorgestern{" "}
                          <span title={eurFull(p.mvChangePrev)}>{eurSigned(p.mvChangePrev)}</span>
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
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="l" colSpan={5}>
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

      {sel.size > 0 && (
        <div className="sale-toast" role="status">
          <div className="sale-toast-in">
            <button className="sale-clear" onClick={clear} aria-label="Auswahl aufheben">
              ✕
            </button>
            <div className="sale-count">
              {sel.size} {sel.size === 1 ? "Spieler" : "Spieler"}
            </div>
            <div className="sale-block">
              <div className="sale-lbl">Verkaufswert</div>
              <div className="sale-val" title={eurFull(sumMv)}>
                {eur(sumMv)}
              </div>
            </div>
            {cashKnown && (
              <>
                <div className="sale-block">
                  <div className="sale-lbl">Konto jetzt</div>
                  <div
                    className="sale-val sm"
                    style={{ color: (cash as number) < 0 ? RED : "var(--chalk)" }}
                    title={eurFull(cash)}
                  >
                    {eur(cash)}
                  </div>
                </div>
                <div className="sale-arrow">→</div>
                <div className="sale-block">
                  <div className="sale-lbl">Konto nach Verkauf</div>
                  <div
                    className="sale-val"
                    style={{ color: (after as number) >= 0 ? GREEN : RED }}
                    title={eurFull(after)}
                  >
                    {eur(after)}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
