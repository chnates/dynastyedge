// Tiny inline SVG trend line for daily value snapshots. Color follows net
// direction over the drawn window: up = success, down = danger, flat = muted.
export default function Sparkline({ data, width = 56, height = 16 }) {
  if (!data || data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min
  const pad = 1.5 // keep the stroke inside the viewBox at the extremes

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (width - pad * 2) + pad
      const y = span === 0
        ? height / 2
        : height - pad - ((v - min) / span) * (height - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const net = data[data.length - 1] - data[0]
  const colorClass = net > 0 ? 'text-success' : net < 0 ? 'text-danger' : 'text-text-tertiary'

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`shrink-0 ${colorClass}`}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
