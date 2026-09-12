# Der Scan-Agent (Phase 4)

Ein Foto rein, eine geprüfte Einschätzung raus. Zwei Anbieter hinter einer
Funktion, gesteuert über `LLM_PROVIDER` in `server/.env`.

```
routes/scan.js ──> agent/index.js ──> agent/groq.js   (LLM_PROVIDER=groq)
                                  └─> agent/mock.js   (LLM_PROVIDER=mock, immer als Rückfall)
                        │
                        └─ agent/contract.js  prüft die Antwort, bevor sie jemand sieht
                           agent/taxonomy.js  Kategorien, Wege, Gefahrstoff-Regeln
                           agent/prompt.js    was dem Modell gesagt wird
```

## Die drei Regeln, an denen hier nichts gedreht wird

1. **Rohe Modellausgabe erreicht nie die App.** Alles geht durch
   `normalize()` in `contract.js`. Unbekannte Kategorie, Konfidenz als 87
   statt 0.87, Volumen in Litern, Antwort in einem Code-Block — all das wird
   dort gerade gezogen, und was unbrauchbar bleibt, fällt auf einen
   vertretbaren Standard zurück statt auf der Bühne zu werfen.
2. **`mock` ist die Bühnensicherung, kein Notnagel.** Kein Netz, keine
   Schlüssel, deterministisch über die Bildbytes: dasselbe Foto ergibt
   dieselbe Antwort. Schlägt `groq` fehl, antwortet der Fundus und die App
   sagt es (`agent.fallback`, `agent.note`).
3. **Ein Scan verdient nichts.** Punkte entstehen nur in `engine/award.js`,
   und erst an der Aktion, zu der ein Scan führt. Die einzige Ausnahme ist
   die Gefahrstoff-Meldung — siehe unten, und sie bestätigt die Regel.

## Gefahrstoffe sind ein eigener Weg, keine rote Kategorie

FES ist da eindeutig: Schadstoffe gehören in die Schadstoffsammlung, werden
von Fachleuten angenommen und **persönlich übergeben** — nie irgendwo
abgestellt. Für Sammeltage schreibt FES ausdrücklich, dass Farbeimer, Ölkanister
und Autobatterien **nicht** eingesammelt werden sollen; stattdessen soll der
Fundort gemeldet werden.

Quelle: <https://frankfurtplus.de/mobile-dienste/schadstoffsammlung>

Deshalb:

- `hazard: true` an der Kategorie `schadstoff` in `taxonomy.js`.
- `routeFor()` prüft das **vor** dem Modus. Ein Gefahrstoff wird nie eine
  Quest, nie eine Abholung, nie ein Marktangebot — egal, aus welchem Modus
  die Person kam.
- `HAZARD_TERMS` in `taxonomy.js` überschreibt die Kategorie des Modells,
  sobald irgendwo in Subtyp oder Begründung ein Gefahrenwort auftaucht. Die
  Liste ist absichtlich zu großzügig: ein Umweg zum Wertstoffhof kostet eine
  Person Zeit, ein aufgehobener Lösungsmittelkanister kostet sie mehr.
- `DANGER_TERMS` trennt „melden" von „112 anrufen". Nur bei Auslaufen,
  Dämpfen, Feuer oder Verletzten zeigt die App den Notruf.
- Die drei Wege: Abgabestelle finden (echter Wertstoffhof aus OSM, mit
  Adresse und Öffnungszeit), offiziell melden (FES), sichere Meldung
  speichern. Nur die Meldung bringt Punkte, **10 XP**, über `award()`.
  `eventKey: hazard:<photoId>` macht daraus eine Einmalzahlung.

## API

```
POST /api/scan                         { photoId, mode, lat?, lon?, fixture? }
GET  /api/scan/status                  welcher Anbieter gerade antworten würde
GET  /api/scan/:photoId                die letzte Einschätzung zu dem Foto
POST /api/scan/:photoId/gefahrmeldung  dokumentierter Gefahrstoff-Fund
POST /api/scan/:photoId/korrektur      { category, subtype? }
```

`fixture` gilt nur für `mock` und erzwingt ein bestimmtes Ergebnis
(`stuhl`, `farbeimer`, `autobatterie` …) — für die Vorführung. Die Liste
steht in `GET /api/scan/status`.

## Was hier absichtlich fehlt

- **Kein Cache in der Datenbank.** Die Einschätzungen liegen in einer Map im
  Prozess (200 Stück). Ein Neustart vergisst sie, und `/erkannt/:photoId`
  zeigt dann „keine Erkennung mehr". `schema.sql` ist fertig und gehört
  allen Phasen — dafür wird sie nicht angefasst.
- **Korrekturen gehen nach `server/data/scan-corrections.jsonl`**, aus dem
  gleichen Grund. Append-only, eine Zeile JSON pro Korrektur.
- Ollama und OpenRouter, Mehrfachobjekte in einem Bild: Phase 4 ist dafür
  nicht zuständig.
