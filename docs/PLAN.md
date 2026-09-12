# ReMain — 8-Stunden-Runbook

**Team 02 · Frankfurt Impact Challenge (FES Hackathon 2026)**

Kanonisches Arbeitsdokument. Visuelles Design: [`design/`](../design/) und der Design-Canvas.

> **Realitätscheck.** In 8 Stunden entsteht keine vollständige Plattform. Es entsteht
> **ein Pfad, der komplett funktioniert**, plus so viel Breite drumherum, wie die Uhr
> zulässt. Jede Phase unten ist gegenüber der Vollversion bewusst beschnitten — was
> draußen bleibt, steht ausdrücklich dabei, damit niemand aus Versehen Zeit dort verbrennt.

---

## 1. Der Demo-Pfad

Das hier ist das Produkt. Alles andere ist Beiwerk. **Zuerst aufschreiben, dann bauen** —
jede Phase hat nur dann eine Daseinsberechtigung, wenn sie diesem Ablauf dient.

| # | Was das Jurymitglied tut | Welche Phase liefert das |
|---:|---|---|
| 1 | QR scannen, Name + Stadtteil eingeben, drin | 2 |
| 2 | Foto von einem Gegenstand im Raum machen | 4 |
| 3 | Sieht „Stuhl · Möbel · 87 % · hier ist warum" und drei Wege | 4 |
| 4 | Bucht die Sperrmüll-Abholung, sieht Termin und Gutschrift | 5 |
| 5 | Öffnet die Quest-Karte, sieht eine echte Quest im Raum | 7 |
| 6 | Übernimmt sie, macht das Nachher-Foto, sieht die Prüfbegründung | 7 |
| 7 | **Zweites Handy** bekommt die Gegenprüfung, antwortet — Gutschrift wird frei | 7 |
| 8 | Tippt die Punktzahl an → Nachweis: woher jede Zahl kommt | 3 |
| 9 | Löst Münzen gegen einen Gutschein ein, Code erscheint | 10 |

**Ohne 2, 3, 4, 7 und 10 gibt es keine Demo.** Das ist die Reihenfolge der Prioritäten,
wenn etwas schiefgeht.

---

## 2. Pre-Flight — jetzt sofort, parallel zu Phase 1

Diese fünf Dinge blockieren später und dauern zusammen 10 Minuten.

- [ ] **Groq-Account** → API-Key (kostenlos, Vision-Modell). Ersatz: OpenRouter-Key.
      **Modellnamen in der aktuellen Modellliste des Anbieters nachsehen** — die ändern sich.
- [ ] **Postgres** → Supabase-Projekt *oder* Render-Postgres anlegen, Connection-String kopieren.
- [ ] **Render** mit dem Repo verbinden.
- [ ] **Venue-Koordinaten** (Breite/Länge des Hackathon-Raums) — **alles** wird darum herum
      geseedet. Ohne das steht die Jury vor einer leeren Karte.
- [ ] **Drei Telefone** griffbereit, mindestens eins nicht das eigene.

### Schlüssel

Alle Schlüssel in `server/.env`. **Kein einziger bekommt ein `VITE_`-Prefix** — alles mit
diesem Prefix schreibt Vite beim Build in das JavaScript-Bundle und ist damit öffentlich.
Das gilt auch für den foodsharing-Team-Key, der heute genau so öffentlich im Bundle steht.

```
DATABASE_URL=postgres://...
LLM_PROVIDER=groq            # groq | mock
GROQ_API_KEY=...
GROQ_VISION_MODEL=...        # aktuelle Liste prüfen
FS_API_KEY=team_02_88829cd2c44749b796a70dfbf7dce344
FS_API_BASE=https://app-foodsharing-hackathon.azurewebsites.net
SESSION_SECRET=...
VENUE_LAT=50.1...
VENUE_LON=8.6...
```

### Stack — nicht mehr diskutieren, es läuft die Uhr

| Schicht | Wahl |
|---|---|
| Frontend | vorhandenes `app/` (React 19 + Vite + TS) + `react-router-dom` + `leaflet` |
| Backend | `server/` — Fastify, ein Prozess, liefert auch das gebaute Frontend aus |
| DB | Postgres, `pg` + **eine** `schema.sql`, beim Start ausgeführt. Keine Migrationstools |
| Fotos | clientseitig auf ≤ 1280 px / ~180 KB verkleinert, als `bytea` in Postgres |
| LLM | zwei Adapter: `groq` und `mock`. Mehr nicht |
| Karte | Leaflet + OSM-Kacheln, Attribution sichtbar |
| Hosting | ein Render-Web-Service |

> **Render Free Tier schläft nach 15 Minuten ein** und braucht dann ~50 s zum Aufwachen.
> **Fünf Minuten vor der Präsentation die URL aufrufen.** Auf den Wecker schreiben.

### Aufteilung im Team

| Personen | Aufteilung |
|---|---|
| 1 | Strikt der Reihe nach. Ab Checkpoint 3:55 nur noch 7 und 10 |
| 2 | **A:** 2 → 3 → 4 → 9 (Server, Engine, Agent) · **B:** 1 → 5 → 6 → 10 (Screens) · beide zusammen 7 |
| 3+ | zusätzlich **C:** 7 vorbereiten (Leaflet, dHash), danach Testen und Demo-Probe |

---

## 3. Zeitplan

| Zeit | Phase | Dauer |
|---|---|---:|
| 0:00 – 0:45 | **1** Shell und Design-System | 45 min |
| 0:45 – 1:35 | **2** Backend, Datenbank, Identität | 50 min |
| 1:35 – 2:15 | **3** Engine: Wirkung, Belohnung, Nachweis | 40 min |
| 2:15 – 3:10 | **4** Scan-Agent | 55 min |
| 3:10 – 3:55 | **5** FES: Abholung und Kalender | 45 min |
| **3:55 – 4:10** | **Checkpoint** — deployen, auf echtem Handy testen, Streichliste ziehen | 15 min |
| 4:10 – 4:50 | **6** Reparatur-Markt | 40 min |
| 4:50 – 6:00 | **7** Quests auf echter Karte | 70 min |
| 6:00 – 6:30 | **8** Route und Mobilität | 30 min |
| 6:30 – 7:05 | **9** foodsharing und Vytal | 35 min |
| 7:05 – 7:45 | **10** Wirkung, Rangliste, Store, Feinschliff | 40 min |
| 7:45 – 8:00 | **Demo-Probe und Pitch** | 15 min |

### Streichleiter

Wer beim Checkpoint hinten liegt, streicht **in dieser Reihenfolge: 8 → 6 → 9.** Jede
gestrichene Phase wird eine Folie mit einem Screenshot aus dem Design-Canvas — „gebaut ist
das hier, geplant ist das da" ist eine ehrliche und starke Aussage. **7 und 10 werden nie
gestrichen**, sie sind die Geschichte.

### Unverhandelbar, auch wenn die Zeit knapp wird

1. `LLM_PROVIDER=mock` funktioniert und ist getestet — ohne Netz, ohne Rate-Limit.
2. Die App ist geseedet und nie leer.
3. Der Nachweis funktioniert für mindestens eine Aktion.
4. Der Dienst ist zur Präsentation wach.

---

## 4. Die zehn Phasen

### Phase 1 — Shell und Design-System · 0:00–0:45

**Ziel:** die App sieht fertig aus, bevor sie etwas kann.

**Drin**
- Mainwasser-Tokens aus `design/parts/_shared.css` → `app/src/styles/tokens.css`
- Schriften per Google-Fonts-`<link>` (Schibsted Grotesk, Bricolage Grotesque)
- Icons als React-Komponenten — die Pfade liegen fertig in `design/build.mjs`
- Komponenten: `Card`, `Chip`, `Button`, `Tag` (drei Herkunftsstufen), `Coin`, `Bar`,
  `Sheet`, `TabBar`, `Screen`
- `react-router-dom`, fünf Tabs mit Unterrouten
- Deutsche Strings in `app/src/lib/de.ts` — ein Objekt, keine Bibliothek
- Bestehendes `Login.tsx` weiterverwenden, nicht neu schreiben

**Draußen:** selbst gehostete Schriften, Dark-Mode-Feinschliff, Installations-Prompt,
Animationen, Leerzustände.

**Fertig, wenn:** alle fünf Tabs auf einem echten Handy über das LAN navigierbar sind.

---

### Phase 2 — Backend, Datenbank, Identität · 0:45–1:35

**Ziel:** die Jury benutzt die App auf ihren eigenen Geräten und sieht sich gegenseitig.

**Drin**
- `server/` mit Fastify: `/api/*` plus Auslieferung von `app/dist`
- **Eine** `schema.sql`, beim Start ausgeführt. Elf Tabellen:
  `users, districts, photos, actions, quests, quest_submissions, peer_reviews,
   market_items, pickups, ledger_entries, redemptions`
- **Identität ohne Hürde:** Name + Stadtteil, Gerät bekommt ein signiertes Cookie.
  Kein Passwort, keine E-Mail
- `POST /api/photos` — Größe und Typ prüfen, EXIF verwerfen bis auf Zeit und Koordinaten
- foodsharing-**Proxy** `/api/food/*` — Key raus aus dem Bundle
- **Seed rund um die Venue-Koordinaten:** 6 Quests, 8 Marktartikel, Abfuhrzyklen für
  4 Stadtteile, 4 Gutscheine. Die App darf nie leer sein
- Deploy auf Render, öffentliche URL, QR-Code ausdrucken

**Draußen:** Rollen jenseits von `citizen`, Migrationswerkzeuge, Object Storage,
Rate-Limiting.

**Fertig, wenn:** zwei Telefone sich über die öffentliche URL anmelden und dieselben
Quests sehen, und ein Neustart nichts löscht.

---

### Phase 3 — Engine: Wirkung, Belohnung, Nachweis · 1:35–2:15

**Ziel:** die Glaubwürdigkeit. Kommt **vor** den Features, damit alles daran andockt.

**Drin**
- `server/src/engine/` ist die einzige Stelle, an der Punkte entstehen. Der Client rechnet nie
- `assumptions.ts` — alle Faktoren an einem Ort, jeder mit Quelle
- `impact.ts` — Netto-Rechnung, portiert aus `app/src/lib/impact.ts` (existiert schon)
- `rewards.ts` — Nachweisstufen, Tageslimit 3, Wiederholungsdämpfer, Exactly-once über
  Ereignis-ID
- `ledger_entries` **append-only**: jede Gutschrift eine Zeile mit Grund, Herkunftsstufe,
  Aktionsverweis
- `GET /api/receipt/:actionId` + **Nachweis-Screen** mit ausgeschriebener Formel

**Draußen:** Saisons, Fehler-Provokations-Screen, Perzentilrechnung (kommt in 10).

**Fertig, wenn:** man eine beliebige XP-Zahl antippen kann und beim Nachweis mit der Formel
landet.

---

### Phase 4 — Scan-Agent · 2:15–3:10

**Ziel:** ein Foto, drei mögliche Wege, immer mit Begründung.

**Drin**
- Kamera-Screen, clientseitiges Verkleinern, Upload
- `POST /api/scan` → Adapter `groq` **oder** `mock`, gesteuert über `LLM_PROVIDER`
- Antwort strikt als JSON-Schema:
  `category, subtype, confidence, estimated_volume_m3, reusable_probability,
   reasoning[], suggested_route`
- **`mock` ist Bühnensicherheit, kein Notnagel.** Deterministische Fixtures, von Anfang an
  mitgebaut und getestet. Ein Schalter zeigt, welcher Anbieter antwortet
- Ergebnis-Screen: Kategorie, Konfidenz, **Begründung im Klartext**, Herkunftsstufe
  „Schätzung", drei Wege mit Punktvorschau, „Falsch erkannt?" mit Protokollierung

**Draußen:** Ollama, OpenRouter, Gefahrstofflogik, Mehrfachobjekte in einem Bild.

**Fertig, wenn:** das Foto eines Stuhls in unter sechs Sekunden zu „Möbel, 87 %" plus drei
Wegen führt — und mit `LLM_PROVIDER=mock` im Flugmodus genauso.

---

### Phase 5 — FES: Abholung und Kalender · 3:10–3:55

**Ziel:** von „steht auf dem Gehweg" zu „ist angemeldet" in unter einer Minute.

**Drin**
- **Sperrmüll-Buchung:** Adresse (GPS, von der Person bestätigt) → Bezirk → Kategorie und
  Volumen aus der Klassifikation → freie Termine → Buchung → Referenznummer
- **Abfuhrkalender als Liste** — je Bezirk Rest, Bio, Papier, Gelbe Tonne, Sperrmüll
- Der Agent trägt die Buchung selbst ein und markiert sie als **„eingetragen"**, nicht als
  „bestätigt". Der Unterschied bleibt sichtbar
- `server/src/integrations/fes/INTEGRATION.md`: vier Methoden — `categories`, `slots`,
  `book`, `cancel` — und was FES liefern müsste, damit der echte Dienst andockt

**Draußen:** ICS-Export, Monatsraster, Wertstoffhöfe auf der Karte, Stornierung im UI,
Erinnerungen.

**Fertig, wenn:** eine Buchung existiert, im Kalender steht und im Nachweis als
„simuliert" ausgewiesen ist.

---

### ⏸ Checkpoint · 3:55–4:10

1. Auf Render deployen und **auf einem echten Handy** durchklicken, nicht im Simulator.
2. Den Demo-Pfad Schritte 1–4 komplett durchspielen.
3. **Streichliste ziehen.** Liegt ihr hinter dem Plan: 8 streichen. Weiter hinten: 6. Noch
   weiter: 9.
4. Erst danach weiterbauen. Ein Checkpoint, der übersprungen wird, rächt sich um 7:30.

---

### Phase 6 — Reparatur-Markt · 4:10–4:50 · *streichbar*

**Ziel:** das Ding mit dem kleinen Defekt landet bei jemandem, der es reparieren kann.

**Drin**
- Anbieten direkt aus dem Scan; der Agent schlägt Kategorie und Wiederverwendbarkeit vor
- Defekt-Tags statt Freitext: `Pumpe defekt`, `Akku schwach`, `Lehne lose`
- Liste mit Filter nach Kategorie und Entfernung
- Ablauf: einstellen → reservieren → **beide bestätigen die Übergabe** → erst dann
  Gutschrift für beide Seiten
- Keine Preise, kein Weiterverkauf in der App

**Draußen:** Betriebsansicht, Sammelrouten, Kartenansicht, 7-Tage-Automatik, Chat.

**Fertig, wenn:** zwei Telefone eine Übergabe abschließen und beide korrekt gutgeschrieben
bekommen.

---

### Phase 7 — Quests auf echter Karte · 4:50–6:00

**Ziel:** das Herzstück. Melden, übernehmen, nachweisen, gegenprüfen.

**Drin**
- **Leaflet + OSM-Kacheln**, Umkreisfilter, sichtbare Attribution
- **Melden:** Foto + Position + Kategorie aus dem Agenten
- **Übernehmen:** die Quest gehört für zwei Stunden der Person, die sie übernimmt
- **Nachweis — und hier liegt der Unterschied:** nicht das Modell entscheidet, sondern
  vier Signale zusammen:
  1. perzeptueller Hash (dHash) Vorher/Nachher — derselbe Ort?
  2. GPS-Abstand zum Meldepunkt
  3. Zeitabstand zum Quest-Start
  4. Modell-Vergleich mit Begründung im Klartext

  Die **Regeln entscheiden**, das Modell liefert eine Einschätzung. Genau das ist der
  Unterschied zwischen „die KI sagt ja" und einem belastbaren Nachweis — und genau danach
  fragt die Aufgabe
- **Gegenprüfung:** wer im Umkreis ist, bekommt eine Frage — ja, nein, kann ich nicht
  sehen. Anonym, zwei übereinstimmende Antworten geben frei, +15 XP
- Nicht die eigene Quest prüfen, nicht zweimal dieselbe
- Statuskette sichtbar: gemeldet → übernommen → eingereicht → bestätigt

**Draußen:** Marker-Cluster, Push-Nachrichten (nur In-App-Hinweis), zufällige Auswahl der
Prüfenden, Quest-Kategorien jenseits von Müll.

**Fertig, wenn:** drei Telefone melden → erledigen → gegenprüfen und alle drei im Nachweis
dieselbe Begründung sehen.

---

### Phase 8 — Route und Mobilität · 6:00–6:30 · *zuerst streichbar*

**Ziel:** der Weg zur Aktion ist Teil der Wirkung, nicht ihr blinder Fleck.

**Drin**
- `scripts/build-mobility-data.mjs`: GTFS entpacken, `haltestellen_avg.csv` und
  `tagesgang_avg.csv` einlesen → kompakte JSON-Dateien nach `data/`.
  Achtung: AFZ ist cp1252 mit Dezimalkomma, die EFA-Originalzeilen haben Koordinaten im
  Rohformat — beides steht im Datenkatalog
- Nächste Haltestellen und nächste Abfahrten aus GTFS
- **Vier Routenoptionen** zur Aktion mit Zeit, CO₂-Differenz und Punktwirkung.
  Auto zeigt offen **0 XP und warum**

**Draußen:** Ride2Impact-GPS-Abgleich (wird eine Folie), Gemeinschafts-Mobilitätsansicht,
E-Scooter-Daten.

**Fertig, wenn:** eine Quest drei Routen mit ehrlichen CO₂-Zahlen aus den echten GTFS-Daten
zeigt.

---

### Phase 9 — foodsharing und Vytal · 6:30–7:05 · *streichbar*

**Ziel:** die beiden echten Schnittstellen sauber anschließen.

**Drin — foodsharing (live)**
- Fairteiler und Körbe im Umkreis über den Proxy, sortiert nach **Relevanz**
  (Netto-Wirkung pro Aufwandsminute, Ablauf gewichtet), nicht nach Entfernung
- Ablauf: anfragen → Abholung abschließen → Historie
- Verifikationszustand abbilden: Geschäftsrettungen bleiben gesperrt, solange
  `is_verified` false ist — **mit Erklärung statt stiller Fehlermeldung**
- Fehlerfälle bewusst behandeln: 400 eigener Korb, 409 vergeben, 403 fehlende Verifikation

**Drin — Vytal**
- Aktiver Behälter, Rückgabefrist, Rückgabe scannen
- **Genau einmal** belohnt, abgesichert über `event_id`
- Ohne Sandbox-Zugang identische Ereignisform, im Nachweis als „simuliert" markiert

**Draußen:** „Auf meinem Weg"-Umwegrechnung (einfache Entfernung reicht), Vytal-Partnerkarte,
foodsharing-Korb anbieten.

**Fertig, wenn:** eine echte foodsharing-Abholung über die Live-API abgeschlossen ist und im
Nachweis mit `pickup_id` und Server-Zeitstempel als **„bestätigt"** steht. Das ist der
einzige Punkt im ganzen Produkt, an dem eine externe Schnittstelle unser Wort bestätigt —
den zeigt ihr der Jury.

---

### Phase 10 — Wirkung, Rangliste, Store, Feinschliff · 7:05–7:45

**Ziel:** der Grund, warum jemand wiederkommt — und der Schliff, der über den Eindruck
entscheidet.

**Drin**
- **Wirkung persönlich:** Aktionen (bestätigt), Menge (deine Angabe), CO₂e (Schätzung),
  Wochen in Folge — jede Zahl mit ihrer Herkunftsstufe
- **Wirkung gemeinsam:** Wochenziel für Frankfurt mit Fortschritt
- **Stadtteil-Tabelle** mit Platz, Trend und eigenem Anteil als **Perzentilband**, dazu
  **„So kommt euer Stadtteil nach vorn"** mit drei konkreten nächsten Aktionen samt
  Punktdelta. Das ist der Wiederkommen-Motor: nicht „du bist Platz 7", sondern
  „zwei offene Quests, 900 m, +240"
- **Belohnungs-Store:** Katalog, Kosten in Münzen, Einlösen erzeugt einen Code
- Drei Abzeichen
- **Einstellungen → Integrationen:** die Tabelle aus Abschnitt 5, live
- Feinschliff: Ladezustände, Leerzustände, deutsche Fehlermeldungen in ganzen Sätzen,
  Offline-Hinweis

**Draußen:** Saisons, Erinnerungen, Onboarding-Karussell, weitere Abzeichen.

**Fertig, wenn:** der komplette Demo-Pfad auf einem Handy läuft, das die App noch nie
geöffnet hat.

---

### Demo-Probe und Pitch · 7:45–8:00

1. **Dienst aufwecken.** URL aufrufen, warten, bis sie schnell antwortet.
2. Demo-Pfad **zweimal** durchspielen, einmal davon mit `LLM_PROVIDER=mock`.
3. Ein geseedetes Konto mit Historie bereitlegen, falls live etwas klemmt.
4. Drei Folien: **das Problem** (Sperrmüll steht wochenlang) — **die Schleife**
   (ein Foto, vier Wege) — **der Nachweis** (warum man uns die Zahlen glauben kann).
5. Gestrichene Phasen als Screenshots aus dem Design-Canvas — geplant, nicht behauptet.

---

## 5. Integrationsregister

Auch ein Screen in der App, damit niemand raten muss, was echt ist.

| Dienst | Status | Nahtstelle |
|---|---|---|
| **foodsharing API** | 🟢 echt | `integrations/foodsharing/` — läuft über den Proxy |
| **traffiQ / GTFS** | 🟢 echt (Dateien) | vorverarbeitet nach `data/` |
| **OpenStreetMap** | 🟢 echt | Leaflet; bei Last eigener Tile-Server |
| **Vytal** | 🟡 Sandbox, sonst nachgebaut | `integrations/vytal/` — Ereignisform ist schon die echte |
| **FES Sperrmüll-Termine** | 🔵 nachgebaut | `fes/pickup.ts` — `categories`, `slots`, `book`, `cancel` |
| **FES Abfuhrkalender** | 🔵 nachgebaut | `fes/calendar.ts` — pro Adresse ein Bezirk |
| **FES Abfall-ABC** | 🔵 nachgebaut | `fes/waste-abc.ts` — Wissensbasis als JSON |
| **Fahrtauskunft** | 🔵 aus GTFS gerechnet | `traffiq/departures.ts` |
| **Gutschein-Partner** | 🔵 nachgebaut | `integrations/rewards/` |

**Regel für alles Nachgebaute:** gleiche Feldnamen, gleiche Statuswerte, gleiche Fehlerfälle
wie der echte Dienst. In der App trägt jeder nachgebaute Wert die Kennzeichnung
**„simuliert"** — nie „bestätigt". Damit ist der Austausch später eine Adapterdatei und
keine Umbauaktion.

## 6. Das Regelwerk

**Herkunft jeder Zahl:** `bestätigt` (aus einer Schnittstelle) · `deine Angabe`
(eingetippt, nicht prüfbar) · `Schätzung` (aus offengelegter Annahme gerechnet).
Eine Schätzung wird nie als Messwert dargestellt.

**Zwei Währungen:** **XP** für Level und Status, nicht ausgebbar · **Münzen** für
Gutscheine, 10 XP ≈ 1 Münze.

**Sperren gegen Fehlanreize**
- höchstens drei bewertete Aktionen pro Tag
- ab der dritten Aktion am selben Ort am selben Tag halbe Punkte
- **netto statt brutto**: Anfahrts-CO₂ wird abgezogen; netto negativ = null Punkte
  **plus Erklärung, wie es positiv würde**
- jedes Partner-Ereignis über seine Ereignis-ID genau einmal belohnt
- Münzen nicht kaufbar, nicht übertragbar, laufen nicht ab
- **keine Rangliste von Personen** — Stadtteile werden verglichen, alle Punkte zählen
  zusammen auf ein Stadtziel; die eigene Position erscheint als Perzentilband

## 7. Was wir bewusst nicht bauen

Rangliste von Personen · Kauf oder Handel von Münzen · Preise im Markt ·
Dauer-Standortverfolgung · Chat · erfundene Zahlen, die wie Messwerte aussehen.
