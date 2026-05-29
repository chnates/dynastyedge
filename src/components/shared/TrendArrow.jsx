export default function TrendArrow({ trend }) {
  if (trend > 50) return <span className="text-success text-xs font-mono">↑</span>
  if (trend < -50) return <span className="text-danger text-xs font-mono">↓</span>
  return <span className="text-text-tertiary dark:text-text-tertiary text-xs font-mono">→</span>
}
