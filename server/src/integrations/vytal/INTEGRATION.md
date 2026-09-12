# Vytal — was der echte Adapter ersetzt

Der Sandbox-Zugang (Notion: *Vytal x FES Hackathon – Technical Documentation*)
lag uns beim Bauen nicht vor. Dieser Ordner ist deshalb ein **Nachbau**, und er
sagt das auch überall: jeder Wert kommt mit `tier: 'simulated'` heraus und die
App zeigt ihn als „simuliert", nie als „bestätigt".

Nachgebaut ist nur die Quelle der Ereignisse. **Die Ereignisform ist die echte**
— darum ist der Austausch später eine Datei und kein Umbau.

## Die Ereignisform

```json
{
  "event_id":       "vytal_evt_9f2k1a8c",
  "type":           "borrow | return",
  "container_id":   "VY-7F3K29",
  "container_type": "bowl_1000 | bowl_500 | cup_400",
  "partner_id":     "vytal_ffm_hauptwache",
  "user_ref":       "remain:42",
  "status":         "borrowed | returned",
  "occurred_at":    "2026-09-12T11:04:18.221Z",
  "due_at":         "2026-09-26T11:04:18.221Z",
  "was_overdue":    false,
  "days_held":      3
}
```

`event_id` ist das einzige Feld, an dem etwas hängt: unser Ledger belohnt ein
Partner-Ereignis über `award({ eventKey: event_id })` **genau einmal**. Ein
zweiter Scan desselben Behälters liefert deshalb **dasselbe** `event_id`
zurück, nicht ein neues — genauso, wie ein echtes Rückgabeterminal reagiert,
wenn man eine bereits zurückgegebene Schale davorhält.

## Was der Adapter können muss

| Methode | Was sie tut | Echter Ersatz |
|---|---|---|
| `partners({lat, lon, radiusKm})` | Rückgabeorte in der Nähe | `GET /partners?lat&lon` |
| `containers(userRef)` | aktive und zurückgegebene Behälter | `GET /users/{ref}/containers` |
| `borrow({userRef, partnerId, containerType})` | Ausleihe erfassen | im Echtbetrieb löst die Partnerkasse das aus, nicht die App |
| `returnContainer({userRef, containerId, partnerId})` | Rückgabe erfassen, `repeat` bei Wiederholung | `POST /returns` bzw. Webhook `container.returned` |
| `event(eventId)` | ein Ereignis nachschlagen | `GET /events/{event_id}` |

## Beim Umstellen zu tun

1. `index.js` durch den HTTP-Adapter ersetzen, gleiche fünf Methoden, gleiche
   Feldnamen. `store.js` und `partners.js` fallen ersatzlos weg.
2. `TIER` in `index.js` von `'simulated'` auf `'confirmed'` setzen. Das ist der
   einzige Ort, an dem die Herkunftsstufe dieser Integration steht — Route und
   Screen lesen sie von dort.
3. Schlüssel als `VYTAL_API_KEY` in `server/.env`. **Nie** mit `VITE_`-Prefix.
4. `status: 'pending'` im Integrationsregister (`server/src/routes/meta.js`,
   Eintrag `vytal`) auf `live` ziehen — eine Zeile, gehört Phase 10.
5. Im Echtbetrieb kommt die Ausleihe vom Partner. `POST /api/vytal/borrow`
   entfällt dann; die Rückgabe bleibt unverändert.

## Zustand des Nachbaus

`server/data/vytal-events.json`, geschrieben über `store.js`. Absichtlich
**nicht** in unserem SQLite: Vytals Ereignisse gehören Vytal, und `schema.sql`
hat aus gutem Grund keine Vytal-Tabelle. Als Datei statt als Variable, weil
`event_id` einen Neustart überleben muss — sonst wäre eine schon belohnte
Rückgabe mit neuem Schlüssel ein zweites Mal bezahlbar.
