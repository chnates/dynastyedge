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
        <ellipse cx="84" cy="13" rx="8" ry="4" />
        <line x1="84" y1="9" x2="84" y2="17" />
        <line x1="82" y1="11" x2="86" y2="11" />
        <line x1="82" y1="13" x2="86" y2="13" />
        <line x1="82" y1="15" x2="86" y2="15" />
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
