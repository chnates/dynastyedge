import { useState } from 'react'
import { getTeamName } from '../../hooks/useLeague'

// Sleeper avatar image with a colorful deterministic fallback.
// Sources, in order: custom team avatar URL (user.metadata.avatar),
// Sleeper CDN thumb (user.avatar id), gradient initial circle.
// Static <img> only — no fetch, so the fetchJSON rule doesn't apply.

// The initial-circle fallback, FLAT. It was eight two-stop gradients — the last
// gradient anywhere in the app after step 4, and Matchday has none. Flat colour
// also fixes something the gradient hid: the tint was `text-white` over a
// mid-weight ramp, which is the one colour rule an ink field forbids. These are
// the app's own position hues at full strength with the page ground reversed
// out, so the swatch belongs to the palette instead of importing eight more.
const FALLBACK_FIELDS = [
  'bg-pos-qb',
  'bg-pos-wr',
  'bg-pos-def',
  'bg-pos-te',
  'bg-pos-rb',
  'bg-alt',
  'bg-brand',
  'bg-text-primary',
]

function hashString(str) {
  let h = 7
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}

export default function TeamAvatar({ owner, size = 28, className = '' }) {
  const [imgFailed, setImgFailed] = useState(false)

  const name = getTeamName(owner)
  const url = owner?.metadata?.avatar
    ? owner.metadata.avatar
    : owner?.avatar
      ? `https://sleepercdn.com/avatars/thumbs/${owner.avatar}`
      : null

  if (url && !imgFailed) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setImgFailed(true)}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  const field = FALLBACK_FIELDS[hashString(name) % FALLBACK_FIELDS.length]
  return (
    <span
      aria-hidden="true"
      className={`rounded-full shrink-0 ${field} flex items-center justify-center text-bg-primary font-display font-extrabold uppercase select-none ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
    >
      {name.trim().charAt(0) || '?'}
    </span>
  )
}
