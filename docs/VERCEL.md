# Vercel — das Frontend, Render — die API

Vercel liefert `app/dist`, Render läuft weiter als Server. `vercel.json`
leitet `/api/*` an Render durch. Für den Browser bleibt alles **eine
Herkunft**, und genau daran hängt die Anmeldung.

## Warum nicht alles auf Vercel

`server/src/db.js` öffnet `server/data/remain.db` mit `better-sqlite3` —
nativ, synchron, eine Datei auf der Platte. Vercel-Functions haben ein
schreibgeschütztes Dateisystem, und `/tmp` gehört einer einzelnen Instanz und
überlebt nichts. Anmeldung auf der einen Instanz, nächster Aufruf auf der
nächsten: die Person ist weg. Die Fotos liegen als BLOB in derselben Datei,
und `seed()` schreibt beim Start hinein.

Das ist kein Konfigurationsproblem. Alles auf Vercel hieße: Datenbank nach
Turso, `db.js` auf async, **265 Aufrufstellen in 28 Dateien** nachziehen, die
19 Transaktionen auf `batch()` umbauen. Vor dem Demo-Tag ist das der falsche
Tausch.

## Rewrite, nicht Redirect

Der Client ruft relative Pfade mit `credentials: 'same-origin'` auf
(`app/src/lib/client.ts`), das Session-Cookie ist `httpOnly` und
`sameSite: lax` (`server/src/session.js`), und im ganzen Server steht **kein
CORS**. Ein Rewrite leitet serverseitig weiter — der Browser sieht eine
Domain, das Cookie funktioniert. Ein Redirect oder eine fest eingetragene
Backend-URL zerlegt die Anmeldung sofort.

Reihenfolge in `vercel.json` ist deshalb verbindlich: `/api/(.*)` **vor** dem
SPA-Fallback. Echte Dateien aus `app/dist` liefert Vercel ohnehin zuerst, die
Assets bleiben also unberührt.

## Einrichten

1. **Backend-Domain prüfen.** In `vercel.json` steht
   `https://remain.onrender.com`. Steht im Render-Dashboard etwas anderes,
   hier eintragen — sonst geht jeder `/api`-Aufruf ins Leere.

2. **Projekt anlegen.** vercel.com → New Project → Repo importieren.
   Framework Preset: **Other**. Build Command und Output Directory kommen aus
   `vercel.json`, im Dashboard ist nichts nachzutragen.

3. **Environment Variables setzen.** Das ist der Schritt, den man vergisst:
   `VITE_*` wird **zur Build-Zeit** in das Bundle eingesetzt. Fehlt eine
   Variable, ist sie in keinem späteren Deploy nachträglich da — es braucht
   einen neuen Build.

   | Variable | Pflicht | Woher |
   |---|---|---|
   | `VITE_FIREBASE_API_KEY` | ja | Firebase-Konsole, siehe `docs/FIREBASE.md` |
   | `VITE_FIREBASE_AUTH_DOMAIN` | ja | dito |
   | `VITE_FIREBASE_PROJECT_ID` | ja | dito |
   | `VITE_FIREBASE_APP_ID` | ja | dito |
   | `VITE_FIREBASE_STORAGE_BUCKET` | nein | dito |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | nein | dito |
   | `VITE_FS_API_BASE` | nein | Default ist der Hackathon-Host |
   | `VITE_FS_API_KEY` | nein | leer lassen → die App fragt danach |

   Ohne die vier Pflichtwerte bleibt die Anmeldung gesperrt, und seit dem
   Umstieg auf Google-only gibt es keinen Gast-Weg mehr daran vorbei.

   Alles andere — `SESSION_SECRET`, `VYTAL_JWT`, `GROQ_API_KEY`,
   `FIREBASE_PROJECT_ID` — ist Server-Konfiguration und bleibt bei Render.
   Nichts davon gehört nach Vercel, und nichts davon je mit `VITE_`-Präfix:
   Vite schreibt solche Werte in das öffentliche Bundle.

4. **Deployen.**

5. **Domain in Firebase freigeben.** Konsole → Authentication → Settings →
   Authorized domains → die `*.vercel.app`-Domain ergänzen. Fehlt sie, meldet
   die App beim Klick auf Anmelden: *„Diese Adresse ist in der
   Firebase-Konsole nicht freigegeben."* Preview-Deployments bekommen eigene
   Domains — für die gilt dasselbe.

## Prüfen

```bash
curl -s https://<projekt>.vercel.app/api/health
curl -s https://<projekt>.vercel.app/api/auth/config     # {"google":true,…}
```

- [ ] `/api/health` antwortet — der Rewrite greift.
- [ ] `auth/config` meldet `google: true`. Steht dort `false`, fehlt
      `FIREBASE_PROJECT_ID` bei **Render**, nicht bei Vercel.
- [ ] Anmelden mit Google, dann neu laden: bleibt man angemeldet, stimmt das
      Cookie über den Rewrite.
- [ ] Eine Tiefenverlinkung direkt aufrufen, z. B. `/mehrweg` — der
      SPA-Fallback muss `index.html` liefern statt 404.
- [ ] Ein Foto hochladen und wieder anzeigen: 1,5 MB gehen durch den Rewrite.

## Was weiterhin gilt

Render Free schläft nach 15 Minuten ein und braucht ~50 s zum Aufwachen. Das
Frontend ist auf Vercel dann sofort da und die erste `/api`-Antwort trotzdem
nicht — was schlimmer aussieht als vorher, weil die Oberfläche schon steht.
**Fünf Minuten vor der Vorführung einmal aufrufen.**
