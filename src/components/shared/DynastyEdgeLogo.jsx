const DARK = {
  bg: '#0B1120',
  border: '#1E3A5F',
  borderWidth: '1.5',
  symbol: '#4A90D9',
  secondary: '#C8D8EA',
}

const LIGHT = {
  bg: '#F5F5F0',
  border: '#0D1B2A',
  borderWidth: '2.5',
  symbol: '#0D1B2A',
  secondary: '#2A3A4A',
}

export default function DynastyEdgeLogo({ theme = 'dark', size = 88 }) {
  const c = theme === 'light' ? LIGHT : DARK

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="DynastyEdge"
      role="img"
    >
      {/* Card background */}
      <rect width="100" height="100" rx="8" fill={c.bg} />

      {/* Card border */}
      <rect x="1.5" y="1.5" width="97" height="97" rx="7" stroke={c.border} strokeWidth={c.borderWidth} fill="none" />

      {/* "01" — top left */}
      <text
        x="9"
        y="17"
        fontFamily="'IBM Plex Sans', system-ui, sans-serif"
        fontSize="10"
        fontWeight="300"
        fill={c.secondary}
      >01</text>

      {/* Football icon — top right */}
      {/* Pointed-oval body + horizontal center seam + vertical stitches */}
      <g stroke={c.secondary} strokeWidth="0.9" fill="none" strokeLinecap="round">
        <path d="M 78,13 C 80,8.5 90,8.5 92,13 C 90,17.5 80,17.5 78,13 Z" />
        <line x1="79" y1="13" x2="91" y2="13" />
        <line x1="83" y1="11.2" x2="83" y2="14.8" />
        <line x1="85" y1="10.5" x2="85" y2="15.5" />
        <line x1="87" y1="11.2" x2="87" y2="14.8" />
      </g>

      {/* "De" — dominant center element */}
      <text
        x="50"
        y="67"
        fontFamily="'IBM Plex Sans', system-ui, sans-serif"
        fontSize="53"
        fontWeight="300"
        fill={c.symbol}
        textAnchor="middle"
      >De</text>

      {/* "DYNASTYEDGE" — bottom */}
      <text
        x="50"
        y="90"
        fontFamily="'IBM Plex Sans', system-ui, sans-serif"
        fontSize="6.5"
        fontWeight="400"
        fill={c.secondary}
        textAnchor="middle"
        letterSpacing="1.5"
      >DYNASTYEDGE</text>
    </svg>
  )
}
