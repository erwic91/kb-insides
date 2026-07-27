# Ligamonitor — Projekt-Spezifikation

Kontext-Dokument für den Bau mit Claude Code. In das Repo-Root legen (z. B. als `SPEC.md` oder `CLAUDE.md`), damit Claude Code das gesamte Design kennt.

---

## 1. Zweck

Ein Auswertungstool für eine Kickbase-Liga (klassischer/Seasonal-Modus). Ziel: **maximal viele Insights über die Mitmanager**, um bessere Transfer- und Gebotsentscheidungen zu treffen. Es ist ausdrücklich **kein** Analysetool für den eigenen Kader — der eigene Kader erscheint nur als kleines Handlungsbedarf-Modul.

Datenquelle: inoffizielle **Kickbase v4 API** (`https://api.kickbase.com`), dokumentiert unter kevinskyba/kickbase-api-doc. Unofficial, reverse-engineered — kann sich ändern, Zugänge können gesperrt werden. Entsprechend defensiv und sparsam pollen.

---

## 2. Kernentscheidungen (aus der Designphase)

- **Login-Blocker:** Der Account läuft über Apple-Login. `/v4/user/login` braucht E-Mail + Passwort. Diese müssen zuerst in der App gesetzt werden. Bis dahin: Entwicklung gegen Fixtures.
- **Liga ohne Auflaufprämie** (täglicher Login-Bonus deaktiviert). Dadurch ist die Kontorekonstruktion **exakt** — kein Schätzposten. Trotzdem als abschaltbare Option vorsehen (andere Ligen).
- **Startbudget 200 Mio., Manager starten mit 0 Spielern.** Lückenlose Kette ab Spieltag 1.
- **Architektur:** Collector (täglich) → SQLite (Zeitreihe) → `data.json` → statisches Frontend. Kein Live-Server für den MVP.
- **Mehrere Ligen:** Der Nutzer ist gleichzeitig in mehreren Ligen. Alle Daten sind ligagebunden (`league_id`). Ein globaler Liga-Switch im Frontend bestimmt die aktive Liga; jede Ansicht ist immer auf **genau eine** Liga bezogen.
- **Verifikationsprinzip:** Zahlen werden nie als „sicher" ausgegeben, ohne es zu sein. Pro Wert ein Status (siehe §8).

---

## 3. Architektur

```
[Collector (cron, täglich)]
   ├─ Auth: login + Token-Refresh (~7 Tage)
   ├─ Poll: /ranking, /market, /transfer, /squad, /me/budget, achievements
   ├─ Store: SQLite (Zeitreihe, append-only wo möglich)
   ├─ Compute: Rekonstruktion, Maximalgebot, Overpay, Marktprognose, Kalibrierung
   └─ Export: data.json
                 │
        [Frontend (statisch)] ── lädt data.json, rendert die 5 Seiten
```

Deployment-Vorschlag MVP: Collector als **GitHub Action** (scheduled, 1×/Tag), Ergebnis-`data.json` als Artefakt/Commit, Frontend auf GitHub Pages oder beliebigem Static-Host. Alternativ Raspberry Pi / kleiner VPS mit System-Cron.

---

## 4. Tech-Stack

- **Collector:** TypeScript + Node. HTTP mit `undici`/`fetch`. SQLite via `better-sqlite3`.
- **Frontend:** bestehende Vanilla-HTML/CSS/JS-Seiten (siehe Prototyp) — nur das Fake-Daten-Modul gegen einen `fetch('data.json')`-Loader tauschen. Später optional Port nach Vite/React.
- **Tests:** gegen committete Fixtures (echte, einmalig abgegriffene JSON-Antworten).

---

## 5. Datenmodell (SQLite)

```
leagues(id PK, name, start_budget, has_matchday_bonus BOOL, is_default BOOL)

players(id PK, name, team, position)   /* Spieler-Stammdaten liga-übergreifend */

managers(league_id, id, name, is_me BOOL, PRIMARY KEY(league_id, id))
  /* WICHTIG: Manager-IDs sind ligaspezifisch — derselbe Mensch hat je Liga eine andere id */

manager_snapshots(league_id, manager_id, day, ts, team_value, cash_reconstructed,
                  cash_actual /* nur is_me, aus /me/budget */,
                  points, streak, squad_size,
                  PRIMARY KEY(league_id, manager_id, day))

player_mv(league_id, player_id, day, ts, market_value,
          PRIMARY KEY(league_id, player_id, day))
  /* Marktwerte können je Wettbewerb identisch sein, werden aber pro Liga abgefragt/gehalten */

transfers(league_id, id, player_id, from_manager /* NULL = Markt */,
          to_manager /* NULL = Markt */, direction, day, ts, price,
          mv_at_time, PRIMARY KEY(league_id, id))

market_log(league_id, player_id, ts, day, on_market BOOL, expiry_ts, price,
           PRIMARY KEY(league_id, player_id, ts))

prizes(league_id, manager_id, day, amount, type)

app_settings(key PK, value)        /* global: aktive/zuletzt gewählte Liga, Bonus-Flag */
league_settings(league_id, key, value, PRIMARY KEY(league_id, key))  /* Favoriten, Kadenz je Liga */
calibration(league_id, day, my_reconstructed, my_actual, delta,
            PRIMARY KEY(league_id, day))
```

**Regel:** Jede Zeitreihen- und Transaktionszeile trägt `league_id` im Primärschlüssel. Kein Query ohne Liga-Scope. Manager- und Spieler-IDs niemals über Ligagrenzen hinweg wiederverwenden.

Zeitreihen (`*_snapshots`, `player_mv`, `market_log`) sind der eigentliche Schatz — je länger gesammelt, desto besser. Ab Tag 1 des Sammelns lückenlos.

---

## 6. Endpunkte & Polling-Plan

| Endpunkt | Frequenz | Liefert |
|---|---|---|
| `/v4/user/login` (+ refresh) | 1× / alle ~7 T | Token |
| `/v4/leagues/{lid}/overview` | 1× | Startbudget `b` |
| `/v4/leagues/{lid}/ranking?dayNumber=X` | täglich (+ Backfill aller ST einmalig) | pro Manager: `tv`, Punkte, Aufstellung `lp`, Serie |
| `/v4/leagues/{lid}/managers/{mid}/transfer` | täglich (Delta) | Transfers, `trp`, `tty`, `othnm` |
| `/v4/leagues/{lid}/managers/{mid}/squad` | täglich | Kader, `mv`, `prc`, Status |
| `/v4/leagues/{lid}/players/{pid}/marketvalue/{tf}` | nach Bedarf | MV-Historie |
| `/v4/leagues/{lid}/market` | täglich (idealerweise 2–3×) | aktuelles Marktangebot + Ablauf → Prognose-Log |
| `/v4/leagues/{lid}/me/budget` | täglich | **exakter** eigener Kontostand (Kalibrierung) |
| achievements | täglich | Erfolgsprämien `er` |

**Der Collector iteriert pro Lauf über alle Ligen des Nutzers** (aus `KICKBASE_LEAGUE_IDS`); jeder ligagebundene Endpunkt wird pro Liga aufgerufen und mit `league_id` gespeichert. `/v4/user/leagues` (bzw. das Liga-Listing des Users) einmal ziehen, um Namen/IDs zu befüllen. Keine Webhooks — alles Polling. 10er-Liga ≈ 20–25 Requests/Lauf. Basis: 1 Lauf/Tag. Backoff bei Fehlern, realistischer User-Agent, bei Sperrsignal stoppen.

---

## 7. Berechnungslogik

**Kontorekonstruktion (pro Manager):**
```
Konto = 200 Mio − Σ Käufe + Σ Verkäufe + Σ Erfolgsprämien  (+ Auflaufprämien; in dieser Liga 0)
```

**Maximalgebot (Kickbase 33%-Regel, offiziell bestätigt):**
```
Maximalgebot = Konto + 0,33 × (Kaderwert + min(Konto, 0))
```
Der `min(Konto,0)`-Term ist die „bei Minuskonto Kaderwert um die Schuld kürzen"-Logik. Bei Pluskonto bleibt `Konto + 0,33 × Kaderwert`.
Beispiel (FAQ): Kaderwert 100, Konto −10 → Grenze −0,33×(100−10) = −30 → Restspielraum 20.

**Overpay (pro Kauf):** `Preis − Marktwert zum Transferzeitpunkt`. Manager-Kennzahl = Durchschnitt über Käufe.

**Realisierter Gewinn:** `Verkaufspreis − Einkaufspreis`, FIFO bei Mehrfachkäufen desselben `pi`. Trefferquote = Anteil Verkäufe mit Gewinn.

**Liquidität:** `Konto / Gesamtkapital`. Niedrig + voller Kader = Verkaufsdruck.

**Marktprognose (Rückkehr):** aus `market_log` je Spieler `lastSeenOnMarket` lernen; `nextAppearance = lastSeen + Kadenz` (Kadenz einstellbar, Default 14 T). Konfidenz aus Anzahl beobachteter Auftritte; „gerade an Markt verkauft" (aus Transfers) = hohe Konfidenz. **Jetzt am Markt** kommt exakt aus `/market` mit Ablauf-Timer.

---

## 8. Verifikation & Kalibrierung (wichtig)

Zwei Klassen von Zahlen:
- **Gelesen** (Kickbases eigene Werte: `tv`, `trp`, Punkte, Kadergröße, Marktlistings) → so korrekt wie die Quelle.
- **Rekonstruiert** (fremde Kontostände + alles darauf: Overpay, realisierter Gewinn, Maximalgebot) → Schlussfolgerung, nur so gut wie die Annahmen.

**Selbstkalibrierung:** eigenes Konto exakt aus `/me/budget`. Rekonstruktion muss dort auf den Euro aufgehen → belegt Modell­vollständigkeit für alle. In `calibration` täglich mitschreiben und im UI als Statuszeile zeigen.

**Verhaltens-Constraints** (unabhängige Plausibilität): jeder getätigte Kauf ⇒ Untergrenze des Maximalgebots in dem Moment; die 33%-Regel ⇒ Obergrenze (Verletzung = Fehleralarm); Punkte am Spieltag ⇒ Konto war zu Spieltagsbeginn nicht negativ.

**UI-Status pro Zahl:** „exakt" (eigene Werte / gelesen), „bestätigt" (Selbstkalibrierung passt UND alle Eingabeposten für Fremde lesbar UND keine Constraint verletzt), sonst „geschätzt" + Korridor. Keine falsche Sicherheit.

**Verfallsdatum:** Kaderwert aktualisiert nächtlich (`mvud`). Maximalgebot gilt für den Zeitpunkt des Abgleichs, nicht zwingend für den Bietmoment.

---

## 9. Frontend — Seiten (aus dem Prototyp übernehmen)

Hash-freie Einzelseiten oder SPA — der Prototyp liegt als 5 statische Seiten vor:
- **Dashboard** — gegner-zentriert: Marktradar-Kachel (Favoriten) · eigenes Handlungsbedarf-Modul (klein) · sortierbare Manager-Tabelle (Kaderwert + Sparkline, prog. Kontostand, **Maximalgebot**, Anzahl Spieler, Ø Overpay, 7-Tage, Liquidität, Aktivität/Serie, Gesamt) · vier Insight-Kacheln (Verkaufsdruck, Overpay-Ranking, Absteiger, Schläfer).
- **Marktradar** — Jetzt am Markt (exakt) · Erwartete Rückkehr (Prognose, Konfidenz) · Kadenz-Regler · Favoritenfilter.
- **Liga/Analyse** — Marktband (Kaderwert/Kontostand/Gesamt) + Rangliste + Deep-Dives.
- **Manager-Detail** — Kapitalverlauf, Punkte, Kontobuch, Handelsbilanz (inkl. Ø Overpay), Kader, Transferhistorie.
- **Spieler-Detail** — Marktwertverlauf (7/14/Saison), ligaweite Besitzhistorie mit Overpay, Overpay-Index, „wie viele Manager halten ihn".

**Globaler Liga-Switch** in der Topbar (auf jeder Seite): wählt die aktive Liga; jede Ansicht filtert konsequent auf `league_id`. Aktive Liga in der URL (`?league=…`) für Teilbarkeit, zuletzt gewählte Liga als Default in `app_settings`. **Beim Umschalten immer zurück aufs Dashboard der neuen Liga** — niemals eine Manager-/Spieler-ID über Ligagrenzen mitnehmen (IDs sind ligaspezifisch).

Favoriten = lokales Feature (settings-Tabelle bzw. localStorage), keine API nötig.

---

## 10. Build-Reihenfolge (vertikale Scheiben)

0. **Auth** funktioniert (E-Mail/PW gesetzt) + Token-Refresh. Smoke-Test: `/me` abrufen.
1. Collector-Gerüst + SQLite-Schema + `/ranking` und `/me/budget` für **einen** Tag speichern.
2. **Backfill** aller Spieltage von `/ranking` (Kaderwert-/Punktehistorie).
3. Transfers + Kontorekonstruktion + **Selbstkalibrierung** — muss `/me/budget` auf den Euro treffen, bevor es weitergeht.
4. `data.json`-Export + bestehendes Frontend daran anschließen (Fake-Modul ersetzen).
5. `market_log` + Rückkehr-Prognose + Favoriten.
6. Insight-Kacheln (Overpay, Liquidität, Schläfer, Maximalgebot) — größtenteils abgeleitet, günstig sobald Daten da sind.

**Fixtures:** je Endpunkt einmal echte JSON-Antwort (mit Token via curl/Postman) abgreifen, unter `/fixtures` committen. Parser + Tests dagegen. Ermöglicht Entwicklung ohne die API zu belasten und vor gelöstem Login.

---

## 11. Sicherheit & API-Umgang

- Token/Login in `.env` (gitignored), **nie** committen. Kein Klartext-Passwort im Code.
- Token proaktiv vor Ablauf (~7 T) refreshen.
- 1 Poll/Tag als Basis; `/market` bei Bedarf öfter, aber zivilisiert. Exponential Backoff bei Fehlern.
- Unofficial API: bei Sperr-/Fehlersignalen stoppen statt retryen.
- Keine kommerzielle Nutzung.

---

## 12. Offene Verifikationspunkte (durch echte Daten zu klären)

- Liefert `achievements` **fremde** Erfolgsprämien? Falls nein: einziger Schätzposten der Fremd-Rekonstruktion → Status „geschätzt".
- `tty`-Mapping: welcher Wert = Kauf, welcher = Verkauf? Gegen eigenen bekannten Transfer prüfen.
- 33 % exakt oder ⅓ (33,33 %)? An einem echten Maximalgebot in der App kalibrieren.
- Maximalgebot: nutzt Kickbase Kaderwert **vor** oder **nach** dem gedachten Kauf? Ebenfalls am lebenden Objekt prüfen.
- `tv` bei historischem `dayNumber`: damaliger oder aktueller Wert?
