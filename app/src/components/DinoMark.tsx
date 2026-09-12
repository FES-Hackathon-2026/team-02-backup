/**
 * Fessie — the FES dinosaur, in FES colours.
 *
 * A MASCOT, not a UI glyph — which is why it lives here and not in Icon.
 * That set is one-colour stroked paths on a 24-grid; this is a filled
 * two-tone silhouette, and forcing it through the same component would mean
 * either a stroked dinosaur (not a silhouette) or a special case in a
 * generated file.
 *
 * ────────────────────────────────────────────────────────────────────
 * PLACEHOLDER. `BODY` below is not the FES silhouette. It is a generic
 * sauropod standing in until the real artwork is dropped here, because
 * drawing one from memory and labelling it "the FES dino" would put a
 * wrong version of a partner's mark in front of that partner.
 *
 * To swap it in: export the official mascot as SVG, crop to the head, and
 * replace HEAD (and CREST, or drop it). Nothing else changes — the colours,
 * sizing and the eye are applied around it. If the real artwork is
 * multi-path, replace the whole <g> and keep the fill classes.
 * ────────────────────────────────────────────────────────────────────
 */

/**
 * A HEAD, not a whole animal.
 *
 * At 27px a full-body silhouette is a smudge: legs, tail and body collapse
 * into one blob and nothing in it is recognisable. A head has a profile —
 * snout, jaw, crest, eye — and those survive being small, which is the only
 * thing that matters for a button this size.
 */
const HEAD =
  'M4.9 19.3c-.7-4.4.3-8.3 3.2-10.8 3.1-2.7 7.7-2.7 10.8.2 1.3 1.2 2.2 2.6 2.7 4.2.3.9-.3 1.9-1.3 2.1l-3.5.6c-.6.1-1.1.6-1.2 1.2l-.5 2.5c-.2 1-1.1 1.7-2.1 1.7z'

/** Three spikes along the skull — what makes it read dragon, not lizard. */
const CREST = 'M8.4 7.6 7.2 4.9l3 1.2M12.2 5.7l-.4-3 2.6 2M16.4 6.6l.6-2.6 2.1 2.4'

export default function DinoMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="dino-mark"
    >
      <g>
        {/* Yellow carries the shape; red is the accent, exactly as the reward
            colour and the alert colour are used everywhere else in the app —
            so the mascot sits inside the palette rather than beside it. */}
        <path
          d={CREST}
          className="dino-body"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d={HEAD} className="dino-body" />
        <circle cx="14.4" cy="11.2" r="1.05" className="dino-eye" />
      </g>
    </svg>
  )
}
