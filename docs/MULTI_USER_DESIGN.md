# Ligamonitor — Multi-User-Design

Status: **Entwurf zur Abstimmung** · Autor: Session `claude/coding-session-5d5vdp`

Vom Single-User-Werkzeug (ein Operator, Credentials in env, ein Token in
`kb_auth`) zu einem Dienst, bei dem sich mehrere Menschen anmelden, ihren
Kickbase verbinden und darüber ihre Ligen + Daten gezogen bekommen.

## 1. Entscheidungen (bereits getroffen)

| Frage | Entscheidung |
|---|---|
| App-Login | **E-Mail Magic-Link** (Supabase Auth), getrennt vom Kickbase |
| Kickbase-Anbindung | **Jeder verbindet seinen eigenen Kickbase** (Token-basiert) |
| Kickbase-Passwort | wird **nie dauerhaft gespeichert** — nur einmal gegen Tokens getauscht |
| Vorgehen | erst dieses Design, dann Umsetzung in Phasen |

**Leitprinzip: Identität ≠ Datenquelle.** Der App-Login (wer bist du bei uns)
ist strikt getrennt vom Kickbase-Token (womit ziehen wir Daten). Kickbase bietet
kein offizielles OAuth für Dritte — deshalb müssen die Kickbase-Zugangsdaten
**einmalig** beim Verbinden angefasst werden, um Tokens zu erhalten; danach nur
noch Tokens.

## 2. Kern-Einsicht, die das Datenmodell bestimmt

Liga-Daten (Ranking, Transfers, Markt, Kader) sind **liga-weit** für jedes
Mitglied sichtbar. Es reicht **ein verbundenes Mitglied pro Liga**, um die
komplette Liga-Intel zu ziehen. Nur der **exakte eigene Kontostand**
(`/me/budget`) ist pro Person privat.

Daraus folgt eine wichtige Trennung der Sichtbarkeit:

- **Liga-geteilt** (jedes Mitglied darf sehen): Kaderwerte, Punkte, Transfers,
  Markt, Kaderbestand, **rekonstruierte** Kontostände/Maximalgebote der Gegner.
- **Nutzer-privat** (nur der Betroffene): der **exakte** eigene Kontostand aus
  `/me/budget` und daraus abgeleitetes exaktes Maximalgebot.

Die Gegner-Aufklärung (rekonstruierte Konten) bleibt erlaubt, weil sie
ausschließlich aus liga-sichtbaren Transferdaten berechnet wird — sie legt nichts
offen, was ein Mitglied nicht ohnehin sehen könnte.

## 3. Architektur-Überblick

```
Browser ──(Magic-Link)──► Supabase Auth ──► Session-JWT (auth.uid())
   │
   ├─ Lesen: RLS-gebundener Client (JWT) → sieht nur eigene Ligen
   │
   └─ "Kickbase verbinden": Server-Action
         → login(email,pass) → Tokens + kb_user_id
         → Tokens verschlüsseln → kb_connections
         → /selection → league_access + memberships
         → Initial-Collect anstoßen

Scheduler/Collector (Service-Role, RLS-Bypass):
   für jede aktive Connection: Token (ggf. refresh)
   Ligen deduplizieren → je Liga EINMAL liga-weit sammeln
   je Connection zusätzlich /me/budget → nutzer-private Tabelle
```

## 4. Datenmodell

### 4.1 Neue Tabellen

```sql
-- App-Identität kommt aus Supabase Auth (auth.users). Optionales Profil:
create table profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at  timestamptz not null default now()
);

-- Kickbase-Verbindung je App-Nutzer. Tokens VERSCHLÜSSELT (siehe §5).
create table kb_connections (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  kb_user_id    text not null,               -- Kickbase-User-ID (= manager_id je Liga)
  access_token  bytea not null,              -- AES-GCM Chiffrat
  refresh_token bytea,                        -- AES-GCM Chiffrat
  token_iv      bytea not null,               -- Nonce/IV
  token_tag     bytea not null,               -- GCM Auth-Tag
  expires_at    timestamptz,
  status        text not null default 'active', -- active | needs_reconnect
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Welche App-Nutzer dürfen welche Liga sehen (RLS-Grundlage).
-- Beim Verbinden aus /selection befüllt; beim Trennen bereinigt.
create table league_access (
  user_id     uuid not null references auth.users(id) on delete cascade,
  league_id   text not null,
  kb_manager_id text not null,               -- = kb_user_id; „welcher Manager bin ich hier"
  primary key (user_id, league_id)
);

-- Nutzer-privater exakter Kontostand (ersetzt manager_snapshots.cash_actual
-- als geteilte Spalte). Nur der Betroffene darf ihn sehen.
create table user_budget (
  user_id     uuid not null references auth.users(id) on delete cascade,
  league_id   text not null,
  day         integer not null,
  cash_actual bigint,
  updated_at  timestamptz not null default now(),
  primary key (user_id, league_id, day)
);
```

### 4.2 Änderungen an bestehenden Tabellen

- `manager_snapshots.cash_actual`: **entfernen** (bzw. nicht mehr befüllen) — der
  exakte Kontostand wandert nach `user_budget` (nutzer-privat). Die
  **Rekonstruktion** bleibt liga-geteilt und wird im Read-Layer berechnet.
- `managers.is_me`: **entfällt** als globales Flag. „Ich" ist ab jetzt
  kontextabhängig: für Nutzer U in Liga L ist es der Manager mit
  `id == U.kb_user_id` (via `league_access`).
- `kb_auth` (Singleton): **entfällt** zugunsten `kb_connections`.
- `leagues`-Einstellungen (`start_budget`, `tracking_since`, `include_history`,
  `bonus_mode`): bleiben **pro Liga** (nicht pro Nutzer) — sie beschreiben die
  Liga, nicht die Person. Wer darf sie ändern? Vorschlag: jedes verbundene
  Mitglied (später ggf. „Liga-Admin").

### 4.3 Env/Config-Änderungen

- **Weg:** `KICKBASE_EMAIL`, `KICKBASE_PASSWORD` (Single-User).
- **Neu:** `KB_TOKEN_ENC_KEY` (32 Byte, base64) — App-seitiger Schlüssel für die
  Token-Verschlüsselung. Nur in Vercel-Env, nie in der DB.
- Supabase Auth: SMTP für Magic-Link-Mails konfigurieren.

## 5. Token-Verschlüsselung

**Ansatz: App-seitige AES-256-GCM-Verschlüsselung** (Node `crypto`), Schlüssel
aus `KB_TOKEN_ENC_KEY` (Env). Klartext-Token existiert nur im Server-Speicher zur
Laufzeit; in der DB liegt nur das Chiffrat.

Warum nicht nur DB-seitig (pgcrypto/Vault)? Läge der Schlüssel in der DB, würde
ein DB-Leak auch die Tokens preisgeben. Mit App-seitigem Schlüssel braucht ein
Angreifer **DB + Env-Secret** — deutlich höhere Hürde.

```
verschlüsseln(token):
  iv = random(12 Byte)
  cipher = AES-256-GCM(key=KB_TOKEN_ENC_KEY, iv)
  ct = cipher.update(token) + cipher.final()
  return { ct, iv, tag: cipher.getAuthTag() }
```

Entschlüsselt wird **nur server-seitig** unmittelbar vor einem Kickbase-Call.
Passwörter werden **nie** gespeichert (auch nicht verschlüsselt) — nur zur
Laufzeit für den einen Login-Call verwendet und dann verworfen.

## 6. RLS-Policies (Skizze)

Der **Frontend-Read-Layer muss vom Service-Client auf einen RLS-gebundenen
Client (mit dem Nutzer-JWT) umgestellt werden** — das ist die größte Änderung im
Lesepfad. Der **Collector** bleibt Service-Role (RLS-Bypass).

```sql
alter table leagues            enable row level security;
alter table managers           enable row level security;
alter table manager_snapshots  enable row level security;
alter table transfers          enable row level security;
alter table market_log         enable row level security;
alter table player_mv          enable row level security;
alter table squad_players      enable row level security;
alter table calibration        enable row level security;

-- Zugriff auf liga-geteilte Daten: nur wenn Nutzer Mitglied der Liga ist.
create policy read_league_shared on manager_snapshots for select
  using (exists (
    select 1 from league_access la
    where la.user_id = auth.uid() and la.league_id = manager_snapshots.league_id
  ));
-- (analoge Policy für managers, transfers, market_log, player_mv, squad_players,
--  calibration, leagues — jeweils über league_id gegen league_access)

-- Nutzer-privat: exakter Kontostand nur für den Betroffenen.
alter table user_budget enable row level security;
create policy read_own_budget on user_budget for select
  using (user_id = auth.uid());

-- Verbindung: nur Eigentümer.
alter table kb_connections enable row level security;
create policy own_connection on kb_connections for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- players (globale Stammdaten): für alle Angemeldeten lesbar.
alter table players enable row level security;
create policy read_players on players for select using (auth.role() = 'authenticated');
```

Schreibzugriff (Ingest) erfolgt ausschließlich über den Service-Role-Client, der
RLS umgeht — daher keine INSERT/UPDATE-Policies für normale Nutzer.

## 7. Auth- und Verbindungs-Flows

### 7.1 Anmelden (Magic-Link)
1. Nutzer gibt E-Mail ein → Supabase Auth schickt Login-Link.
2. Klick → Session-JWT im Browser. `auth.uid()` ist ab jetzt die App-Identität.

### 7.2 Kickbase verbinden (einmalig)
1. Formular „Kickbase verbinden": Kickbase-E-Mail + Passwort (über HTTPS an
   **unsere** Server-Action, nicht an Kickbase direkt aus dem Browser).
2. Server: `login(email, pass)` → Tokens + `kb_user_id`.
3. Tokens verschlüsseln → `kb_connections` (Passwort verwerfen).
4. `/selection` → für jede Liga `league_access(user_id, league_id, kb_manager_id)`
   upserten.
5. Initial-Collect für neu hinzugekommene Ligen anstoßen.
6. **Einwilligung** (§9) muss vor Schritt 1 aktiv bestätigt werden.

### 7.3 Trennen / Löschen (DSGVO)
- „Kickbase trennen": `kb_connections`-Zeile + `league_access` des Nutzers löschen.
- Ligen ohne verbleibendes verbundenes Mitglied: nicht mehr sammeln; Daten
  wahlweise behalten oder purgen (Retention-Entscheidung, §9).
- „Konto löschen": `auth.users`-Löschung kaskadiert über `on delete cascade`.

### 7.4 Reconnect
- Schlägt der Token-Refresh fehl → `status = needs_reconnect`; UI fordert zum
  erneuten Verbinden auf. Sammel-Läufe überspringen solche Connections.

## 8. Collector-Umbau

Heute: eine env-Liga-Liste, ein Token. Neu:

1. Alle `kb_connections` mit `status='active'` laden.
2. Token je Connection sicherstellen (entschlüsseln, ggf. refreshen, bei
   Fehler `needs_reconnect`).
3. **Ligen deduplizieren:** `league → erste gesunde Connection`. Jede Liga wird
   **genau einmal** liga-weit gesammelt (Ranking/Transfers/Markt/Kader) — egal wie
   viele Mitglieder verbunden sind. Das begrenzt die API-Last.
4. **Pro Connection zusätzlich `/me/budget`** → `user_budget` (nutzer-privat).
5. Backoff/Block-Handling wie bisher; höhere Nutzerzahl = strengeres Rate-Limit
   und ein zentraler Lauf statt pro Nutzer.

## 9. Recht & Datenschutz (DSGVO)

**Ehrlich und wichtig — bitte vor dem Launch klären:**

- **Kickbase-ToS:** Die API ist inoffiziell. Als Dienst mit **fremden** Accounts
  steigt das Sperr-Risiko (auch für die Accounts der Mitspieler). Empfehlung:
  zunächst **invite-only/privat** in bekannten Ligen, nicht öffentlich vermarkten.
- **Personenbezug:** Namen + „rekonstruierte Finanzen" echter Personen sind
  personenbezogene Daten. Innerhalb einer privaten Liga meist vertretbar (Daten
  sind ohnehin liga-sichtbar), aber es braucht **Einwilligung** und
  **Löschmöglichkeit**.
- **Auftrag/Verantwortung:** Wer betreibt den Dienst, wer ist Verantwortlicher im
  Sinne der DSGVO? Vor Launch festlegen (Impressum/Datenschutzerklärung).
- **Retention:** Wie lange bleiben Daten nach dem Trennen? Vorschlag: bei Trennen
  der letzten Connection einer Liga werden deren Daten nach X Tagen gelöscht.

**Einwilligungstext-Entwurf (Verbinden-Schritt):**

> Ich verbinde meinen Kickbase-Account mit Ligamonitor. Ligamonitor speichert
> dafür ein Zugriffs-Token (verschlüsselt), nicht mein Passwort, und ruft damit
> die Daten meiner Ligen ab (Ranking, Transfers, Markt, Kader sowie meinen
> Kontostand). Diese Daten werden ausgewertet, um Liga-Statistiken anzuzeigen.
> Ich kann die Verbindung jederzeit trennen und meine Daten löschen lassen.

## 10. Sicherheits-Kurzbetrachtung (Threat Model)

| Risiko | Gegenmaßnahme |
|---|---|
| DB-Leak legt Tokens offen | App-seitige AES-GCM-Verschlüsselung, Schlüssel nur in Env |
| Token-Missbrauch (Bearer = Vollzugriff auf KB-Account) | Minimaler Zugriff, Entschlüsselung nur server-seitig, Rotation bei Trennen |
| Nutzer sieht fremde Ligen | RLS über `league_access`, Read-Layer an JWT gebunden |
| Exakter Kontostand leakt an Ligamitglieder | eigene Tabelle `user_budget`, RLS `user_id = auth.uid()` |
| Passwort-Leak | Passwort nie gespeichert/geloggt, nur Laufzeit |
| Rate-Limit/Block durch viele Nutzer | Liga-Dedupe, ein zentraler Lauf, Backoff |

## 11. Phasenplan (Umsetzung)

**Phase 1 — Auth-Fundament**
- Supabase Auth (Magic-Link) aktivieren; Login-/Logout-UI.
- Migration: `profiles`, `kb_connections`, `league_access`, `user_budget`.
- Token-Krypto-Modul (`lib/security/crypto.ts`), `KB_TOKEN_ENC_KEY`.
- „Kickbase verbinden/trennen"-Flow (Server-Actions) inkl. Einwilligung.
- `session.ts`: Token nicht mehr aus env, sondern aus `kb_connections`.

**Phase 2 — Mandantentrennung**
- RLS auf allen liga-geteilten Tabellen + `user_budget` + `kb_connections`.
- Read-Layer (`lib/db/queries.ts`) vom Service-Client auf **JWT-Client**
  umstellen; „is_me" aus `league_access` statt `managers.is_me`.
- `cash_actual` aus `manager_snapshots` → `user_budget` migrieren.

**Phase 3 — Collector**
- `runCollect` über `kb_connections` + Liga-Dedupe; `/me/budget` pro Connection
  in `user_budget`.
- `league_access`/Memberships beim Sammeln aktualisieren.

**Phase 4 — Onboarding & Härtung**
- Onboarding-UX, Reconnect-Hinweise, Konto-/Datenlöschung.
- Datenschutzerklärung/Impressum, Retention-Job.
- Last-/Block-Tests mit mehreren Accounts.

## 12. Offene Fragen

1. **Mehrere Kickbase-Accounts pro Person?** Aktuell 1:1 angenommen
   (`kb_connections` PK = `user_id`). Bei Bedarf → eigene `id` + `unique(user_id,
   kb_user_id)`.
2. **Retention** nach Trennen der letzten Liga-Connection (behalten vs. löschen,
   Frist)?
3. **Liga-Einstellungen** — wer darf sie ändern (jedes Mitglied vs. Liga-Admin)?
4. **Scope** — bewusst privat/invite-only starten? (Empfehlung: ja.)
5. **Kosten/Betrieb** — Supabase-Plan, Vercel-Cron-Limits bei mehr Ligen.
```
