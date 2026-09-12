# traffiq — Fahrplan und Wegevergleich

Phase 8. Beantwortet: *Wie komme ich zur Aktion, was kostet der Weg, und was macht
das mit der Gutschrift?*

## Daten neu bauen

```bash
node scripts/build-mobility-data.mjs            # braucht 7-Zip, siehe unten
node scripts/build-mobility-data.mjs --date=20250917 --force
```

Liest `Mobilitätsdaten/` und schreibt nach `server/data/mobility/`. Läuft in rund
7 Sekunden, davon der Großteil auf den 1,9 Mio Zeilen `stop_times.txt`. Der Server
liest danach nur noch JSON — beim Start wird kein CSV angefasst.

**7-Zip:** das Skript sucht `7z`/`7za` im PATH, dann die üblichen Windows-Pfade,
dann das npm-Paket `7zip-bin`. Sonst `MOBILITY_7Z` auf die Binärdatei zeigen lassen.
Das Entpackte liegt in `.cache/gtfs/` (gitignoriert) und wird beim zweiten Lauf
wiederverwendet.

## Was entsteht

| Datei | Größe | Inhalt |
|---|---:|---|
| `stations.json` | 162 KB | 816 Frankfurter Stationen mit Koordinaten, Linien, Verkehrsmitteln |
| `patterns.json` | 319 KB | 671 Linienmuster mit Fahrzeiten und allen Abfahrten des Betriebstags |
| `demand.json` | 17 KB | Tagesgang, Anfragen je Haltestelle, U-Bahn-Auslastung |
| `meta.json` | 2 KB | Quelldateien mit Prüfsummen, Zeilenzahlen, Annahmen |

Ein *Muster* ist eine Linie auf genau einer Haltefolge. Eine Fahrt kostet dann
zwei Zahlen statt einer Haltetabelle:

```
Abfahrt von Fahrt t an Station i  =  starts[t] + offsets[i]
```

So passen 245 828 echte Abfahrten in 319 KB. Werte über 86 400 sind der
Nachtverkehr und keine Überläufe.

## Endpunkte

```
GET /api/mobility/stops?lat=&lon=&r=&limit=
GET /api/mobility/departures?stopId=&at=HH:MM&limit=
GET /api/mobility/routes?questId=&fromLat=&fromLon=[&at=HH:MM]
GET /api/mobility/routes?fromLat=&fromLon=&toLat=&toLon=[&at=&baseXp=]
GET /api/mobility/meta
```

Fehlen die JSON-Dateien, antworten alle mit **503** und dem Befehl, der fehlt.
Der Server startet trotzdem.

## Was hier ehrlich ist und was nicht

- **Fahrplanzeiten sind echt** (`bestätigt`). Sie stammen aus dem gelieferten
  RMV-Export, Betriebstag 15.09.2025, gültig 12.07.–13.12.2025. Kein Echtzeit­betrieb,
  keine Verspätungen, keine Feiertagslogik.
- **Alle CO₂-Werte sind Schätzungen** (`Schätzung`) aus den Faktoren in
  `factors.js`, und jede Antwort trägt die Formel mit, aus der sie entstanden ist.
- **Die Suche steigt höchstens einmal um.** Quer durch die Stadt liefert sie
  damit eine Obergrenze, keine Bestzeit. Steht so in jeder Antwort.
- **Fahrzeiten je Muster sind Mediane** über alle Fahrten des Musters, nicht die
  Zeit der einzelnen Fahrt.
- **Stationen kommen aus dem DHID-Präfix** `de:06412:<n>`, weil `parent_station`
  im Export unvollständig ist — das sagt auch der Datenkatalog.

## Punkte

Dieser Ordner vergibt nichts. `engine/award.js` bleibt die einzige Stelle, an der
XP entstehen. `compare.js` sagt nur voraus, was der Weg von der Gutschrift abzieht.
Die eine Regel, die hier lebt, steht als `CAR_EARNS_NOTHING` in `factors.js` und
wird im UI ausgeschrieben statt versteckt.

## Offen für Phase 3

`factors.js` liest `engine/assumptions.js`, sobald es existiert, und fällt bis
dahin auf dieselben Werte unter denselben Namen aus `app/src/lib/impact.ts`
zurück. Die Antwort sagt in `assumptions.source`, welche der beiden Quellen
gerade gilt. Sobald Phase 3 liegt, kann der Fallback-Block ersatzlos weg.
