// Crown Crest lockup: the crown mark (three ascending bars as crown prongs,
// jewel dots above the tips, a detached circlet band) plus the wordmark.
//
// MATCHDAY RE-CUT (step 4). The Blackout cut wore a red-ramp GRADIENT on the
// crown and a silver gradient on "EDGE", with rounded bars — three things
// Matchday does not have (flat colour, hard edges, no gradients anywhere), and
// the wordmark was set in Anton, a family the app stopped loading in step 3, so
// the in-app lockup had been falling back to a system font.
//
// What it is now: two flat colours and one reversal. The crown is the page's
// own ground reversed out of a solid crimson field — the same `.ink-field`
// move the hero, the band and the tab bar make, in the brand spot rather than
// in ink. The wordmark follows the <Mark> idiom exactly: "DYNASTY" in plain
// ink, "EDGE" reversed out of a crimson block. That is the one place the
// rationed red belongs (an identity mark), and it needs no gradient to carry.
//
// The crown geometry is mirrored in scripts/generate-icons.mjs (app icon and
// favicons) — keep the two in sync, and re-run that script after any change.

const BRAND = { dark: '#C8102E', light: '#A71930' }
const PAPER = { dark: '#0E0E0D', light: '#F4F2EC' }
const INK   = { dark: '#F6F4EE', light: '#111110' }

export default function DynastyEdgeLogo({ theme = 'dark', size = 88 }) {
  const markSize = Math.round(size * 0.5)
  const fontSize = Math.round(size * 0.3)
  const brand = BRAND[theme] ?? BRAND.dark
  const ground = PAPER[theme] ?? PAPER.dark
  const ink = INK[theme] ?? INK.dark

  return (
    <div
      className="flex items-center"
      style={{ gap: Math.round(size * 0.1) }}
      aria-label="DynastyEdge"
      role="img"
    >
      {/* A solid crimson field with the crown reversed out of it — square,
          flat, no gradient, no radius. */}
      <svg width={markSize} height={markSize} viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
        <rect width="96" height="96" fill={brand} />
        <g fill={ground}>
          <rect x="23.5" y="34.5" width="9" height="9" />
          <rect x="43.5" y="22.5" width="9" height="9" />
          <rect x="63.5" y="10.5" width="9" height="9" />
          <rect x="22" y="48" width="12" height="12" />
          <rect x="42" y="36" width="12" height="24" />
          <rect x="62" y="24" width="12" height="36" />
          <rect x="20" y="66" width="56" height="10" />
        </g>
      </svg>
      <span
        className="font-display font-extrabold uppercase leading-none tracking-[-0.02em] whitespace-nowrap"
        style={{ fontSize, color: ink }}
      >
        Dynasty
        <span style={{ backgroundColor: brand, color: ground, padding: '0 0.14em' }}>
          Edge
        </span>
      </span>
    </div>
  )
}
