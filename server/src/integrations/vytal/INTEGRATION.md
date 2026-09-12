# Vytal — die echte Anbindung

Bis zur Sandbox-Freigabe stand hier ein Nachbau. Der ist weg. Was hier läuft,
ist die **Vytal Merchant-API**, und jeder Wert trägt deshalb `tier: 'confirmed'`.

Quelle: *Vytal x FES Hackathon – Technical Documentation* (Notion), abgerufen
am 12.09.2026. Ansprechpartner: Stephan Rüschenbaum, stephan.rueschenbaum@vytal.org.

## Das eine Detail, aus dem alles folgt

**Der Token gehört einer Filiale, nicht einer App.** Vytal stellt JWTs pro
Store aus. Daraus folgt dreierlei, und die Oberfläche muss das abbilden statt
es zu verstecken:

- Eine Ausgabe geht auf den **Bestand unserer Station**. Es gibt kein Lokal
  auszuwählen — der Token sagt schon, welches gemeint ist.
- `ContainerReturn` nimmt **weder `userId` noch Store** entgegen. Der Token
  bestimmt, wo der Behälter landet. Wer über ReMain zurückgibt, gibt **bei
  uns** zurück.
- ReMain ist damit kein Gast im Vytal-Netz, sondern **selbst eine Station**.

Das Filialverzeichnis zeigt trotzdem die echten Vytal-Partner in der Nähe —
als das, was sie sind: das Netz, zu dem der Behälter gehört. Nicht als
Rückgabeorte, die wir buchen könnten.

> Geprüft am 12.09.2026: Im Umkreis von 50 km um Frankfurt gibt es **keine**
> Vytal-Rückgabeboxen (`RETURN_BOX`, `SERVICED_RETURN_BOX_*` liefern null
> Treffer, während `RESTAURANT` 50 liefert — der Filter greift also).

## Zwei Dienste, zwei Regeln

| | Merchant-API | Filialverzeichnis |
|---|---|---|
| Host | `merchantapi.vytal.org` | `colugo.vytal.org` |
| Protokoll | REST | GraphQL |
| Auth | `Authorization: Bearer <JWT>` | `Authorization: ANONYMOUS` (wörtlich) |
| Geheim? | **Ja** — nur Server | Nein, öffentliche Daten |
| Fehler | HTTP-Status **und** `result`-Feld | HTTP **200** mit `errors`-Array |

Beide Fehlerkonventionen sind Fallen. Ein `response.ok` allein übersieht
`STORE_NOT_FOUND` beim Verzeichnis **und** ein `result: "…"` ungleich
`Success` bei der Merchant-API. `client.js` und `stores.js` prüfen beides.

## Die Endpunkte

| Datei | Methode | Vytal |
|---|---|---|
| `users.js` | `ensureVytalUser(userId)` | `POST /api/3/ReferencedAnonUser/Create?userId=` |
| `index.js` | `checkCode(code)` | `GET /api/3/Container/CheckCode?code=` |
| `index.js` | `checkout({vytalUserId, qrCodes, transactionId})` | `POST /api/3/Containers/Checkout` |
| `index.js` | `returnContainer({qrCodes, transactionId})` | `POST /api/3/Container/ContainerReturn` |
| `index.js` | `containers(vytalUserId)` | `GET /api/3/ContainerHistory/GetUserContainers` |
| `index.js` | `co2Saved(vytalUserId)` | `GET /api/3/Sustainability/GetUserCo2SavingsForStore` |
| `index.js` | `stock()` | `GET /Merchant/GetStoreStock` — ohne `/api/3`, so steht es in der Doku |
| `stores.js` | `nearby({lat, lon})` | GraphQL `nearestVytalStores` |
| `stores.js` | `search({query})` | GraphQL `storeSearch` |

## Konto-Anlage

`ReferencedAnonUser/Create` ist laut Doku **genau einmal pro Person** zu
rufen. Es gibt keine Suche nach der Referenz, mit der man sich davon erholen
könnte: ein zweiter Ruf legt eine zweite Vytal-Person an, und die Behälter der
ersten verschwinden aus unserer Sicht. Deshalb steht die UUID in
`vytal_users` — eine Tabelle, kein Cache.

Angelegt wird **faul**, beim ersten Scan. Niemand wird bei einem Partner
angemeldet, weil er die App geöffnet hat.

Über die Leitung geht `remain-<id>`. Kein Name, keine Mailadresse, kein
Google-Konto. Vytal nennt diese Nutzer anonym, und das bleiben sie.

## Genau einmal bezahlen

Zwei verschiedene Schlüssel, zwei verschiedene Aufgaben — das wird leicht
verwechselt:

**`transactionId`** macht den *Aufruf bei Vytal* idempotent. Wir würfeln ihn
beim Scan, schreiben ihn nach `vytal_transactions`, und der Bestätigen-Knopf
gibt ihn zurück. Ein Wiederholungsversuch nach einem Timeout bucht damit
keinen zweiten Behälter.

**`cycleKey(containerId, checkoutTime)`** macht die *Belohnung* einmalig. Er
ist der `event_key` im Ledger. Nicht die Behälter-ID allein: Behälter werden
wiederverwendet, dieselbe Schale kommt nächsten Monat wieder, und jede
Ausleihe verdient ihre eigenen 20 XP. Der Ausleihzeitpunkt trennt die Runden.

Reihenfolge in `routes/vytal.js` ist deshalb: **erst** die Runde lesen
(solange der Behälter noch aktiv ist), **dann** buchen, **dann** gutschreiben.
Nach der Rückgabe ist der Behälter in einer anderen Liste und der Schlüssel
nicht mehr zu ermitteln.

## Was die Oberfläche zeigen muss

- `returnDeadline` kommt von Vytal und ist maßgeblich. Nicht selbst
  `Ausleihe + 14 Tage` rechnen — `LOAN_DAYS` ist nur Anzeigetext.
- Die Liste **`sold`**: Behälter, die nicht zurückkamen und abgerechnet
  wurden. Wer das versteckt, lässt es die Leute vom Kontoauszug erfahren.
- `creditsOnReturn` ist **Vytals** Guthaben, nicht unsere Münzen. Nie
  vermischen.
- `co2SavedKg` ist eine Messung des Partners — die einzige Zahl auf dem
  Schirm, unter der keine Annahme stehen muss. Aber: nur Behälter, die
  **unsere** Station ausgegeben hat und die zurückkamen.

## Codes nie im Browser prüfen

Die Doku sagt es ausdrücklich: Es sind viele Alt-Formate im Umlauf, die
Prüfung gehört ins Backend. Die App schickt den **rohen** Decode an
`POST /api/vytal/scan` und entscheidet nichts selbst. `CheckCode` antwortet
mit `type: Container | User | Invalid` — ein Vytal-*Nutzercode* ist etwas, das
jemand tatsächlich vor die Kamera hält, und wird eigens abgefangen.

## Der `service`-Claim im Token

Der Store-Token trägt ein Feld, das nirgends in der Doku steht und das
trotzdem darüber entscheidet, ob die Anbindung überhaupt läuft: **`service`**.

Der erste Token für Store B trug `service: "other"`. Damit beantwortete
`ReferencedAnonUser/Create` **jeden** Versuch mit 400 `ServiceNameRequired` —
egal ob der Dienst als Query, im Body oder als Header mitging. Alle anderen
Endpunkte akzeptierten genau denselben Token anstandslos. Weil aber jede
Vytal-Route zuerst die Vytal-Identität der Person braucht, stand damit der
ganze Mehrweg-Schirm still.

Am 12.09.2026 hat Vytal den Token mit `service: "qnips"` neu ausgestellt.
Ohne eine Zeile Änderung auf unserer Seite legt `Create` seitdem Konten an.

> Merke: `ServiceNameRequired` ist **kein** Fehler in unserer Anfrage.
> Payload dekodieren, `service` lesen, bei Vytal einen neuen Token holen.
> `scripts/vytal-probe.mjs` gibt den Claim jetzt im Kopf mit aus.

## Live geprüft am 12.09.2026

Mit dem neuen Token gegen `merchantapi.vytal.org`, über unsere eigenen Routen:

| Endpunkt | Antwort |
|---|---|
| `ReferencedAnonUser/Create` | `success: true` + UUID |
| `GetUserContainers` | 200 — `active` / `returned` / `sold`, alle leer |
| `GetUserCo2SavingsForStore` | 200 — `co2SavedKg: 0` |
| `GetStoreStock` | 200 — **`[]`** |
| `CheckCode` | 200 auf einen echten Behälter (`HTTP://VYT.TO/KYBOG9`) |
| `Checkout` | `result: "Success"` — echter Becher, echte Ausgabe |

**`GetStoreStock` ist keine Voraussetzung.** Das Regal meldet `[]`, und die
Ausgabe lief trotzdem durch: Behälter `Cup M 300ml` / `KYBOG9`, gebucht auf
„[Demo] FES Hackathon – Store B". Wer aus der leeren Bestandsliste schließt,
Mehrweg gehe nicht, schließt falsch — gescannt wird der Behälter in der Hand,
nicht ein Eintrag in einer Liste.

Was damit **noch nicht** geprüft ist: `ContainerReturn` **über unsere Route**.
Der Becher oben wurde 16 Sekunden nach der Ausgabe zurückgegeben — aber nicht
durch ReMain: in `vytal_transactions` steht dazu keine Zeile mit
`kind = 'return'`. Damit ist auch `award()` auf diesem Weg noch nie live
gelaufen, und der Zyklus hat keine 20 XP gutgeschrieben. Unsere Hälfte prüft
`scripts/vytal-selftest.mjs` gegen einen Stellvertreter der API — durch die
echten Routen, das echte Ledger.

## Wenn der Demo-Store abläuft

Die fünf Demo-Stores waren für die zwei Hackathon-Tage gebührenfrei. Danach
gelten die normalen Regeln: 14 Tage Leihfrist, danach eine Ausgleichsgebühr
(`overduePrice`, Liste `sold`). Vor dem nächsten Einsatz mit Stephan klären,
ob Store B noch frei ist — sonst laufen echte Kosten auf.
