# FES — was die echte Schnittstelle liefern müsste

Dieser Ordner baut drei FES-Dienste nach: die Sperrmüll-Anmeldung, den
Abfuhrkalender und das Abfall-ABC. FES hat für diesen Block **keinen
Pflichtdatensatz** gestellt und den Nachbau ausdrücklich erlaubt. Alles, was
hier nachgebaut ist, trägt `source: 'simulated'` bis in die Oberfläche hinein —
in der App steht an jedem dieser Werte „simuliert", nie „bestätigt".

Dieses Dokument beschreibt die Naht: **was FES geben müsste, damit der Nachbau
gelöscht werden kann**, und was sich dabei am übrigen Code ändert. Antwort auf
das Letzte: nichts außerhalb dieses Ordners.

---

## Was wir am echten Dienst überprüft haben

`fes-frankfurt.de` antwortet (TYPO3, 200). Die Fachdienste liegen inzwischen
auf **frankfurtplus.de**, einem Laravel/Inertia-Portal:

| Weg | Ziel |
|---|---|
| `fes-frankfurt.de/sperrmuell` | → `frankfurtplus.de/sperrmuell-anmeldung/adresse` |
| `fes-frankfurt.de/abfall-abc` | → `frankfurtplus.de/abfall-abc` |

Die Routentabelle des Portals liegt im ausgelieferten HTML offen. Der echte
Ablauf und die echten Endpunkte sind damit bekannt — nicht geraten:

```
GET   /sperrmuell-anmeldung/adresse            Schritt 1  Adresse
GET   /sperrmuell-anmeldung/standort           Schritt 2  Stellplatz
GET   /sperrmuell-anmeldung/gegenstaende       Schritt 3  Gegenstände
GET   /sperrmuell-anmeldung/kontakt            Schritt 4  Kontakt
GET   /sperrmuell-anmeldung/bestatigung        Schritt 5  Bestätigung
GET   /api/sperrmuell/termine                  freie Termine
POST  /api/sperrmuell/anmeldung                Buchung
GET   /api/sperrmuell/verschieben/{a}/termine  Termine zum Verschieben
POST  /sperrmuell-anmeldung/verschieben/{a}    verschieben
POST  /sperrmuell-anmeldung/stornierung/{a}    stornieren
POST  /sperrmuell-anmeldung/reklamation/{a}    reklamieren
GET   /abfallkalender                          Kalender, adressbezogen
GET   /abfallkalender/{address}/ical           ICS
GET   /abfallkalender/{address}/html           HTML
GET   /abfall-abc  ·  /abfall-abc/{objekt}     Abfall-ABC
GET   /api/gruenschnitt/termine                Grünschnitt, eigene Tour
```

`GET /api/sperrmuell/termine` ohne Sitzung antwortet **302** auf die Startseite:
die freien Termine hängen an der im Wizard gespeicherten Adresse. Ohne Zugang
gibt es also keine Termine, und das Abfall-ABC ist eine clientseitig gerenderte
Anwendung ohne öffentliches JSON. Beides ist der Grund für diesen Ordner.

---

## Was daraus schon echt in ReMain steckt

- **Der Ablauf.** Adresse → Gegenstand → Termin → verbindliche Buchung mit
  Referenznummer, dazu Stornofrist. Nicht erfunden, sondern der von FES.
- **Die Trennung.** Elektro-Kleingeräte (mobile Sammlung) und Schadstoffe
  (Schadstoffsammlung) sind bei FES **eigene Dienste** und gehören nicht in
  eine Sperrmülltour. Grünschnitt hat eine eigene Anmeldung. ReMain lehnt
  diese Kategorien deshalb ab und weist den richtigen Weg, statt sie
  mitzubuchen.
- **Die Feiertage.** Hessische Feiertage werden aus dem Osterdatum berechnet
  (`dates.js`), nicht geschätzt. An Feiertagen und sonntags fährt FES nicht,
  die Tour rutscht auf den nächsten Werktag.
- **Die Orte.** Die zwölf Wertstoffhöfe im Wissen-Screen kommen aus
  OpenStreetMap (`GET /api/places?kind=wertstoffhof`), mit Adresse und
  Öffnungszeiten. Kein einziger davon ist erfunden.
- **Die Rechtsgrundlagen.** 2008/98/EG, KrWG, ElektroG, BattG, VerpackG,
  BioAbfV. Echte Zitate, keine Behauptung von FES.

## Was nachgebaut ist

| Wert | Datei | Annahme |
|---|---|---|
| Abfuhrtag je Stadtteil | `calendar.js` | aus der Stadtteil-ID abgeleitet, stabil, aber nicht von FES |
| Phase im 14-/28-Tage-Rhythmus | `calendar.js` | dito |
| Sperrmüll-Wochentag je Stadtteil | `pickup.js` | dito, Mo–Fr |
| freie Plätze je Termin | `pickup.js` | modelliert, keine echte Tourenplanung |
| Volumengrenze 6 m³ | `pickup.js` | FES veröffentlicht keine Zahl |
| Vorlauf 6 Tage, Storno bis 1 Tag vorher | `pickup.js` | modelliert |
| Zuordnung Gegenstand → Tonne | `abfall-abc.js` | von Hand geschrieben, am FES-ABC orientiert |

Die Rhythmen selbst (Restmüll wöchentlich, Bio wöchentlich, Papier
vierwöchentlich, Gelbe Tonne 14-täglich) sind die Frankfurter — aber ohne
Adressbezug bleibt es eine Näherung pro Stadtteil, und die App sagt das.

---

## Der Tausch

Vier Funktionen. Mehr berührt der Rest des Servers nie:

```js
// integrations/fes/pickup.js
categories()                                   -> { categories, maxVolumeM3, leadDays, source }
slots(districtId, volumeM3)                    -> { slots: [{ date, available, freeSlots, window }], source }
book({ address, districtId, categoryId,
       volumeM3, slotDate })                   -> { ok, reference, slotDate, window, instructions }
cancel(reference, { slotDate })                -> { ok, status }

// integrations/fes/calendar.js
dates(districtId, { from, perFraktion })       -> { dates: [{ date, fraktion, titel, window }], source }
nextDate(districtId, fraktionId)               -> { date, label, ... }
```

`routes/fes.js` speichert, belohnt und formt. Es kennt keine einzige Regel und
muss beim Tausch nicht angefasst werden.

### Damit `pickup.js` echt wird, braucht es von FES

1. **Adresse → Abfuhrbezirk.** Der Kern. Der echte Kalender hängt an der
   Adresse, nicht am Stadtteil; ohne diese Auflösung bleibt jeder Termin eine
   Näherung. Gebraucht: eine Straßen-/Hausnummer-Liste mit Bezirkszuordnung
   oder ein Endpunkt `GET /bezirk?strasse=&hausnummer=`.
2. **Freie Termine je Bezirk und Volumen** — `GET /api/sperrmuell/termine`,
   ohne Wizard-Sitzung aufrufbar, mit API-Schlüssel.
3. **Buchung** — `POST /api/sperrmuell/anmeldung`, Antwort mit
   **Auftragsnummer**. Sobald die kommt, wird aus `tier: 'simulated'` ein
   `tier: 'confirmed'`, und das ist die einzige Änderung an der Belohnung.
4. **Storno** — `POST /sperrmuell-anmeldung/stornierung/{auftrag}`.
5. **Verbindliche Grenzen** — maximales Volumen, Stückzahl bei Großgeräten,
   Vorlauffrist, Stornofrist. Heute je eine Konstante in `pickup.js`.

### Damit `calendar.js` echt wird

`GET /abfallkalender/{address}/ical` genügt. Ein ICS pro Adresse, einmal am Tag
geholt und gecacht, ersetzt die gesamte Rhythmus-Rechnerei — `dates()` liest
dann nur noch die Termine, die schon existieren.

### Damit `abfall-abc.js` echt wird

`GET /abfall-abc` als JSON — Objekt, Fraktion, Hinweis. Der Nachbau hat vierzehn
Einträge, das echte ABC einige hundert. `lookup()` bleibt, weil der Scan-Agent
aus Phase 4 mit freiem Vokabular ankommt und irgendetwas die Brücke bauen muss.

---

## Zwei Regeln, die beim Tausch nicht fallen dürfen

**Punkte entstehen nur in `engine/award.js`.** Dieser Ordner rechnet nie und
schreibt nie ins Verzeichnis. `routes/fes.js` ruft `award()` mit
`eventKey: 'fes:pickup:<Referenz>'` — dieselbe Buchung kann also nie zweimal
bezahlt werden, auch nicht nach Storno und Neubuchung.

**Storno nimmt keine XP zurück.** Das Verzeichnis ist append-only; eine
Gutschrift wird nie rückwirkend geändert. Die Antwort auf ein Storno sagt das
ausdrücklich, statt die Person es selbst herausfinden zu lassen.
