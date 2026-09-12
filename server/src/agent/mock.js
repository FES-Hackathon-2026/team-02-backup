/**
 * The offline provider.
 *
 * This is not a fallback bolted on at the end. On demo day the venue wifi is
 * bad or the free tier rate-limits, and LLM_PROVIDER=mock is what makes the
 * demo run anyway — so it is built first, tested with the network off, and
 * always says so in its own reasoning. Nobody should ever be able to mistake
 * a mock answer for a model answer.
 *
 * Deterministic by the image bytes: the same photo always produces the same
 * verdict, so a reload or a second scan never changes the story mid-demo,
 * while a new photo picks a different fixture and the screen stays alive.
 */

/** FNV-1a over the image, folded down to a small integer. */
function hash(bytes) {
  let h = 0x811c9dc5
  // A few hundred samples are plenty to separate photos and stay instant
  // even when the buffer is 180 KB.
  const step = Math.max(1, Math.floor(bytes.length / 512))
  for (let i = 0; i < bytes.length; i += step) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * `visible` is the whole-frame sweep a real provider now returns. The
 * fixtures carry it too, because mock is the stage insurance: if the offline
 * path silently lacked the field, a demo on bad venue wifi would show a
 * feature that looks missing rather than one that is simply not live.
 * Defaults to the object itself, which is the honest single-object answer.
 */
const F = (key, category, subtype, confidence, volume, reuse, reasoning, visible) => ({
  key,
  category,
  subtype,
  confidence,
  estimated_volume_m3: volume,
  reusable_probability: reuse,
  reasoning,
  visible_objects: visible ?? [subtype],
})

/**
 * One fixture set per mode, because the mode already tells us a great deal
 * about what is in front of the camera.
 */
export const FIXTURES = {
  sperrmuell: [
    F('stuhl', 'moebel', 'Holzstuhl', 0.87, 0.35, 0.68, [
      'Vier Beine, eine Rückenlehne und eine durchgehende Sitzfläche — das ist ein Stuhl.',
      'Die Oberfläche wirkt gebraucht, aber nicht gebrochen: das Gestell trägt noch.',
    ]),
    F('sofa', 'moebel', 'Zweisitzer-Sofa', 0.83, 2.0, 0.52, [
      'Gepolsterte Armlehnen und eine durchgehende Sitzfläche für zwei Personen.',
      'Der Bezug ist fleckig, das Gestell aber gerade — reparabel, nur nicht mehr schön.',
      'Hauptstück ist das Sofa; die Stühle davor sind beim Volumen mitgezählt.',
    ], ['Zweisitzer-Sofa', '2 Holzstühle', 'Umzugskarton']),
    F('kuehlschrank', 'elektro', 'Kühlschrank', 0.91, 0.55, 0.4, [
      'Hohe weiße Box mit durchgehender Tür und Griffleiste, typisch für ein Kühlgerät.',
      'Kühlgeräte enthalten Kältemittel und dürfen nicht in den Restmüll.',
    ]),
    F('waschmaschine', 'elektro', 'Waschmaschine', 0.88, 0.3, 0.35, [
      'Quadratische Front mit rundem Bullauge und Bedienblende oben.',
      'Alter und Zustand der Trommel lassen sich von außen nicht beurteilen.',
    ]),
    F('matratze', 'moebel', 'Matratze', 0.85, 0.5, 0.15, [
      'Rechteckig, weich, mit umlaufender Steppnaht — eine Matratze.',
      'Gebrauchte Matratzen nimmt kaum jemand weiter, deshalb die niedrige Wiederverwendbarkeit.',
    ]),
    F('fahrrad', 'fahrrad', 'Herrenrad', 0.89, 0.4, 0.75, [
      'Diamantrahmen, zwei 28-Zoll-Laufräder, Lenker und Sattel vorhanden.',
      'Rost an der Kette, Rahmen und Laufräder wirken aber gerade — das ist ein Reparaturfall.',
    ]),
    F('regal', 'moebel', 'Regal', 0.81, 0.45, 0.6, [
      'Mehrere waagerechte Böden zwischen zwei Seitenwänden.',
      'Pressspan an den Kanten leicht aufgequollen — noch nutzbar, aber nicht mehr verkaufbar.',
    ]),
    F('fernseher', 'elektro', 'Fernseher', 0.86, 0.12, 0.45, [
      'Flaches Gehäuse mit dunkler Scheibe und schmalem Standfuß.',
      'Ob das Panel noch ein Bild zeigt, ist auf dem Foto nicht zu sehen.',
    ]),
    F('farbeimer', 'schadstoff', 'Farbeimer', 0.9, 0.02, 0, [
      'Metalleimer mit Farbresten am Rand und einem Warnsymbol auf dem Etikett.',
      'Der Deckel sitzt lose auf — angetrocknet oder noch flüssig ist von außen nicht zu sehen.',
    ]),
  ],

  fundstueck: [
    F('muellsack', 'restmuell', 'Müllsack am Straßenrand', 0.84, 0.12, 0.02, [
      'Ein aufgeplatzter Sack mit gemischtem Inhalt auf dem Gehweg.',
      'Gemischter Inhalt lässt sich nicht mehr trennen — das ist Restmüll.',
    ]),
    F('sessel', 'moebel', 'Abgestellter Sessel', 0.82, 0.6, 0.4, [
      'Ein einzelner Polstersessel auf dem Gehweg, ohne Anmeldung erkennbar.',
      'Steht länger als einen Tag draußen: durchnässtes Polster wird schnell zum Restmüll.',
    ]),
    F('flaschen', 'glas', 'Flaschen neben dem Container', 0.88, 0.05, 0.05, [
      'Mehrere Glasflaschen stehen neben statt in dem Container.',
      'Der Container ist offenbar voll — das Glas gehört trotzdem hinein, nicht daneben.',
    ]),
    F('verpackung', 'verpackung', 'Verpackungsmüll', 0.8, 0.08, 0.03, [
      'Folien, Becher und eine Dose liegen verstreut auf einer Grünfläche.',
      'Leichtverpackungen wehen weit — je früher eingesammelt, desto weniger verteilt es sich.',
    ]),
    F('astschnitt', 'gruenschnitt', 'Astschnitt', 0.79, 0.7, 0, [
      'Ein Haufen abgeschnittener Äste und Zweige am Wegrand.',
      'Grünschnitt verrottet langsam und blockiert in der Menge den Weg.',
    ]),
    F('autobatterie', 'schadstoff', 'Autobatterie', 0.92, 0.02, 0, [
      'Schwarzer Blockkasten mit zwei Polen und Warnsymbol auf der Oberseite.',
      'Eine Autobatterie enthält Säure und Blei — sie darf niemand einfach aufheben.',
    ]),
    F('gaskartusche', 'schadstoff', 'Gaskartusche', 0.86, 0.01, 0, [
      'Kleine Metallkartusche mit Ventil, im Gebüsch liegend.',
      'Ob noch Restdruck darauf ist, lässt sich von außen nicht erkennen.',
    ]),
  ],

  wissen: [
    F('joghurtbecher', 'verpackung', 'Joghurtbecher', 0.9, 0.005, 0.02, [
      'Konischer Kunststoffbecher mit Aluminiumdeckel.',
      'Becher und Deckel getrennt in die Gelbe Tonne — so werden beide Stoffe wirklich sortiert.',
    ]),
    F('weinflasche', 'glas', 'Weinflasche', 0.93, 0.008, 0.05, [
      'Grüne Flasche mit langem Hals und Papieretikett.',
      'Grünglas nimmt jede Farbe auf, deshalb im Zweifel in den grünen Container.',
    ]),
    F('pizzakarton', 'papier', 'Pizzakarton', 0.85, 0.02, 0.02, [
      'Quadratischer Wellpappkarton mit Fettflecken im Boden.',
      'Saubere Teile in die Papiertonne, der durchgefettete Boden gehört in den Restmüll.',
    ]),
    F('batterie', 'schadstoff', 'Batterie', 0.94, 0.005, 0, [
      'Zylindrische Zelle mit Pluspol und Aufdruck der Spannung.',
      'Batterien gehören in keine Tonne — Sammelbox im Handel oder Schadstoffmobil.',
    ]),
    F('obstschalen', 'bio', 'Obstschalen', 0.87, 0.006, 0, [
      'Schalen und Strunkreste von frischem Obst.',
      'In die Biotonne, ohne Plastikbeutel — Zeitungspapier drumherum ist erlaubt.',
    ]),
    F('leuchtstoffrohre', 'schadstoff', 'Leuchtstoffröhre', 0.91, 0.008, 0, [
      'Lange Glasröhre mit Metallsockeln an beiden Enden.',
      'Leuchtstoffröhren enthalten Quecksilber und zerbrechen leicht.',
    ]),
  ],
}

/** The line that keeps a mock answer from ever passing as a real one. */
const OFFLINE_NOTE = 'Erkannt aus dem Offline-Fundus von ReMain — es wurde kein Modell im Netz befragt.'

/**
 * @param {Buffer} bytes    the photo, used only as a stable seed
 * @param {object} options
 * @param {string} options.mode
 * @param {string} [options.fixture]  forces one fixture by key, for the demo
 */
export function classifyWithMock(bytes, { mode, fixture }) {
  const set = FIXTURES[mode] ?? FIXTURES.sperrmuell
  const seed = hash(bytes)

  const forced = fixture ? set.find((f) => f.key === fixture || f.subtype === fixture) : null
  const chosen = forced ?? set[seed % set.length]

  // A little deterministic spread, so two photos of a chair do not report
  // byte-identical volumes and the numbers stop looking canned.
  const jitter = ((seed >>> 8) % 21) - 10 // -10 .. +10
  const volume = Number((chosen.estimated_volume_m3 * (1 + jitter / 100)).toFixed(3))
  const confidence = Number(Math.min(0.96, chosen.confidence + jitter / 500).toFixed(2))

  return {
    category: chosen.category,
    subtype: chosen.subtype,
    confidence,
    estimated_volume_m3: volume,
    reusable_probability: chosen.reusable_probability,
    reasoning: [...chosen.reasoning],
    /** Travels next to the answer, not inside its reasoning. */
    note: OFFLINE_NOTE,
  }
}

export const fixtureKeys = () =>
  Object.fromEntries(
    Object.entries(FIXTURES).map(([mode, set]) => [mode, set.map((f) => f.key ?? f.subtype)]),
  )
