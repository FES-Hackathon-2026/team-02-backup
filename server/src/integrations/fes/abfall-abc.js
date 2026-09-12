/**
 * "Was mache ich damit?" — the disposal guidance behind the Wissen screen.
 *
 * FES publishes an Abfall-ABC at <https://frankfurtplus.de/abfall-abc>
 * (routes waste-abc.index and waste-abc.show/{wasteDisposalObject}). It is a
 * client-rendered app with no public JSON, so the entries below are written
 * by hand rather than scraped — they carry source 'simulated' like everything
 * else we rebuilt.
 *
 * The LEGAL basis on each entry is not simulated. Those are real citations,
 * and they are the reason the answer is more than an opinion:
 *
 *   Richtlinie 2008/98/EG Art. 4   the five-step waste hierarchy
 *   § 6 KrWG                       the same hierarchy in German law
 *   § 17 KrWG                      household waste goes to the public body
 *   ElektroG                       take-back duty for electrical equipment
 *   BattG                          batteries never go in household waste
 *   VerpackG                       packaging is financed by the dual system
 *   BioAbfV / § 11 KrWG            separate collection of bio-waste
 *
 * `route` is what the app does with the answer:
 *   tonne         it goes in a bin at home — show the next collection date
 *   pickup        book an FES collection — link to /abholung
 *   wertstoffhof  carry it to a recycling centre — show the nearest real one
 *   markt         it is too good to throw away — link to the repair market
 */

export const SOURCE = 'simulated'

const HIERARCHIE = 'Richtlinie 2008/98/EG Art. 4 — Vermeidung vor Wiederverwendung vor Recycling.'

const ENTRIES = [
  {
    id: 'moebel',
    name: 'Möbel',
    aliases: ['sofa', 'couch', 'schrank', 'tisch', 'stuhl', 'regal', 'sperrmuell', 'bulky'],
    bin: 'Sperrmüll, angemeldet',
    fraktion: 'sperrmuell',
    route: 'pickup',
    why: 'Möbel sind Hausrat und werden von FES am Straßenrand abgeholt — nach Anmeldung, damit die Tour weiß, wo sie halten muss.',
    notAllowed: [
      'Nicht ohne Anmeldung rausstellen — das ist eine wilde Ablagerung und kostet ein Bußgeld.',
      'Nicht am Vortag vor 18:00 Uhr abstellen.',
      'Kein Bauholz, keine Einbauküche.',
    ],
    reuse: {
      titel: 'Erst weitergeben',
      text: 'Ein Sofa mit einem lockeren Bein ist kein Abfall. Auf dem Markt in ReMain findet es jemanden, der es repariert.',
      route: 'markt',
    },
    legal: [HIERARCHIE, '§ 17 KrWG — Hausrat gehört zur Überlassungspflicht an FES.'],
  },
  {
    id: 'matratze',
    name: 'Matratze',
    aliases: ['bett', 'lattenrost'],
    bin: 'Sperrmüll, angemeldet',
    fraktion: 'sperrmuell',
    route: 'pickup',
    why: 'Matratzen gehören zum Sperrmüll. Sie werden verbrannt, weil sich Schaum und Federkern kaum trennen lassen.',
    notAllowed: ['Nicht in die Restmülltonne stopfen.', 'Nicht nass werden lassen — dann wird sie schwerer und teurer.'],
    reuse: {
      titel: 'Selten sinnvoll',
      text: 'Gebrauchte Matratzen nimmt kaum jemand an. Ein Lattenrost dagegen schon.',
      route: 'markt',
    },
    legal: [HIERARCHIE],
  },
  {
    id: 'elektro-gross',
    name: 'Elektro-Großgerät',
    aliases: ['kuehlschrank', 'waschmaschine', 'herd', 'trockner', 'fernseher', 'spuelmaschine'],
    bin: 'Sperrmüll getrennt oder Wertstoffhof',
    fraktion: 'sperrmuell',
    route: 'pickup',
    why: 'Großgeräte werden getrennt verladen. Kühlgeräte enthalten Kältemittel, das entweicht, sobald das Gerät gequetscht wird.',
    notAllowed: [
      'Nie zum normalen Sperrmüll stellen.',
      'Kühlschränke nicht öffnen oder abmontieren.',
    ],
    reuse: {
      titel: 'Reparatur lohnt oft',
      text: 'Eine Pumpe oder eine Türdichtung ist ein Ersatzteil für unter 40 Euro. 50 Reparaturbetriebe in Frankfurt stehen in ReMain.',
      route: 'markt',
    },
    legal: [
      HIERARCHIE,
      'ElektroG — Händler ab 400 m² Verkaufsfläche müssen Altgeräte zurücknehmen.',
    ],
  },
  {
    id: 'elektro-klein',
    name: 'Elektro-Kleingerät',
    aliases: ['toaster', 'foehn', 'handy', 'laptop', 'kabel', 'akkuschrauber', 'radio'],
    bin: 'Wertstoffhof oder mobile Sammlung',
    fraktion: null,
    route: 'wertstoffhof',
    why: 'Kleingeräte enthalten Kupfer, Gold und seltene Erden. Im Restmüll sind die für immer weg.',
    notAllowed: [
      'Nicht in den Restmüll — auch kein Ladekabel.',
      'Nicht zum Sperrmüll stellen; die Tour sammelt sie nicht ein.',
      'Geräte mit fest verbautem Akku niemals zerlegen.',
    ],
    reuse: {
      titel: 'Läuft es noch?',
      text: 'Ein funktionierendes Gerät ist auf dem Markt in einer Stunde weg.',
      route: 'markt',
    },
    legal: [
      HIERARCHIE,
      'ElektroG — Altgeräte gehören getrennt gesammelt, kostenlose Rückgabe am Wertstoffhof.',
    ],
  },
  {
    id: 'batterie',
    name: 'Batterien und Akkus',
    aliases: ['akku', 'knopfzelle', 'powerbank', 'lithium'],
    bin: 'Sammelbox im Handel oder Wertstoffhof',
    fraktion: null,
    route: 'wertstoffhof',
    why: 'Lithium-Akkus fangen unter Druck Feuer. Die meisten Brände in Müllfahrzeugen kommen von Akkus im Hausmüll.',
    notAllowed: [
      'Nie in den Restmüll, nie in die Gelbe Tonne.',
      'Beschädigte oder aufgeblähte Akkus nicht transportieren, sondern melden.',
      'Pole von Lithiumzellen vor der Abgabe abkleben.',
    ],
    reuse: null,
    legal: ['BattG — jeder Verkaufsort mit Batterien im Sortiment muss sie zurücknehmen.'],
  },
  {
    id: 'gelb',
    name: 'Verpackungen',
    aliases: ['verpackung', 'plastik', 'kunststoff', 'joghurtbecher', 'dose', 'tetrapak', 'folie'],
    bin: 'Gelbe Tonne',
    fraktion: 'gelb',
    route: 'tonne',
    why: 'Leichtverpackungen aus Kunststoff, Metall und Verbund gehören zusammen in die Gelbe Tonne — sortiert wird maschinell.',
    notAllowed: [
      'Kein Spielzeug, keine Pfanne, kein Plastikstuhl — die sind keine Verpackung.',
      'Becher und Deckel trennen, aber nicht ausspülen: löffelrein reicht.',
      'Nichts ineinander stapeln, sonst erkennt die Sortieranlage nur das äußere Teil.',
    ],
    reuse: {
      titel: 'Mehrweg spart den ganzen Weg',
      text: 'Ein Vytal-Behälter ersetzt bis zu 200 Einwegverpackungen.',
      route: 'mehrweg',
    },
    legal: ['VerpackG — die Sammlung zahlt das Duale System, nicht die Gebühr.'],
  },
  {
    id: 'papier',
    name: 'Papier und Kartonage',
    aliases: ['karton', 'zeitung', 'pappe', 'papier'],
    bin: 'Altpapiertonne',
    fraktion: 'papier',
    route: 'tonne',
    why: 'Altpapier ist der Rohstoff mit dem höchsten Recyclinganteil in Deutschland — sauber gesammelt bleibt die Faser brauchbar.',
    notAllowed: [
      'Kein Kassenbon (Thermopapier).',
      'Kein beschichtetes oder fettiges Papier — Pizzakarton nur, wenn er sauber ist.',
      'Kartons flach falten, sonst ist die Tonne nach zwei Umzugskisten voll.',
    ],
    reuse: null,
    legal: ['§ 11 KrWG — getrennte Sammlung von Papier ist Pflicht, nicht Angebot.'],
  },
  {
    id: 'bio',
    name: 'Bioabfall',
    aliases: ['essensreste', 'kompost', 'gemuese', 'kaffeesatz', 'laub'],
    bin: 'Biotonne',
    fraktion: 'bio',
    route: 'tonne',
    why: 'Aus Bioabfall wird Kompost und Biogas. Im Restmüll wird derselbe Abfall verbrannt — nasse Fracht, die Energie kostet statt liefert.',
    notAllowed: [
      'Keine kompostierbaren Plastikbeutel — sie verrotten der Anlage zu langsam.',
      'Keine Katzenstreu, keine Asche.',
      'In Zeitungspapier einwickeln hält die Tonne trocken.',
    ],
    reuse: {
      titel: 'Vorher: gar nicht wegwerfen',
      text: 'Über foodsharing findet Essbares in ReMain noch am selben Tag jemanden.',
      route: 'essen',
    },
    legal: ['BioAbfV und § 11 KrWG — Bioabfall wird getrennt erfasst.'],
  },
  {
    id: 'glas',
    name: 'Altglas',
    aliases: ['flasche', 'glas', 'marmeladenglas'],
    bin: 'Glascontainer, nach Farbe',
    fraktion: null,
    route: 'wertstoffhof',
    placeKind: 'glascontainer',
    why: 'Glas lässt sich beliebig oft einschmelzen, aber nur farbrein. Ein grünes Glas im Weißglas macht die ganze Charge grün.',
    notAllowed: [
      'Kein Fensterglas, kein Spiegel, kein Trinkglas — anderes Schmelzverhalten.',
      'Keine Glühbirnen.',
      'Blaues und rotes Glas kommt zum Grünglas.',
      'Nur zwischen 07:00 und 20:00 Uhr einwerfen, sonntags gar nicht.',
    ],
    reuse: null,
    legal: ['VerpackG — Behälterglas läuft über die Wertstoffsammlung.'],
  },
  {
    id: 'schadstoff',
    name: 'Schadstoffe',
    aliases: ['farbe', 'lack', 'chemie', 'loesungsmittel', 'leuchtstoffroehre', 'oel'],
    bin: 'Schadstoffsammlung oder Wertstoffhof',
    fraktion: null,
    route: 'wertstoffhof',
    why: 'Schadstoffe müssen aus dem normalen Abfallstrom heraus, bevor sie in Wasser oder Luft landen.',
    notAllowed: [
      'Nie in den Hausmüll, nie in den Ausguss.',
      'Nichts umfüllen — im Originalgebinde abgeben.',
      'Nicht zum Sperrmüll stellen.',
    ],
    reuse: {
      titel: 'Reste weitergeben',
      text: 'Halbvolle Farbdosen nehmen Nachbarn und Bauteilbörsen oft gerne.',
      route: 'markt',
    },
    legal: ['§ 17 KrWG — gefährliche Abfälle aus Haushalten gehen an die kommunale Sammlung.'],
  },
  {
    id: 'textilien',
    name: 'Kleidung und Textilien',
    aliases: ['kleider', 'schuhe', 'stoff', 'jacke'],
    bin: 'Altkleidercontainer',
    fraktion: null,
    route: 'wertstoffhof',
    placeKind: 'altkleider',
    why: 'Seit 2025 müssen Textilien EU-weit getrennt gesammelt werden — auch kaputte.',
    notAllowed: [
      'Keine nassen oder verschimmelten Sachen — sie verderben den ganzen Sack.',
      'Schuhe paarweise zusammenbinden.',
    ],
    reuse: {
      titel: 'Tragbares zuerst',
      text: 'Was noch passt, gehört in einen Kleiderkreisel, nicht in den Container.',
      route: 'markt',
    },
    legal: [HIERARCHIE, 'Richtlinie 2008/98/EG Art. 11 — getrennte Textilsammlung seit 1.1.2025.'],
  },
  {
    id: 'gruenschnitt',
    name: 'Grünschnitt',
    aliases: ['aeste', 'strauchschnitt', 'gartenabfall', 'rasenschnitt'],
    bin: 'Eigene FES-Anmeldung oder Wertstoffhof',
    fraktion: null,
    route: 'wertstoffhof',
    why: 'Grünschnitt fährt bei FES eine eigene Tour und wird kompostiert. Kleine Mengen passen auch in die Biotonne.',
    notAllowed: [
      'Nicht zum Sperrmüll — das ist eine andere Anmeldung.',
      'Keine Wurzelstöcke, keine Erde.',
      'Äste bündeln, höchstens 1,5 m lang.',
    ],
    reuse: {
      titel: 'Im Garten lassen',
      text: 'Häckselgut und Laub sind Mulch. Was liegen bleibt, muss niemand fahren.',
      route: null,
    },
    legal: [HIERARCHIE, 'BioAbfV — pflanzliche Abfälle werden getrennt verwertet.'],
  },
  {
    id: 'restmuell',
    name: 'Restmüll',
    aliases: ['muell', 'rest', 'windeln', 'staubsaugerbeutel'],
    bin: 'Restmülltonne',
    fraktion: 'rest',
    route: 'tonne',
    why: 'Was sich nicht trennen lässt, wird im Müllheizkraftwerk verbrannt und liefert Fernwärme. Das ist das Ende der Kette, nicht der Normalfall.',
    notAllowed: [
      'Keine Batterien, keine Elektrogeräte, kein Bioabfall.',
      'Keine Flüssigkeiten.',
    ],
    reuse: null,
    legal: [HIERARCHIE, '§ 6 KrWG — Beseitigung steht auf der letzten Stufe der Abfallhierarchie.'],
  },
  {
    id: 'bauschutt',
    name: 'Bauschutt',
    aliases: ['fliesen', 'beton', 'waschbecken', 'ziegel', 'sanitaer'],
    bin: 'Wertstoffhof, kostenpflichtig',
    fraktion: null,
    route: 'wertstoffhof',
    why: 'Bauschutt ist kein Hausrat. Er wird gebrochen und als Recyclingschotter wieder eingebaut — aber nur sortenrein.',
    notAllowed: [
      'Nicht zum Sperrmüll.',
      'Nicht mit Holz, Gips oder Dämmung mischen.',
    ],
    reuse: {
      titel: 'Bauteilbörse',
      text: 'Ganze Waschbecken, Türen und Fliesenpakete sind in Bauteilbörsen gesucht.',
      route: 'markt',
    },
    legal: ['Gewerbeabfallverordnung — mineralische Abfälle werden getrennt gehalten.'],
  },
  {
    id: 'fahrrad',
    name: 'Fahrrad',
    aliases: ['rad', 'bike', 'ebike', 'roller'],
    bin: 'Metallschrott oder Sperrmüll',
    fraktion: 'sperrmuell',
    route: 'markt',
    why: 'Ein Fahrrad ist fast vollständig Metall und lässt sich fast immer reparieren. Wegwerfen ist hier der teuerste Weg.',
    notAllowed: [
      'Nicht angeschlossen am Laternenmast stehen lassen — das räumt die Stadt kostenpflichtig ab.',
      'Akkus von E-Bikes gehören getrennt abgegeben.',
    ],
    reuse: {
      titel: 'Fast immer reparabel',
      text: 'Radwerkstätten und Selbsthilfewerkstätten in Frankfurt nehmen Rahmen und Teile.',
      route: 'markt',
    },
    legal: [HIERARCHIE],
  },
]

export const all = () =>
  ENTRIES.map(({ id, name, bin, route, fraktion }) => ({ id, name, bin, route, fraktion }))

/**
 * Look one up.
 *
 * Fuzzy on purpose: the scan agent in phase 4 returns its own category and
 * subtype vocabulary, and this has to answer for both without the two phases
 * having to agree on a shared enum first.
 */
export function lookup(term) {
  if (!term) return null
  const q = String(term)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .trim()
  if (!q) return null

  return (
    ENTRIES.find((e) => e.id === q) ??
    ENTRIES.find((e) => e.aliases.includes(q)) ??
    ENTRIES.find((e) => e.id.startsWith(q) || q.startsWith(e.id)) ??
    ENTRIES.find((e) => e.aliases.some((a) => q.includes(a) || a.includes(q))) ??
    null
  )
}

export const entry = (id) => ENTRIES.find((e) => e.id === id) ?? null
