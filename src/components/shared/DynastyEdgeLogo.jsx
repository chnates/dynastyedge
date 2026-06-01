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
      <g stroke={c.secondary} strokeWidth="0.9" fill="none" strokeLinecap="round">
        <ellipse cx="84" cy="13" rx="8.5" ry="4.5" />
        <line x1="84" y1="8.5" x2="84" y2="17.5" />
        {/* Lace marks — tightly grouped in center so it reads as lacing, not a globe */}
        <line x1="82.5" y1="11.2" x2="85.5" y2="11.2" />
        <line x1="82.5" y1="12.4" x2="85.5" y2="12.4" />
        <line x1="82.5" y1="13.6" x2="85.5" y2="13.6" />
        <line x1="82.5" y1="14.8" x2="85.5" y2="14.8" />
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
