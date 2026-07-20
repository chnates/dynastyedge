// Crown Crest lockup: gradient crown mark (three ascending bars as crown
// prongs, jewel dots above the tips, detached circlet band) + wordmark.
// The crown geometry is mirrored in scripts/generate-icons.mjs (app icon /
// favicons) — keep the two in sync, and re-run that script after changes.

const GRADIENT_FROM = '#4F7FFF'
const GRADIENT_TO = '#A78BFA'

export default function DynastyEdgeLogo({ theme = 'dark', size = 88 }) {
  const markSize = Math.round(size * 0.5)
  const fontSize = Math.round(size * 0.3)
  const textColor = theme === 'light' ? '#0D0D0F' : '#F0F0F5'

  return (
    <div
      className="flex items-center"
      style={{ gap: Math.round(size * 0.1) }}
      aria-label="DynastyEdge"
      role="img"
    >
      <svg width={markSize} height={markSize} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="de-crown-grad" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={GRADIENT_FROM} />
            <stop offset="1" stopColor={GRADIENT_TO} />
          </linearGradient>
        </defs>
        <g fill="url(#de-crown-grad)">
          <circle cx="28" cy="39" r="4.5" />
          <circle cx="48" cy="27" r="4.5" />
          <circle cx="68" cy="15" r="4.5" />
          <rect x="22" y="48" width="12" height="12" rx="5" />
          <rect x="42" y="36" width="12" height="24" rx="5" />
          <rect x="62" y="24" width="12" height="36" rx="5" />
          <rect x="20" y="66" width="56" height="10" rx="5" />
        </g>
      </svg>
      <span
        className="font-display uppercase leading-none tracking-wide whitespace-nowrap"
        style={{ fontSize, color: textColor }}
      >
        Dynasty
        <span
          style={{
            backgroundImage: `linear-gradient(90deg, ${GRADIENT_FROM}, ${GRADIENT_TO})`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          Edge
        </span>
      </span>
    </div>
  )
}
