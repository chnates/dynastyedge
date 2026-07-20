import { useState } from 'react'
import { getTeamName } from '../../hooks/useLeague'

// Sleeper avatar image with a colorful deterministic fallback.
// Sources, in order: custom team avatar URL (user.metadata.avatar),
// Sleeper CDN thumb (user.avatar id), gradient initial circle.
// Static <img> only — no fetch, so the fetchJSON rule doesn't apply.

const FALLBACK_GRADIENTS = [
  'from-pink-500 to-rose-400',
  'from-sky-500 to-cyan-400',
  'from-violet-500 to-purple-400',
  'from-amber-500 to-orange-400',
  'from-teal-500 to-emerald-400',
  'from-blue-500 to-indigo-400',
  'from-fuchsia-500 to-pink-400',
  'from-lime-500 to-green-400',
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

  const grad = FALLBACK_GRADIENTS[hashString(name) % FALLBACK_GRADIENTS.length]
  return (
    <span
      aria-hidden="true"
      className={`rounded-full shrink-0 bg-gradient-to-br ${grad} flex items-center justify-center text-white font-display uppercase select-none ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
    >
      {name.trim().charAt(0) || '?'}
    </span>
  )
}
