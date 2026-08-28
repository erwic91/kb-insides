"use client";

import Link from "next/link";
import type { PlayerCard as CardData } from "../lib/db/queries";
import { eur, eurFull, eurSigned, num, pct, date } from "../lib/format";
import PlayerMvChart from "./PlayerMvChart";
import LineupProbIcon from "./LineupProbIcon";

const PROB_LABEL: Record<number, string> = {
  1: "Startelf sicher",
  2: "wahrscheinlich",
  3: "fraglich",
  4: "unwahrscheinlich",
  5: "spielt nicht",
};

function leagueHref(base: string, leagueId: string): string {
  return `${base}?league=${encodeURIComponent(leagueId)}`;
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "up" | "down" | "warn" | null;
}) {
  const color =
    tone === "up" ? "var(--gain)" : tone === "down" ? "var(--loss)" : tone === "warn" ? "var(--signal)" : undefined;
  return (
    <div className="pc-tile">
      <div className="pc-tile-val" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="pc-tile-lbl">{label}</div>
      {hint && <div className="pc-tile-hint">{hint}</div>}
    </div>
  );
}

const signedPct = (x: number | null) =>
  x == null ? "—" : `${x >= 0 ? "+" : "−"}${(Math.abs(x) * 100).toFixed(1)} %`;

/**
 * Reiche Spielerkarte (Base-XI-inspiriert) — nur aus vorhandenen Daten:
 * Marktwert & Trends, Fair-Value-Schätzung, Marktwertverlauf mit Zeitfenstern,
 * tägliche Änderungen, Punkte/Effizienz, Besitzer & Transferhistorie.
 */
export default function PlayerCard({ data, leagueId }: { data: CardData; leagueId: string }) {
  const injured = data.status != null && data.status > 0;

  return (
    <div className="pc">
      {/* Kopf */}
      <div className="pc-head">
        <div>
          <h2 className="pc-name">{data.name}</h2>
          <div className="pc-sub">
            {[data.position, data.team ? `Team ${data.team}` : null].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {data.prob != null && PROB_LABEL[data.prob] && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--mute)" }}>
              <LineupProbIcon prob={data.prob} />
              {PROB_LABEL[data.prob]}
            </span>
          )}
          {injured && <span className="pc-status">{data.statusLabel}</span>}
        </div>
      </div>

      {data.injury && (
        <div className="pc-injury">
          ⚠ {data.injury.type ?? "Ausfall"}
          {data.injury.reason ? ` — ${data.injury.reason}` : ""}
        </div>
      )}

      {/* Kennzahlen */}
      <div className="pc-tiles">
        <Tile label="Marktwert" value={eur(data.latestMv)} hint={eurFull(data.latestMv)} />
        <Tile label="Ø Punkte" value={data.avgPoints != null ? num(data.avgPoints) : "—"} />
        <Tile label="Gesamtpunkte" value={data.points != null ? num(data.points) : "—"} />
        <Tile
          label="Punkte / Mio"
          value={data.pointsPerMillion != null ? data.pointsPerMillion.toFixed(1) : "—"}
        />
        <Tile
          label="Trend 24 h"
          value={data.trend24h != null ? eurSigned(data.trend24h) : "—"}
          tone={data.trend24h == null ? null : data.trend24h >= 0 ? "up" : "down"}
        />
        <Tile
          label="Trend 1 Woche"
          value={data.trend7d != null ? eurSigned(data.trend7d) : "—"}
          tone={data.trend7d == null ? null : data.trend7d >= 0 ? "up" : "down"}
        />
      </div>

      {/* Fair Value */}
      {data.fairValue != null && (
        <div className="pc-fair">
          <div>
            <div className="pc-fair-lbl">
              Fair Value <span className="pc-est">Schätzung</span>
            </div>
            <div className="pc-fair-val">{eur(data.fairValue)}</div>
          </div>
          {data.fairValueDelta != null && (
            <div
              className="pc-fair-delta"
              style={{ color: data.fairValueDelta >= 0 ? "var(--gain)" : "var(--loss)" }}
              title="Fair Value − aktueller Marktwert. Positiv = unterbewertet."
            >
              {eurSigned(data.fairValueDelta)}
              <span className="pc-fair-tag">
                {data.fairValueDelta >= 0 ? "unterbewertet" : "überbewertet"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Marktwertverlauf */}
      <section className="pc-section">
        <p className="pc-section-title">Marktwertverlauf</p>
        <PlayerMvChart curve={data.curve} />
      </section>

      <div className="pc-cols">
        {/* Letzte Änderungen */}
        <section className="pc-section">
          <p className="pc-section-title">Letzte Änderungen</p>
          {data.dailyChanges.length === 0 ? (
            <p className="note">Noch keine täglichen Änderungen erfasst.</p>
          ) : (
            <ul className="pc-changes">
              {data.dailyChanges.map((c) => (
                <li key={c.date}>
                  <span className="muted">{date(c.date)}</span>
                  <span style={{ color: c.delta >= 0 ? "var(--gain)" : "var(--loss)" }}>
                    {eurSigned(c.delta)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Besitz */}
        <section className="pc-section">
          <p className="pc-section-title">Besitz</p>
          <div className="pc-owner">
            <div className="pc-kv">
              <span className="muted">Im Kader von</span>
              <span>
                {data.holder ? (
                  <Link
                    href={leagueHref(`/manager/${data.holder.managerId}`, leagueId)}
                    className="linklike"
                  >
                    {data.holder.managerName}
                  </Link>
                ) : (
                  "frei / Markt"
                )}
              </span>
            </div>
            {data.buyPrice != null && (
              <div className="pc-kv">
                <span className="muted">Kaufpreis</span>
                <span>{eur(data.buyPrice)}</span>
              </div>
            )}
            {data.profit != null && (
              <div className="pc-kv">
                <span className="muted">Buchgewinn</span>
                <span style={{ color: data.profit >= 0 ? "var(--gain)" : "var(--loss)" }}>
                  {eurSigned(data.profit)}
                </span>
              </div>
            )}
            <div className="pc-kv">
              <span className="muted">Transfers (Liga)</span>
              <span>{data.transferCount}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Bietrechner: wer könnte mitbieten */}
      {data.bidders.length > 0 && data.latestMv != null && (
        <section className="pc-section">
          <p className="pc-section-title">
            Wer kann mitbieten? · {data.bidders.filter((b) => b.canAfford).length} von {data.bidders.length}
          </p>
          <ul className="pc-bidders">
            {data.bidders.slice(0, 8).map((b) => (
              <li key={b.managerId}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: b.canAfford ? "var(--gain)" : "var(--mute)" }}>
                    {b.canAfford ? "✓" : "✕"}
                  </span>
                  <Link href={leagueHref(`/manager/${b.managerId}`, leagueId)} className="linklike">
                    {b.managerName}
                  </Link>
                </span>
                <span className="num" style={{ color: b.canAfford ? "var(--ink)" : "var(--mute)" }}>
                  {eur(b.maxBid)}
                </span>
              </li>
            ))}
          </ul>
          <p className="note" style={{ marginTop: 6, color: "var(--mute)" }}>
            Max-Gebot ≥ aktueller Marktwert ({eur(data.latestMv)}) = kann diesen Spieler ohne
            vorherigen Verkauf holen.
          </p>
        </section>
      )}

      {/* Transferhistorie */}
      {data.transfers.length > 0 && (
        <section className="pc-section">
          <p className="pc-section-title">Ligaweite Besitzhistorie</p>
          <div className="pc-tbl-wrap">
            <table className="pc-tbl">
              <thead>
                <tr>
                  <th className="l">Datum</th>
                  <th className="l">Manager</th>
                  <th className="l">Richtung</th>
                  <th className="r">Preis</th>
                </tr>
              </thead>
              <tbody>
                {data.transfers.map((t, i) => (
                  <tr key={`${t.managerId}-${t.ts}-${i}`}>
                    <td className="l muted">{date(t.ts)}</td>
                    <td className="l">
                      {t.managerId ? (
                        <Link href={leagueHref(`/manager/${t.managerId}`, leagueId)} className="linklike">
                          {t.managerName}
                        </Link>
                      ) : (
                        t.managerName
                      )}
                    </td>
                    <td className="l">{t.direction === "buy" ? "Kauf" : "Verkauf"}</td>
                    <td className="r">{eurFull(t.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="pc-foot muted">
        Fair Value ist eine transparente Ligamonitor-Schätzung (Ø Punkte × Liga-Median MV/Punkt),
        kein offizieller Kickbase-Wert.
      </p>
    </div>
  );
}
