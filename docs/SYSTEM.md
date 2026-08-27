# Ligamonitor — Systembeschreibung & Funktionsübersicht

Diese Datei beschreibt, **was** Ligamonitor kann und **nach welchen Regeln** es
rechnet — nicht die konkrete Implementierung. Am Ende steht ein **Vergleich mit
KBeyond**, mit Schwerpunkt auf der **Kontostand-Rekonstruktion**.

---

## 1. Wozu das Ganze

Kickbase ist ein Bundesliga-Managerspiel. Kickbase zeigt jedem nur den *eigenen*
Kontostand. Von Mitspielern sieht man Teamwert, Punkte und Kader — aber nicht
ihr Guthaben. Damit weiß man nie, wer bei einem Spieler mitbieten kann.

**Ligamonitor** rekonstruiert den Kontostand jedes Mitspielers aus dessen
Transferhistorie plus einem festen Startpunkt (Reset) und baut darauf
Werkzeuge für Kauf-, Verkaufs- und Bietentscheidungen — plus reichhaltige
Spieler-, Aufstellungs- und Marktanalysen.

---

## 2. Architektur & Datenquellen

- **Frontend/Backend:** Next.js (App Router), serverseitiges Rendering.
- **Datenbank:** Supabase/Postgres mit Row-Level-Security (RLS). Jeder Nutzer
  sieht via RLS nur die Ligen, auf die er über `league_access` Zugriff hat.
  Der Server-Lesepfad nutzt teils einen Service-Client (RLS-Bypass).
- **Betrieb:** Vercel, Region **Frankfurt (`fra1`)** — bewusst, damit Kickbase
  den serverseitigen Login als deutsch/Bundesliga einstuft (sonst schaltet der
  Account auf „international", Challenges verschwinden). Alle Requests schicken
  `Accept-Language: de-DE`.
- **Mehrbenutzer:** Jeder Nutzer verbindet seinen Kickbase-Account. Das
  Zugriffstoken liegt **verschlüsselt** (`kb_connections`); das Passwort wird
  **nicht** gespeichert. Token werden vor Ablauf erneuert; scheitert das, wird
  die Verbindung als „neu verbinden nötig" markiert.
- **Kickbase-Zugriff:** inoffizielle Kickbase-v4-Schnittstelle, **nur lesend**.
  Es wird nie etwas bei Kickbase verändert.

**Genutzte Endpunkte (u. a.):** Ligen-Auswahl, Ligaübersicht, Rangliste,
eigener Kontostand (`/me/budget`), Kader je Manager, Transferhistorie je Manager
(**paginiert, reicht Jahre zurück**), Transfermarkt, Spieler-Marktwertkurve
(365 Tage), Spielerprofil (`prob` = Startelf-Wahrscheinlichkeit), Aufstellung
(`/lineup`), Vereinskader (`teamprofile`, für den Voll-Pool). Externe
Ausfall-News über api-football.

---

## 3. Die Kernrechnung: Kontostand-Rekonstruktion

Für jeden Manager, **gezählt nur ab dem Stichtag (`tracking_since`)**:

```
Kontostand = Startbudget
           − Summe aller Kaufpreise
           + Summe aller Verkaufserlöse
           + Login-Bonus (modelliert)
           + Spieltagsbonus (Punkte × 1.000 €, nur Manager-Modus)
           + manuelle Korrekturen (Strafen/Boni)
```

Details und Regeln:

- **Besitz-Zuordnung der Transfers:** bei einem Kauf ist der „Besitzer" der
  Käufer (`to_manager`), bei einem Verkauf der Verkäufer (`from_manager`).
- **Eigener Manager = exakt.** Für den angemeldeten Nutzer liefert Kickbase den
  echten Kontostand (`/me/budget`, gespeichert in `user_budget`). Dieser Wert
  überschreibt die Rekonstruktion — das eigene Konto ist also punktgenau.
- **Gegner = rekonstruiert** nach obiger Formel.
- **Login-Bonus** ist **modelliert** (nicht aus echten Ereignissen gelesen):
  Tagesstaffelung ab Reset — Tag 1: 10.000 €, +10.000 €/Tag, **ab Tag 10
  konstant 100.000 €**. Annahme: täglich aktiv. Für alle Gegner gleich; fließt
  in Konto & Max-Gebot.
- **Spieltagsbonus:** Saisonpunkte × **1.000 €**, nur im Manager-Modus
  (`game_mode = 2`). Die zugrunde liegenden Bonuspunkte werden **wöchentlich
  (dienstags abends)** eingefroren (`manager_bonus_points`), damit der Wert
  nicht schwankt.
- **Manuelle Korrekturen** (`adjustments`): Strafen/Boni des Liga-Admins, die
  nicht über die API kommen, werden von Hand je Manager eingetragen.
- **Stichtag/Startbudget** sind pro Liga einstellbar und werden **nie
  automatisch überschrieben**.

**Abgeleitete Kennzahlen:**

- **Maximalgebot** = `Konto + 33 % × (Kaderwert + min(Konto, 0))` — die
  Kickbase-Regel für das höchste Gebot ohne vorherigen Verkauf.
- **Gesamtwert** = Kontostand + Kaderwert (+ Boni, die im Konto stecken).
- **Liquidität** = Konto ÷ Gesamt.

**Datenlücke / Historie:** Der Transfer-Endpunkt ist **nicht** auf ein kleines
Fenster begrenzt — er paginiert die volle Historie zurück (in der Praxis
Jahre). Für eine neu verbundene Liga lädt ein **Voll-Backfill** (Button in den
Liga-Einstellungen) die gesamte Historie ab dem gesetzten Stichtag nach, sodass
das Konto sofort vollständig rekonstruiert ist. Bestehende, korrekte Ligen
bleiben unangetastet.

---

## 4. Die Seiten & Funktionen im Einzelnen

### 4.1 Dashboard — „Die Gegner"

**Manager-Tabelle** (alle Manager der Liga, sortierbar je Spalte):

| Spalte | Bedeutung |
|---|---|
| **Kaderwert** | Summe der Marktwerte des Kaders |
| **Kader-Momentum** | Summe der **heutigen Marktwert-Änderungen** aller Kaderspieler (jeder Spieler wird ~22 Uhr aktualisiert) — Maß dafür, wie „attraktiv" der Kader gerade ist; grün steigend, rot fallend |
| **Punkte** | Saisonpunkte |
| **Kontostand** | exakt (eigener) bzw. rekonstruiert; negativ = rot |
| **Maximalgebot** | Konto + 33 % × (Kaderwert + min(Konto, 0)) |
| **Liquidität** | Konto ÷ Gesamt; negativ = rot |
| **Gesamt** | Kontostand + Kaderwert |
| **Login-Bonus / Aktivität** | optional, über ein **Zahnrad** rechts einblendbar |

- **Sortier-reaktive Platzierungs-Pfeile:** ▲/▼ am Managernamen zeigen, wie
  viele Plätze der Manager **in der aktuell sortierten Spalte seit gestern**
  gut- oder schlechtgemacht hat (Vergleich heutiger Rang vs. Rang aus dem
  Vortags-Snapshot; v. a. für den Gesamtwert). Basis: nächtliche Snapshots
  von Kaderwert + rekonstruiertem Konto + Punkten je Manager und Tag.
- **Insights-Kacheln:** Kaderwert-Spitze, meiste Punkte, Ø Kaderwert, eigenes
  Konto/Max-Gebot/Gesamt, Ø Overpay.
- **Mein Kader** (eigener Kader) mit allen Kennzahlen (siehe 4.6).
- **Kompakte Kopfzeile:** Titel + Info + „Spaltenkopf klicken zum Sortieren" +
  Spalten-Zahnrad auf einer Zeile; Liga-Einstellungen & „Aktualisieren" als
  Icon-Buttons.

### 4.2 Liga — „Das Feld"

Rangliste aller aktiven Manager (Punkte, Kaderwert, Serie).

### 4.3 Marktradar

- **Bid-Advisor / Auto-Targets:** Kaufempfehlungen mit Begründungen (unter MW,
  steigend, freie Bahn, gewinnbar) auf Basis der rekonstruierten Max-Gebote
  aller Manager.
- **Panik-Barometer:** wertgewichteter Overpay-Anteil der Liga (Σ Overpay ÷
  Σ Marktwert), umschaltbar **1 / 3 / 7 Tage**, mit Stimmungsband
  (ruhig→Panik), Ø-Aufpreis, größten Panikkäufen und einer **14-Tage-
  Verlaufs-Sparkline** (rollierendes 3-Tage-Fenster).
- **Markt-Potenzial:** freier Bundesliga-Marktwert (Voll-Pool − in der Liga
  gebundener Kaderwert) vs. Kaufkraft (Σ Kontostände), inkl. Deckungsgrad.
- **MarketRadar:** aktuelle Angebote mit Restzeit, Filter, Kaufberatung.

### 4.4 News

Kickbase-interne Signale (Ausfälle liga-weit, eigene MW-Gewinner/-Verlierer)
plus **externe Ausfälle** (api-football), mit Kickbase-Treffern zuerst.

### 4.5 Manager-Detail — Off-canvas + volle Seite

- **Off-canvas von rechts** (Intercepting Route, öffnet ohne Seitenwechsel, mit
  Skelett beim Laden): Kennzahlen-Kacheln, Handelsbilanz, **Tabs Kader /
  Transferhistorie**.
- **Volle Detailseite** (Direktaufruf/Reload): zusätzlich **manuelle
  Korrekturen** (Strafen/Boni eintragen) und **Manager aus-/einblenden**
  (pro Liga).

### 4.6 Kader-Tabelle (Mein Kader & Manager-Detail)

- Position, Name, Team, Status, Marktwert, **Entwicklung seit gestern**
  (MW-Momentum: gestrige Steigerung vs. vorgestrige, orange wenn nachlassend),
  Kaufpreis, Gewinn, Punkte, Ø.
- **Startelf-Wahrscheinlichkeit-Icon** (`prob` 1–5) vor dem Namen: ★ sicher /
  ✓ wahrscheinlich / ? fraglich / ! unwahrscheinlich / ✕ spielt nicht.
- **„Aufgestellt"-Punkt** für Spieler in der aktuellen Startelf.
- **Bulk-Select (Verkaufsrechner):** Spieler ankreuzen → Toast-Leiste unten mit
  summiertem **Verkaufswert** und **„Konto jetzt → Konto nach Verkauf"**
  (grün/rot, ob der Manager damit ins Plus käme).
- **Mini-Fußballfeld:** die Startelf positionsgetreu (TW unten → Angriff oben),
  Reihen nach Position, Formation in der Legende (z. B. 3-4-3).

### 4.7 Spielerkarte (Modal)

Öffnet als Overlay (Intercepting Route) bzw. als volle Seite. Enthält:

- Kennzahlen: Marktwert, Ø/Gesamtpunkte, Punkte/Mio, **Trend 24 h & 1 Woche**.
- **Fair Value** — eigene, transparente Schätzung (Ø Punkte × Liga-Median
  MW/Punkt), inkl. über-/unterbewertet-Marker; klar als Schätzung markiert.
- **Marktwertverlauf** mit Zeitfenstern (7T/1M/3M/6M/1J) + Höchst/Tief.
- **Letzte Änderungen** (tägliche MW-Deltas).
- Besitzer, Kaufpreis/Buchgewinn, ligaweite Besitzhistorie.
- Externe Ausfall-Meldung, Startelf-Wahrscheinlichkeit.

### 4.8 Admin

Nur für den Admin-Account (`hello@ericwicker.de`): Nutzerverwaltung
(Premium/Free, Liga-Limits).

### 4.9 Liga-Einstellungen

Pro Liga: Liga-Typ (`game_mode`), Startbudget, Stichtag, historische Daten
ein-/ausschließen, Bonusmodell (Spieltagsboni / nur Lock-In) — plus **„Volle
Historie ab Startzeitpunkt laden"** (Voll-Backfill für neu verbundene Ligen).

---

## 5. Aktualisieren & Ingest

- **Manuell** („Aktualisieren"): schlank — Ranking, Kader, **neue** Transfers
  (inkrementell ab dem jüngsten bekannten), eigener Kontostand. Schnell.
- **Nächtlicher Cron** (Vercel, ~20:15 & 21:15 UTC = nach dem täglichen
  Kickbase-MW-Update ~22 Uhr deutscher Zeit): zusätzlich Tages-Snapshots
  (Kaderwert/Konto/Punkte je Manager, Marktwert je Kaderspieler), Overpay-
  Backfill, Voll-Pool-Marktwert, externe News und **Startelf-Wahrscheinlichkeit
  gestaffelt** (stalest zuerst, gedeckelt).
- **Spieltagsbonus-Cron** (dienstags abends): friert die Bonuspunkte ein.
- **Drosselung:** Mindestabstand (~500 ms) zwischen Requests, Backoff bei
  429/5xx, sofortiger Abbruch bei 403 (Sperrsignal).
- **Tages-Snapshots werden nur nachts geschrieben** (nach dem MW-Update), damit
  ein Vormittags-Refresh den Tages-Trend nicht mit gestrigen Werten verfälscht.

---

## 6. Datenmodell (Auszug)

| Tabelle | Inhalt |
|---|---|
| `leagues` | Liga-Stammdaten, Startbudget, `game_mode`, `tracking_since`, Bonusmodell |
| `managers` | Manager je Liga |
| `manager_snapshots` | je Spieltag: Kaderwert, Punkte, Serie, Kadergröße, Punktereihe |
| `transfers` | jeder erfasste Kauf/Verkauf (dauerhaft, upsert auf ID) |
| `squad_players` | aktueller Kaderbestand + Status, `lineup_status`, `lineup_order` |
| `players` | Spielerstamm + `lineup_prob` (Startelf-Wahrscheinlichkeit) |
| `player_mv` / `player_mv_daily` | Marktwert je Spieltag / je Kalendertag |
| `manager_tv_daily` | je Manager & Tag: Kaderwert, **Konto (rekonstr.)**, Punkte |
| `manager_bonus_points` | eingefrorene Spieltags-Bonuspunkte |
| `market_pool` | Voll-Pool-Marktwert je Bundesliga-Team |
| `market_log` / `user_budget` / `adjustments` / `hidden_managers` / `external_injuries` / `calibration` | Markt, exakter eigener Kontostand, Korrekturen, ausgeblendete Manager, externe News, Kalibrierung |

Historie wird **nie** gelöscht (Ausnahmen: aktueller Kaderbestand wird je Lauf
ersetzt; Transfers vor dem Stichtag bewusst bereinigt). Dadurch hält Ligamonitor
Daten über Kickbases eigenes Vorhaltefenster hinaus korrekt.

---

## 7. Sicherheit & Rahmen

- **RLS:** Zugriff strikt über `league_access`; Schreibaktionen über POST mit
  Session-Prüfung und Liga-Zugriffskontrolle.
- **Zeitzone:** Anzeige/Eingabe in deutscher Zeit (Reset/Marktschluss nennt
  Kickbase in deutscher Zeit).
- **AGB-Hinweis:** Kickbase untersagt gewerbliche Nutzung & Datamining ohne
  Zustimmung; Skalierung/Monetarisierung nur mit Kickbase-Einwilligung.

---

## 8. Vergleich mit KBeyond

Beide Systeme lösen dasselbe Problem (Gegner-Kontostände sichtbar machen),
wählen aber **unterschiedliche Primärquellen** — mit direkten Folgen für die
Kontostand-Rekonstruktion.

### 8.1 Kontostand-Rekonstruktion (der Kern)

| Aspekt | **KBeyond** | **Ligamonitor** |
|---|---|---|
| **Primärquelle** | **Aktivitätsfeed** (Ereignisliste) | **Transferhistorie je Manager** (paginiert) |
| **Reichweite der Quelle** | nur letzte **~670 Einträge** | **volle Historie** (Jahre), keine harte Grenze |
| **Alte Transfers** | Lücke → über **Spieler-Transferhistorie** rekonstruieren (nur vor dem ältesten Feed-Eintrag, zeitbasierte Duplikatvermeidung) | nativ vollständig; **Voll-Backfill** ab Stichtag; Duplikatvermeidung per Upsert auf Transfer-ID |
| **Login-Bonus** | aus **echten Feed-Ereignissen** (tatsächlicher Betrag + Streak-Tag; Reset-Staffelung; Streak-Brüche sichtbar) | **modelliert** (Annahme täglich aktiv, 10k→100k ab Tag 10) |
| **Strafen** | aus dem **Feed** (im Fenster), ältere manuell | **nur manuell** (Korrekturen) |
| **Spieltagsbonus** | Punkte × Bonus (Formel) | Punkte × **1.000 €**, wöchentlich eingefroren (nur `game_mode 2`) |
| **Eigener Kontostand** | echt von Kickbase | echt von `/me/budget` |
| **Kalibrierung (berechnet vs. echt vs. Differenz)** | **zentrales, sichtbares Werkzeug** — der harte Beleg | Mechanik vorhanden (`calibration`, Legacy), **aber nicht als prominentes Panel** |
| **Manuelle Korrekturen** | ja (je Manager, mit Begründung) | ja (`adjustments`, je Manager) |

**Kurz gesagt:**

- **KBeyond ist stärker bei Login-Bonus & Strafen**, weil es die **echten
  Beträge aus dem Feed** liest (inkl. Streak-Brüchen). Dafür ist es durch das
  **670-Einträge-Fenster** limitiert und muss ältere Transfers über die
  Spielerhistorie mühsam rekonstruieren (mit sorgfältiger Duplikatvermeidung).
- **Ligamonitor ist stärker bei der Transfer-Tiefe**: Der Transfer-Endpunkt
  liefert die **volle Historie** (nachweislich Jahre zurück), ein Voll-Backfill
  füllt neue Ligen sofort. Dafür wird der **Login-Bonus nur modelliert**
  (fehleranfällig bei Managern, die nicht täglich einloggen), **Strafen** werden
  nicht automatisch erfasst, und es fehlt ein **sichtbares Kalibrierungs-Panel**
  als Beweis, dass die Formel stimmt.

### 8.2 Funktionsumfang (Überblick)

| Bereich | KBeyond | Ligamonitor |
|---|---|---|
| Manager-Tabelle (Gesamt, Max-Gebot, Konto, Liquidität, Teamwert, Punkte) | ✅ | ✅ (+ Kader-Momentum, sortier-reaktive Rang-Pfeile) |
| Verkaufsrechner „so wenig wie möglich" | ✅ | ⚠️ Bulk-Select mit „Konto nach Verkauf" (ohne Auto-Minimalvorschlag) |
| Kaufrechner (beide Marktseiten, Regler, Login-Boni) | ✅ | ⚠️ Bid-Advisor/Auto-Targets statt Regler-Rechner |
| Wahrscheinliche Aufstellung / Fußballfeld | ✅ (Vorschlag) | ✅ (echte Startelf aus `lo`) + prob-Icons |
| Rückkehrprognose freier Spieler | ✅ (Rhythmus-Median) | ❌ |
| Freie Spieler / Kaufkraft-Verhältnis | ✅ | ✅ (Markt-Potenzial) |
| Aufschläge/Overpay-Analyse | ✅ (eigene Seite, Filter) | ✅ (Panik-Barometer + Ø Overpay) |
| Teamwert-Verlauf (Diagramm) | ✅ | ⚠️ Snapshots vorhanden, Fokus auf Rang-Pfeile/MW-Kurven |
| Spieler-News | ✅ (LLM-Websuche) | ⚠️ externe Ausfälle (api-football), keine LLM-Recherche |
| „Frag die Liga" (LLM-Q&A) | ✅ | ❌ |
| Spielerkarte (MW-Kurve, Trends, Fair Value) | ⚠️ teils | ✅ (reich, als Modal) |
| Panik-Barometer + Verlauf | ❌ | ✅ |
| Startelf-Wahrscheinlichkeit-Icons | ❌ | ✅ (`prob` 1–5) |
| Mehrbenutzer + RLS, Admin-Interface | ⚠️ geteilter Datensatz je Liga | ✅ (RLS je Nutzer, Admin) |
| Aktualisierung | manuell (ein Knopf) | manuell (schlank) **+ nächtlicher Cron** |

### 8.3 Empfehlungen für Ligamonitor (aus dem Vergleich)

1. **Sichtbares Kalibrierungs-Panel** (berechnet vs. echt vs. Differenz für das
   eigene Konto). Wir haben den exakten Wert bereits — das ist günstig und der
   einzige harte Beweis, dass die Rekonstruktionsformel stimmt.
2. **Aktivitätsfeed zusätzlich auswerten** für **echte Login-Bonus-Beträge** und
   **Strafen** — würde die zwei schwächsten Stellen der Gegner-Rekonstruktion
   (modellierter Bonus, fehlende Strafen) deutlich präziser machen.
3. **Streak-Brüche beim Login-Bonus** berücksichtigen (aktuell Annahme „täglich
   aktiv").
4. Optional übernehmen: **Rückkehrprognose** freier Spieler und ein expliziter
   **Kauf-/Verkaufsrechner mit Aufschlags-Reglern**.

---

*Stand: Diese Beschreibung spiegelt den Funktionsstand des Branches zum
Erstellungszeitpunkt. Sie ist als Gegenstück zur KBeyond-Funktionsübersicht
gedacht.*
