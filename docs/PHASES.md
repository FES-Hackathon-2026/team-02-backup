# Phasen-Handoff — parallel bauen ohne Kollisionen

Jede Phase ist ein eigener Auftrag, den eine eigene Session übernehmen kann.
Damit das ohne Merge-Krieg funktioniert, gilt **Dateibesitz**: eine Phase schreibt
nur ihre eigenen Dateien und fasst fremde nicht an.

Zeitplan, Umfang und Streichleiter stehen in [PLAN.md](PLAN.md).

---

## Was schon steht (Phase 1 + 2)

| | |
|---|---|
| Design-System | `app/src/styles/tokens.css`, `app.css`, `components/Icon.tsx`, `ui.tsx`, `Screen.tsx`, `TabBar.tsx` |
| Router + Gate | `app/src/App.tsx`, `lib/session.tsx`, `screens/Anmelden.tsx` |
| API-Client | `app/src/lib/client.ts` — `api.get/post/upload`, `useApi()` |
| Server | `server/src/index.js`, Fastify, serviert auch `app/dist` |
| Datenbank | `server/src/schema.sql` — **vollständig für alle zehn Phasen** |
| Seed | `server/src/seed.js` — 46 Stadtteile, 1.011 echte OSM-Orte, Demo-Inhalte |
| Belohnung | `server/src/engine/award.js`, `totals.js` |
| Echte Daten | `server/data/places.json` (OSM), foodsharing-Proxy `/api/food/*` |

**Start:** `cd server && npm start` → <http://localhost:8080> (serviert API und App).
Für Frontend-Arbeit zusätzlich `cd app && npm run dev` → Port 5173, `/api` wird geproxyt.

---

## Die eisernen Regeln

1. **`schema.sql` fasst niemand an.** Er deckt schon alle Phasen ab. Fehlt wirklich
   eine Spalte: melden, nicht selbst ändern — sonst kollidieren zwei Phasen im
   selben File.
2. **Punkte entstehen nur in `engine/award.js`.** Kein Feature schreibt selbst in
   `ledger_entries`. Der Client rechnet nie.
3. **Kein Schlüssel bekommt ein `VITE_`-Prefix.** Alles Geheime lebt in `server/.env`.
4. **Design-System nicht ändern.** Neue Optik heißt: neue Klasse im eigenen Screen,
   oder kurz absprechen.
5. **Jede nachgebaute Quelle trägt `tier: 'simulated'`** — nie `confirmed`.
6. **Echte Daten vor erfundenen.** Erst prüfen, ob OSM, GTFS, foodsharing oder eine
   FES-Seite die Information hergibt.

### Was jede Phase anfassen darf

| Phase | Server | Client |
|---|---|---|
| 3 Engine | `engine/*`, `routes/receipt.js` | `screens/Nachweis.tsx` |
| 4 Scan-Agent | `agent/*`, `routes/scan.js` | `screens/Scan.tsx`, `screens/Erkannt.tsx` |
| 5 FES | `integrations/fes/*`, `routes/fes.js` | `screens/Abholung.tsx`, `Kalender.tsx`, `Wissen.tsx` |
| 6 Markt | `routes/market-write.js` | `screens/Markt.tsx`, `MarktDetail.tsx` |
| 7 Quests | `routes/quests-write.js`, `agent/verify.js` | `screens/Quests.tsx`, `QuestProof.tsx`, `Review.tsx`, `components/Map.tsx` |
| 8 Mobilität | `integrations/traffiq/*`, `routes/mobility.js` | `screens/Route.tsx` |
| 9 food + Vytal | `integrations/vytal/*`, `routes/vytal.js` | `screens/Fairteiler.tsx`, `Vytal.tsx` |
| 10 Wirkung | `routes/rewards.js` | `screens/Wirkung.tsx`, `Stadtteile.tsx`, `Belohnungen.tsx`, `Integrationen.tsx` |

Zwei gemeinsame Dateien lassen sich nicht vermeiden. Beide nur **um eine Zeile
ergänzen**, nie umbauen:

- `server/src/index.js` — eine `await app.register(...)`-Zeile
- `app/src/App.tsx` — eine `<Route …/>`-Zeile

---

## Reihenfolge

```
1 ── 2 ──┬── 3 ──┬── 5 ──┐
         │       ├── 6 ──┤
         ├── 4 ──┼── 7 ──┼── 10
         ├── 8 ──┤       │
         └── 9 ──┘───────┘
```

- **3 zuerst**, sobald möglich: 5, 6, 7 und 9 schreiben alle durch `award()`.
  Sie können aber **sofort** starten, weil die Signatur schon steht — die Regeln
  landen später dahinter, ohne dass ein Aufrufer sich ändert.
- **8 ist unabhängig.** GTFS-Aufbereitung braucht von den anderen nichts.
- **10 zum Schluss**, es liest von allen.

Realistisch parallel: **4 · 5 · 6 · 8 · 9** gleichzeitig, während 3 läuft. 7 danach,
weil es 4 braucht (Bildvergleich) — oder parallel, wenn jemand zuerst nur die Karte
und den Melde-Flow baut.

---

## Auftrag je Phase

Jede Session bekommt: **Ziel · Dateien · Vertrag · Fertig-wenn**. Umfang und
„Draußen"-Liste stehen in [PLAN.md](PLAN.md) — die gilt unverändert.

### Phase 3 — Engine und Nachweis
**Vertrag:** `award()` behält die Signatur. Dazu kommen `assumptions.js` (alle
CO₂-Faktoren an einem Ort, je mit Quelle), Netto-Rechnung, Tageslimit 3,
Wiederholungsdämpfer, Tier-Gewichte. Neu: `GET /api/receipt/:actionId` liefert die
drei Herkunftsblöcke plus die ausgeschriebene Formel.
**Fertig, wenn:** jede XP-Zahl in der App zum Nachweis mit Formel führt.

### Phase 4 — Scan-Agent
**Vertrag:** `POST /api/scan` nimmt `{photoId, mode, lat, lon}` und liefert
`{category, subtype, confidence, estimatedVolumeM3, reusableProbability, reasoning[], suggestedRoute}`.
Zwei Adapter, `LLM_PROVIDER=groq|mock`. **Mock muss ohne Netz funktionieren** — das
ist die Bühnensicherung, nicht ein Nachgedanke.
**Fertig, wenn:** Foto → Kategorie + Konfidenz + Begründung in unter 6 s, und mit
`mock` im Flugmodus genauso.

### Phase 5 — FES
**Vertrag:** `integrations/fes/pickup.js` mit `categories() slots() book() cancel()`,
`integrations/fes/calendar.js` mit `dates(districtId)`. Beides mit
`tier: 'simulated'`. Eine `INTEGRATION.md` daneben: was FES liefern müsste.
**Echte Daten prüfen:** `fes-frankfurt.de` antwortet; Wertstoffhöfe liegen schon als
echte OSM-Orte in der DB (`GET /api/places?kind=wertstoffhof`).
**Fertig, wenn:** Buchung existiert, steht im Kalender, ist im Nachweis als
„simuliert" ausgewiesen.

### Phase 6 — Reparatur-Markt
**Vertrag:** `POST /api/market` (anbieten), `POST /api/market/:id/claim`,
`POST /api/market/:id/handover` — Gutschrift erst, wenn **beide Seiten** bestätigt
haben, über `award()` mit `tier: 'plausible'`.
**Fertig, wenn:** zwei Telefone eine Übergabe abschließen und beide gutgeschrieben
bekommen.

### Phase 7 — Quests
**Vertrag:** `POST /api/quests` (melden), `/claim`, `/submit`, `/review`.
Der Nachweis entsteht aus **vier Signalen**, nicht aus dem Modell allein: dHash
Vorher/Nachher, GPS-Abstand, Zeitabstand, Modellvergleich. Die Regeln entscheiden.
Karte: Leaflet + OSM-Kacheln, Attribution sichtbar.
**Fertig, wenn:** drei Telefone melden → erledigen → gegenprüfen und alle drei
dieselbe Begründung sehen.

### Phase 8 — Mobilität
**Vertrag:** `scripts/build-mobility-data.mjs` entpackt GTFS und liest die CSVs nach
`data/*.json`. `GET /api/mobility/stops`, `/departures`, `/routes`.
**Achtung:** AFZ ist cp1252 mit Dezimalkomma, EFA-Originalzeilen haben Koordinaten im
Rohformat — steht im Datenkatalog.
**Fertig, wenn:** eine Quest drei Routen mit ehrlichen CO₂-Zahlen aus echten
GTFS-Daten zeigt.

### Phase 9 — foodsharing und Vytal
**Vertrag:** foodsharing läuft schon über `/api/food/*` — nur noch Screens und
Relevanz-Sortierung. Vytal: `integrations/vytal/` mit der echten Ereignisform
(`event_id, container_id, partner_id, status`), Belohnung über `award()` mit
`eventKey: event_id` — das ist die Exactly-once-Garantie.
**Fertig, wenn:** eine echte foodsharing-Abholung im Nachweis mit `pickup_id` als
**„bestätigt"** steht.

### Phase 10 — Wirkung, Rangliste, Store
**Vertrag:** `GET /api/standings` steht schon. Dazu Saison, Perzentilband,
`POST /api/redeem`, `GET /api/integrations` (steht schon) als Screen.
**Fertig, wenn:** der Demo-Pfad auf einem fremden Handy komplett durchläuft.

---

## Wenn wirklich parallel gearbeitet wird

Ein Arbeitsverzeichnis und vier Sessions kollidieren trotz Dateibesitz bei
`npm install` und beim Build. Zwei Wege:

- **Empfohlen:** je Phase ein `git worktree` auf einem eigenen Branch
  (`git worktree add ../remain-p5 phase/5-fes`), am Ende zusammenführen.
- **Schneller, riskanter:** ein Verzeichnis, aber nur **eine** Person baut und
  deployt; die anderen schreiben nur Dateien und melden sich vor jedem `npm install`.
