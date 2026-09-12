/**
 * Shared German copy.
 *
 * Only strings that appear in more than one place live here — navigation,
 * the provenance vocabulary, common actions. Screen prose stays in its
 * screen, where it is easier to write well and easier to review.
 *
 * The product is German-only on purpose, so this is a plain object rather
 * than an i18n library. If a second language is ever needed, this is the
 * file that grows a sibling.
 */
export const de = {
  app: {
    name: 'ReMain',
    claim: 'Frankfurt bleibt brauchbar.',
  },

  tabs: {
    start: 'Start',
    quests: 'Quests',
    scan: 'Scannen',
    markt: 'Markt',
    wirkung: 'Wirkung',
  },

  /** The three provenance tiers. Used at every number in the product. */
  herkunft: {
    api: 'bestätigt',
    apiLong: 'Kommt aus einer Schnittstelle oder vom Server.',
    input: 'deine Angabe',
    inputLong: 'Von dir eingetippt und nicht überprüfbar.',
    estimate: 'Schätzung',
    estimateLong: 'Aus einer offengelegten Annahme gerechnet.',
    simulated: 'simuliert',
    simulatedLong: 'Nachgebauter Dienst — die echte Schnittstelle fehlt noch.',
  },

  reward: {
    xp: 'XP',
    coins: 'Münzen',
    coinsShort: 'Mz.',
  },

  action: {
    back: 'Zurück',
    close: 'Schließen',
    settings: 'Einstellungen',
    more: 'Mehr',
    retry: 'Nochmal versuchen',
    cancel: 'Abbrechen',
  },

  state: {
    loading: 'Einen Moment …',
    offline: 'Keine Verbindung. Die App zeigt den letzten Stand.',
    empty: 'Hier ist gerade nichts.',
    error: 'Das hat nicht geklappt.',
  },
} as const
