import { BASE_XP } from '../engine/rewards.js'

/**
 * What the agent is allowed to say.
 *
 * The model never invents a category: it picks from this list, and anything
 * it returns that is not in here gets mapped or downgraded in contract.js.
 * Keeping the taxonomy in one file is also what lets the routing rules be
 * plain data rather than prose buried in a prompt.
 *
 * Per category:
 *   label     German, shown in the UI
 *   subtypes  examples that steer the model; not a closed list
 *   volumeM3  typical volume, used when the model gives none
 *   reuse     prior probability the thing is still usable by someone else
 *   bulky     FES would collect it as Sperrmüll
 *   bin       the plain-German disposal sentence for "Was ist das?"
 */
export const CATEGORIES = {
  moebel: {
    label: 'Möbel',
    subtypes: ['Stuhl', 'Tisch', 'Sofa', 'Schrank', 'Regal', 'Bett', 'Matratze'],
    volumeM3: 0.6,
    reuse: 0.55,
    bulky: true,
    bin: 'Möbel gehören zum Sperrmüll — die Abholung meldet man bei FES an.',
  },
  elektro: {
    label: 'Elektrogerät',
    subtypes: ['Kühlschrank', 'Waschmaschine', 'Fernseher', 'Mikrowelle', 'Monitor', 'Staubsauger'],
    volumeM3: 0.3,
    reuse: 0.45,
    bulky: true,
    bin: 'Elektrogeräte kommen zum Wertstoffhof oder in die Elektro-Abholung — nie in den Restmüll.',
  },
  fahrrad: {
    label: 'Fahrrad',
    subtypes: ['Herrenrad', 'Damenrad', 'Kinderrad', 'Roller', 'Rahmen'],
    volumeM3: 0.4,
    reuse: 0.7,
    bulky: true,
    bin: 'Ein Rad ist fast immer noch zu retten — erst reparieren lassen, dann entsorgen.',
  },
  textil: {
    label: 'Textilien',
    subtypes: ['Jacke', 'Hose', 'Schuhe', 'Bettwäsche', 'Teppich'],
    volumeM3: 0.08,
    reuse: 0.6,
    bulky: false,
    bin: 'Saubere Kleidung gehört in den Altkleidercontainer, Nasses und Verschmutztes in den Restmüll.',
  },
  verpackung: {
    label: 'Verpackung',
    subtypes: ['Plastikflasche', 'Joghurtbecher', 'Konservendose', 'Folie', 'Getränkekarton'],
    volumeM3: 0.02,
    reuse: 0.05,
    bulky: false,
    bin: 'Leichtverpackungen kommen in die Gelbe Tonne — ausgelöffelt genügt, spülen muss man nicht.',
  },
  glas: {
    label: 'Glas',
    subtypes: ['Flasche', 'Marmeladenglas', 'Scherben'],
    volumeM3: 0.01,
    reuse: 0.05,
    bulky: false,
    bin: 'Glas kommt nach Farben getrennt in den Altglascontainer, Deckel dürfen dran bleiben.',
  },
  papier: {
    label: 'Papier und Kartonage',
    subtypes: ['Karton', 'Zeitung', 'Papiertüte', 'Katalog'],
    volumeM3: 0.05,
    reuse: 0.05,
    bulky: false,
    bin: 'Papier und Kartons kommen flach gefaltet in die Papiertonne.',
  },
  bio: {
    label: 'Bioabfall',
    subtypes: ['Essensreste', 'Obstschalen', 'Kaffeesatz'],
    volumeM3: 0.02,
    reuse: 0,
    bulky: false,
    bin: 'Bioabfall kommt in die Biotonne — ohne Plastikbeutel, Papier drumherum ist in Ordnung.',
  },
  gruenschnitt: {
    label: 'Grünschnitt',
    subtypes: ['Äste', 'Laub', 'Rasenschnitt', 'Christbaum'],
    volumeM3: 0.5,
    reuse: 0,
    bulky: true,
    bin: 'Grünschnitt nimmt der Wertstoffhof an, größere Mengen holt FES nach Anmeldung ab.',
  },
  bauschutt: {
    label: 'Bauschutt',
    subtypes: ['Fliesen', 'Ziegel', 'Gipsplatte', 'Farbeimer'],
    volumeM3: 0.4,
    reuse: 0.05,
    bulky: false,
    bin: 'Bauschutt ist kein Sperrmüll — der muss kostenpflichtig zum Wertstoffhof.',
  },
  schadstoff: {
    label: 'Gefahrstoff',
    subtypes: [
      'Farbeimer',
      'Autobatterie',
      'Gaskartusche',
      'Leuchtstoffröhre',
      'Altöl',
      'Lösungsmittel',
      'Spraydose',
      'Spritze',
      'unbekannte Flüssigkeit',
    ],
    volumeM3: 0.02,
    reuse: 0,
    bulky: false,
    hazard: true,
    bin: 'Gefahrstoffe nimmt nur die Schadstoffsammlung an — persönlich beim Personal abgeben, niemals irgendwo abstellen.',
  },
  restmuell: {
    label: 'Restmüll',
    subtypes: ['Zigarettenstummel', 'Windel', 'Kaugummi', 'Verbundmaterial'],
    volumeM3: 0.02,
    reuse: 0.02,
    bulky: false,
    bin: 'Was sich nicht trennen lässt, kommt in die graue Restmülltonne.',
  },
  sonstiges: {
    label: 'Sonstiges',
    subtypes: ['unklar'],
    volumeM3: 0.1,
    reuse: 0.2,
    bulky: false,
    bin: 'Unklare Fälle klärt der Wertstoffhof — dort schaut jemand drauf, bevor etwas falsch landet.',
  },
}

export const CATEGORY_IDS = Object.keys(CATEGORIES)

/** The three things a person can be doing when they open the camera. */
export const MODES = ['sperrmuell', 'fundstueck', 'wissen']

export const MODE_LABEL = {
  sperrmuell: 'Sperrmüll',
  fundstueck: 'Fundstück melden',
  wissen: 'Was ist das?',
}

/**
 * Where a classification can lead.
 *
 * The XP is a PREVIEW and nothing is ever paid from this file — but it is
 * read out of the engine's own table rather than invented here, so the
 * number on the scan result cannot drift away from the one award() grants.
 * It is an upper bound: the tier weight, the daily cap and the travel
 * deduction can all lower it, which is why the UI says "bis zu".
 *
 * Looking a rule up is worth nothing, and should be: knowing where the
 * bottle goes is the reward.
 */
/**
 * A documented hazard report. Small on purpose: it pays for the photo, the
 * position and the restraint, not for removing anything. Nothing in ReMain
 * ever pays for "ich habe den Gefahrstoff selbst weggeräumt".
 */
export const HAZARD_XP = 10

export const ROUTES = {
  pickup: {
    label: 'Abholung buchen',
    hint: 'FES holt es an der Bordsteinkante ab.',
    to: '/abholung',
    xpPreview: BASE_XP.pickup,
  },
  market: {
    label: 'Auf den Markt stellen',
    hint: 'Jemand im Stadtteil repariert oder nutzt es weiter.',
    to: '/markt',
    xpPreview: BASE_XP.market,
  },
  quest: {
    label: 'Als Quest melden',
    hint: 'Andere sehen es auf der Karte und räumen es weg.',
    to: '/quests',
    xpPreview: BASE_XP.quest,
  },
  knowledge: {
    label: 'Richtig entsorgen',
    hint: 'Welche Tonne, welcher Hof — nachlesen statt raten.',
    to: '/wissen',
    xpPreview: 0,
  },
}

export const ROUTE_IDS = Object.keys(ROUTES)

/* ------------------------------------------------------------------
   Gefahrstoffe.

   FES is unambiguous about this: hazardous products belong in the
   Schadstoffsammlung, are handled by trained staff, and must be handed
   over in person rather than left somewhere. Their own terms for public
   clean-up days say the opposite of what a clean-up app would normally
   reward — do NOT pick up paint buckets, oil cans or car batteries, send
   the location instead.

   So this is not a category with a different label. It is a different
   path: no clean-up XP, no "collect it" call to action, and the only
   rewarded act is documenting it safely.

   Source: FES Schadstoffsammlung
   https://frankfurtplus.de/mobile-dienste/schadstoffsammlung
   ------------------------------------------------------------------ */

export const HAZARD_SOURCE = {
  name: 'FES Schadstoffsammlung',
  url: 'https://frankfurtplus.de/mobile-dienste/schadstoffsammlung',
}

/**
 * Words that force the hazard path, wherever they turn up — in the model's
 * subtype or anywhere in its reasoning.
 *
 * This list is deliberately biased towards false positives. Sending someone
 * to an official drop-off point for a tin of paint costs them a detour;
 * sending them to pick up a leaking solvent can costs them their hands.
 */
export const HAZARD_TERMS = [
  'farbdose', 'farbeimer', 'farbtopf', 'farbreste', 'farbkanister', 'wandfarbe',
  'lack', 'lasur', 'losungsmittel', 'verdunnung',
  'chemikalie', 'chemisch', 'reiniger', 'saure', 'lauge', 'atzend', 'giftig',
  'entzundlich', 'pestizid', 'unkrautvernichter', 'dunger',
  'batterie', 'akku', 'autobatterie', 'knopfzelle',
  'altol', 'motorol', 'benzin', 'diesel', 'kraftstoff', 'kanister',
  'spraydose', 'sprayflasche', 'gaskartusche', 'kartusche', 'gasflasche',
  'leuchtstoffrohre', 'neonrohre', 'energiesparlampe', 'quecksilber',
  'spritze', 'kanule', 'medikament', 'arznei', 'asbest',
  'warnsymbol', 'gefahrensymbol', 'gefahrstoff', 'gefahrgut', 'piktogramm', 'totenkopf',
  'unbekannteflussigkeit', 'ausgelaufeneflussigkeit',
]

/** Signals that mean "call 112", not "report it later". */
export const DANGER_TERMS = [
  'lauftaus', 'ausgelaufen', 'auslaufend', 'undicht', 'leck', 'aufgerissen',
  'dampfe', 'qualm', 'rauch', 'brennt', 'feuer', 'flamme', 'brandgeruch',
  'verletzt', 'verletzung', 'veratzung', 'stechendergeruch', 'starkergeruch',
  'grosepfutze',
]

/**
 * The only three things the app offers for a hazardous find.
 *
 * Note what is missing: no pickup, no market, no quest. Nobody is ever
 * invited to carry this themselves, and the only XP goes to the report.
 */
export const HAZARD_ROUTES = [
  {
    id: 'hazard_dropoff',
    label: 'Offizielle Abgabestelle finden',
    hint: 'Schadstoffmobil oder Wertstoffhof — persönlich beim Personal abgeben.',
    to: '/wissen',
    xpPreview: 0,
    primary: false,
  },
  {
    id: 'hazard_official',
    label: 'Fund melden',
    hint: 'Die Schadstoffsammlung von FES ist der offizielle Weg.',
    to: 'https://frankfurtplus.de/mobile-dienste/schadstoffsammlung',
    external: true,
    xpPreview: 0,
    primary: false,
  },
  {
    id: 'hazard_report',
    label: 'Als sichere Meldung speichern',
    hint: 'Foto und Standort dokumentieren, ohne etwas anzufassen.',
    to: '',
    xpPreview: HAZARD_XP,
    primary: true,
  },
]

export const HAZARD_SAFETY = [
  'Nicht anfassen. Nicht öffnen.',
  'Abstand halten, Kinder und Tiere fernhalten.',
  'Nicht in den Restmüll, nicht ins Abwasser, nicht in die Biotonne.',
  'Nicht selbst einsammeln — das übernehmen Fachleute.',
]

export const isHazard = (category) => CATEGORIES[category]?.hazard === true

/** Categories where offering the thing on the marketplace is plausible. */
const TRADEABLE = new Set(['moebel', 'elektro', 'fahrrad', 'textil'])

/** German decimal, because every number in this product is read aloud. */
export const fmt = (n) => String(Number(n).toFixed(2)).replace('.', ',')

/**
 * The routing decision, made by rules rather than by the model.
 *
 * The model may suggest a route — it sees the picture, after all — but the
 * decision that reaches the person comes from here, so it can be explained
 * in one sentence and stays the same for the same inputs.
 *
 * @returns {{route: string, why: string}}
 */
export function routeFor({ mode, category, reusableProbability, estimatedVolumeM3 }) {
  const cat = CATEGORIES[category] ?? CATEGORIES.sonstiges

  // Before the mode, before everything: a hazardous find never becomes a
  // quest, a pickup or a market offer, whichever screen the person came from.
  if (cat.hazard) {
    return {
      route: 'hazard_report',
      why: 'Gefahrstoff erkannt — den holt kein Sperrmülltermin ab und den räumt niemand freiwillig weg. Er gehört in die Schadstoffsammlung.',
    }
  }

  if (mode === 'wissen') {
    return {
      route: 'knowledge',
      why: 'Du hast gefragt, was das ist — also zuerst die Entsorgungsregel.',
    }
  }
  if (mode === 'fundstueck') {
    return {
      route: 'quest',
      why: 'Im Fundstück-Modus wird daraus eine Quest, die jemand in deinem Stadtteil übernehmen kann.',
    }
  }
  if (category === 'bauschutt') {
    return {
      route: 'knowledge',
      why: 'Bauschutt zählt nicht als Sperrmüll und muss selbst zum Wertstoffhof.',
    }
  }
  if (TRADEABLE.has(category) && reusableProbability >= 0.55) {
    const pct = Math.round(reusableProbability * 100)
    return {
      route: 'market',
      why: `Bei ${pct} % geschätzter Wiederverwendbarkeit ist Weitergeben besser als Entsorgen.`,
    }
  }
  if (cat.bulky || estimatedVolumeM3 >= 0.3) {
    return {
      route: 'pickup',
      why: `Mit rund ${fmt(estimatedVolumeM3)} m³ passt das in keine Tonne — ein Fall für die Sperrmüllabholung.`,
    }
  }
  return {
    route: 'knowledge',
    why: 'Das passt in eine Tonne zuhause — dafür braucht es keine Abholung.',
  }
}

/**
 * The primary route plus the two next-best ones, so the person always has a
 * choice and never just a verdict.
 */
export function rankRoutes({ mode, category, reusableProbability, estimatedVolumeM3, primary }) {
  const cat = CATEGORIES[category] ?? CATEGORIES.sonstiges

  if (cat.hazard) return HAZARD_ROUTES.map((r) => ({ ...r }))

  const score = {
    pickup: (cat.bulky ? 0.7 : 0.1) + Math.min(estimatedVolumeM3, 1) * 0.3,
    market: TRADEABLE.has(category) ? reusableProbability : reusableProbability * 0.3,
    quest: mode === 'fundstueck' ? 0.9 : 0.2,
    knowledge: 0.5,
  }
  score[primary] += 1

  return [...ROUTE_IDS]
    .sort((a, b) => score[b] - score[a])
    .slice(0, 3)
    .map((id) => ({
      id,
      label: ROUTES[id].label,
      hint: ROUTES[id].hint,
      to: ROUTES[id].to,
      xpPreview: ROUTES[id].xpPreview,
      primary: id === primary,
    }))
}

/** The catalogue the correction UI needs — one source of truth for labels. */
export const catalog = () => ({
  categories: CATEGORY_IDS.map((id) => ({
    id,
    label: CATEGORIES[id].label,
    bin: CATEGORIES[id].bin,
  })),
})
