# Google-Anmeldung einrichten (Firebase Authentication)

ReMain bietet ausschließlich **Mit Google anmelden** an. Gast-Anmeldung und
Demo-Kontowechsel sind deaktiviert, auch über direkte API-Aufrufe. Ohne Firebase-
Konfiguration bleibt die Anmeldung gesperrt; der Google-Knopf zeigt den Status an.

---

## Wie das hier funktioniert

Kurz, weil es die Einrichtung erklärt:

1. Der Browser erledigt den OAuth-Ablauf mit Google und bekommt von Firebase
   ein **ID-Token** — ein von Google signiertes JWT.
2. Die App schickt dieses Token an `POST /api/session/google`.
3. Der Server prüft die Signatur gegen **Googles öffentliche Schlüssel** und
   setzt danach *sein eigenes* Session-Cookie. Nur bestätigte Google-Konten
   erhalten Zugriff.

Daraus folgt das Wichtigste für die Konfiguration:

> **Es gibt keinen geheimen Schlüssel.** Kein Service-Account-JSON, nichts,
> was auslaufen oder rotiert werden müsste. Der Server braucht nur die
> Projekt-ID. Die `VITE_FIREBASE_*`-Werte im Client sind *öffentlich* —
> eine Firebase-Web-Config ist eine Adresse, kein Passwort. Geschützt wird
> das Projekt durch die **Liste erlaubter Domains** und durch die
> Token-Prüfung auf dem Server.

---

## 1. Firebase-Projekt anlegen

1. <https://console.firebase.google.com> öffnen → **Projekt hinzufügen**.
2. Name z. B. `remain-frankfurt`. **Google Analytics kann aus bleiben** — wird
   hier nicht gebraucht und spart eine Einwilligungsfrage.
3. Auf **Erstellen** warten, dann **Weiter**.

## 2. Google als Anmeldeanbieter aktivieren

1. Linke Leiste → **Build → Authentication** → **Get started**.
2. Reiter **Sign-in method** → in der Liste **Google** → **Enable**.
3. Zwei Pflichtfelder:
   * **Public-facing name** — was Google im Anmeldedialog anzeigt. `ReMain`.
   * **Support email** — eine Adresse aus dem Team.
4. **Save**.

> Fehlt dieser Schritt, meldet die App beim Klick:
> *„Google-Anmeldung ist im Firebase-Projekt nicht aktiviert."*

## 3. Web-App registrieren und die Config kopieren

1. **Projektübersicht** (Zahnrad → **Project settings**) → Abschnitt
   **Your apps** → Symbol **`</>`** (Web).
2. Spitzname z. B. `ReMain PWA`. **Firebase Hosting NICHT ankreuzen** — wir
   hosten auf Render bzw. GitHub Pages.
3. **Register app**. Firebase zeigt jetzt einen Block wie diesen:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy…",
     authDomain: "remain-frankfurt.firebaseapp.com",
     projectId: "remain-frankfurt",
     storageBucket: "remain-frankfurt.firebasestorage.app",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abc123def456"
   };
   ```

   Der Block ist später jederzeit unter **Project settings → General → Your
   apps → SDK setup and configuration** wieder abrufbar.

## 4. Werte eintragen

**`app/.env`** — der Client (`cp app/.env.example app/.env`, falls noch nicht
vorhanden):

```bash
VITE_FIREBASE_API_KEY=AIzaSy…
VITE_FIREBASE_AUTH_DOMAIN=remain-frankfurt.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=remain-frankfurt
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123def456
```

**`server/.env`** — der Server. Die **Projekt-ID muss
identisch sein**, sonst wird jedes Token abgelehnt:

```bash
FIREBASE_PROJECT_ID=remain-frankfurt
```

> `VITE_*` wird von Vite **zur Build-Zeit** in das JavaScript eingesetzt.
> Nach einer Änderung also den Dev-Server neu starten bzw. neu bauen — ein
> Reload im Browser genügt nicht.

## 5. Domains freigeben

**Authentication → Settings → Authorized domains.** `localhost` prüfen und
bei Bedarf ergänzen. Weitere verwendete Domains ebenfalls freigeben:

| Umgebung | Eintrag |
|---|---|
| Laptop | `localhost` (prüfen und ergänzen) |
| Handy im selben WLAN | die LAN-IP, z. B. `192.168.1.42` |
| Render | `remain.onrender.com` (die Domain aus dem Dashboard) |
| GitHub Pages | `fes-hackathon-2026.github.io` |

> Fehlt der Eintrag, meldet die App beim Klick:
> *„Diese Adresse ist in der Firebase-Konsole nicht freigegeben."*

## 6. Ausprobieren

```bash
cd server && npm start      # Terminal 1
cd app    && npm run dev    # Terminal 2
```

<http://localhost:5173> öffnen. Prüfpunkte:

- [ ] `curl localhost:8080/api/auth/config` antwortet `{"google":true,…}`.
      Steht dort `false`, fehlt `FIREBASE_PROJECT_ID` in `server/.env`.
- [ ] Der Anmeldebildschirm zeigt **Mit Google anmelden** als einzigen Anmeldeweg.
      Ist er deaktiviert, die Firebase-Konfiguration prüfen und beide Server neu starten.
- [ ] Klick öffnet Googles Kontoauswahl.
- [ ] Beim **ersten** Mal fragt die App danach noch den Stadtteil — Google
      liefert keinen, und die App braucht ihn.
- [ ] Danach steht oben „Moin, <Vorname>", und unter ⚙ → Einstellungen stehen
      Profilbild, E-Mail und das Kennzeichen **Google-Konto**.
- [ ] **Abmelden**, dann erneut anmelden: es ist wieder dasselbe Konto mit
      demselben XP-Stand — kein zweiter Datensatz.

---

## Deployment

### Render

Beide Hälften in **Environment** eintragen. Die `VITE_*`-Werte werden beim
**Build** gebraucht, nicht erst beim Start — Render stellt Umgebungsvariablen
dem Build zur Verfügung, das genügt also. `render.yaml` listet alle fünf
bereits als `sync: false` (Abfrage im Dashboard, nichts davon steht im Repo).

Anschließend die Render-Domain unter **Authorized domains** ergänzen.

### GitHub Pages

Die Werte als **Repository secrets** hinterlegen und im Workflow-Schritt
`npm run build` als `env:` durchreichen. Achtung: auf Pages läuft **nur** der
Client, ohne `server/`. Ohne Server gibt es kein `/api/session/google` und
damit keine Anmeldung. Auch auf Pages ist ein angebundener Backend-Server erforderlich; eine Gast-Version gibt es nicht.

---

## Fehlermeldungen

| Meldung in der App | Ursache | Behebung |
|---|---|---|
| „Google-Anmeldung ist auf diesem Server nicht eingerichtet" | `FIREBASE_PROJECT_ID` fehlt | `server/.env` ergänzen, Server neu starten |
| „Google-Anmeldung ist im Firebase-Projekt nicht aktiviert" | Schritt 2 fehlt | Sign-in method → Google → Enable |
| „Diese Adresse ist in der Firebase-Konsole nicht freigegeben" | Schritt 5 fehlt | Domain unter Authorized domains ergänzen |
| „Das Anmelde-Token ist ungültig (…)" | Projekt-IDs in `app/.env` und `server/.env` weichen ab | angleichen, danach **beide** neu starten |
| Kein Google-Knopf sichtbar | `VITE_FIREBASE_*` fehlen oder Build ist alt | `.env` prüfen, Dev-Server neu starten |
| „Die Anmeldung wurde abgebrochen" | Fenster geschlossen | keine — normaler Abbruch |

## Kosten und Grenzen

Der Spark-Plan (kostenlos) deckt das vollständig ab: Google-Anmeldung ist im
kostenlosen Kontingent ohne Limit enthalten. Es wird keine Zahlungsmethode
verlangt, solange nur Authentication benutzt wird — und mehr benutzt dieses
Projekt nicht.

## Was gespeichert wird

Aus dem Token übernimmt der Server **Name, E-Mail-Adresse, Profilbild-URL und
die Firebase-Nutzer-ID** (`users.google_uid`) — mehr steht nicht drin. Kein
Zugriff auf Gmail, Kontakte oder Drive; es wird kein Scope über das
Standardprofil hinaus angefragt.

Unter **Einstellungen → Konto löschen** wird der ReMain-Datensatz samt XP,
Münzen und Belegen entfernt. Gemeldete Quests und Markt-Anzeigen bleiben
ohne Namen stehen, damit der Nachbarschaft nichts wegbricht. Das
Google-Konto selbst bleibt unberührt — darauf hatte ReMain nie Zugriff.

## Google-only behavior and validation

- `POST /api/session` and `POST /api/session/switch` return 403 and never create a cookie. Existing guest and demo cookies cannot read `/api/me` or use authenticated APIs.
- Firebase tokens require a valid Google signature, matching issuer/audience, required time claims, `google.com` provider and verified email. Production requires `SESSION_SECRET`; startup fails when it is missing.
- A valid legacy guest cookie may migrate its own data only after verified Google sign-in with a previously unlinked Google UID. No legacy users or content are deleted.
- New Google accounts select a district after authentication; returning accounts skip that step. Popup and redirect use the same server exchange, preserve invitation parameters, and support choosing a different Google account.
- Run `npm test --prefix server`, `npm run test:google-login --prefix app`, `npm run test:i18n --prefix app` and `npm run build --prefix app`.
- Automated checks use a mock only at the external Google verification boundary; they cover forbidden login methods, token claims, account creation/reuse, guest migration, cookie access and bilingual sign-in states. Live OAuth still requires configured Firebase credentials and an interactive browser check.
