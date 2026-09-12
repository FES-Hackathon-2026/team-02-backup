/**
 * Return points for the stand-in.
 *
 * Vytal's real partner list is behind the sandbox we do not have. What we do
 * have is the honest half: the *places* are real Frankfurt locations with real
 * coordinates, the *partner names* are made up and say so. A fictional café at
 * a real square is a stand-in nobody can mistake for a fact; a real café we
 * claimed was a Vytal partner would be a false statement about a business.
 *
 * When the sandbox arrives this whole file is replaced by
 * `GET /partners?lat&lon` against Vytal.
 */
export const PARTNERS = [
  {
    partner_id: 'vytal_ffm_hauptwache',
    name: 'Mittagstisch an der Hauptwache (Demo)',
    address: 'An der Hauptwache, 60313 Frankfurt am Main',
    lat: 50.1136,
    lon: 8.679,
    accepts: ['bowl_1000', 'bowl_500', 'cup_400'],
  },
  {
    partner_id: 'vytal_ffm_bockenheimer_warte',
    name: 'Campus-Kantine Bockenheimer Warte (Demo)',
    address: 'Bockenheimer Warte, 60325 Frankfurt am Main',
    lat: 50.1244,
    lon: 8.6516,
    accepts: ['bowl_1000', 'bowl_500'],
  },
  {
    partner_id: 'vytal_ffm_suedbahnhof',
    name: 'Bowl-Bar Südbahnhof (Demo)',
    address: 'Diesterwegplatz, 60594 Frankfurt am Main',
    lat: 50.0989,
    lon: 8.6857,
    accepts: ['bowl_1000', 'cup_400'],
  },
  {
    partner_id: 'vytal_ffm_konstablerwache',
    name: 'Kaffeeausschank Konstablerwache (Demo)',
    address: 'Konstablerwache, 60313 Frankfurt am Main',
    lat: 50.1145,
    lon: 8.6867,
    accepts: ['cup_400'],
  },
  {
    partner_id: 'vytal_ffm_ostend',
    name: 'Betriebsrestaurant Ostend (Demo)',
    address: 'Hanauer Landstraße, 60314 Frankfurt am Main',
    lat: 50.1122,
    lon: 8.7086,
    accepts: ['bowl_1000', 'bowl_500', 'cup_400'],
  },
  {
    partner_id: 'vytal_ffm_hoechst',
    name: 'Imbiss Höchster Markt (Demo)',
    address: 'Höchster Markt, 65929 Frankfurt am Main',
    lat: 50.1004,
    lon: 8.5486,
    accepts: ['bowl_1000'],
  },
]

/** The container catalogue. Sizes follow Vytal's published range. */
export const CONTAINERS = {
  bowl_1000: { label: 'Schale 1 l', single_use_grams: 32 },
  bowl_500: { label: 'Schale 0,5 l', single_use_grams: 21 },
  cup_400: { label: 'Becher 0,4 l', single_use_grams: 14 },
}

export const partnerById = (id) => PARTNERS.find((p) => p.partner_id === id) ?? null
