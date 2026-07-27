# Fixtures — echte Kickbase-Antworten (Checkpoint B)

Einmalig abgegriffene, **echte** Antworten der Kickbase-v4-API (Liga „KBLux Liga 2",
`6847281`, Saison 25/26, Spieltag 34). Grundlage für Parser + Tests (SPEC §6).
Token- und E-Mail-Felder sind redigiert (`<redacted …>` / `redacted@example.com`).

Abgegriffen über die geschützte Route `app/api/dev/capture-fixtures` und aus dem
Supabase-Zwischenspeicher (`app_settings['__dev_last_capture']`) übernommen.

| Datei | Endpunkt | Zweck |
|---|---|---|
| `ranking.json` | `/v4/leagues/{lid}/ranking` | Manager + Kaderwert/Punkte (M2) |
| `overview.json` | `/v4/leagues/{lid}/overview` | Liga-Name `lnm`, Mitgliederzahl `mgc` |
| `me_budget.json` | `/v4/leagues/{lid}/me/budget` | exakter eigener Kontostand `b` (M4-Kalibrierung) |
| `leagues_selection.json` | `/v4/leagues/selection` | Liga-Listing des Users |

**Hinweis:** `ranking.json` ist auf 4 repräsentative Manager gekürzt (2 aktiv mit
`tv`/`sp`, 2 inaktiv mit leerem `lp` und ohne `tv`) — echte Feldnamen/-werte, damit
die Parser beide Fälle abdecken. Die vollständige Liga hat 18 Manager.
