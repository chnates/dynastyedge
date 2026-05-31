const SLEEPER_BASE = 'https://api.sleeper.app/v1'
const TIMEOUT_MS = 8_000

const RED_KEYWORDS = [
  'out', ' ir ', 'placed on ir', 'torn', 'surgery', 'fracture', 'fractures',
  'doubtful', 'ruled out', 'season-ending', 'season ending', 'won\'t return',
  'will not return', 'lost for the season', 'placed on the ir',
]
const YELLOW_KEYWORDS = [
  'questionable', 'limited', 'managing', 'day-to-day', 'dnp',
  'did not practice', 'probable', 'nursing', 'sore', 'dealing with',
  'expected to be limited',
]

function classifyStatus(text) {
  const lower = (text ?? '').toLowerCase()
  if (RED_KEYWORDS.some(k => lower.includes(k))) return 'Out'
  if (YELLOW_KEYWORDS.some(k => lower.includes(k))) return 'Questionable'
  return 'Healthy'
}

function formatDate(timestamp) {
  if (!timestamp) return ''
  // Sleeper timestamps may be seconds or milliseconds
  const ms = timestamp > 1e10 ? timestamp : timestamp * 1000
  const d = new Date(ms)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

async function fetchSleeperNews(player) {
  if (!player.sleeperId) {
    return { newsItems: [], injuryStatus: 'Healthy' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(
      `${SLEEPER_BASE}/players/nfl/${player.sleeperId}/news`,
      { signal: controller.signal }
    )

    if (!res.ok) return { newsItems: [], injuryStatus: 'Healthy' }

    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) {
      return { newsItems: [], injuryStatus: 'Healthy' }
    }

    const recent = data.slice(0, 2)
    const newsItems = recent.map(item => ({
      headline: item.title ?? item.headline ?? item.metadata?.title ?? '',
      date: formatDate(item.published ?? item.date ?? item.created ?? item.metadata?.published),
    })).filter(n => n.headline)

    // Derive status from most recent item's headline + body
    const combinedText = recent.map(item =>
      [item.title, item.headline, item.body, item.metadata?.description].join(' ')
    ).join(' ')
    const injuryStatus = classifyStatus(combinedText)

    return { newsItems, injuryStatus }
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchPlayerIntelligence(players) {
  if (!players?.length) return []

  const limited = players.slice(0, 6)

  return Promise.all(
    limited.map(async (player) => {
      try {
        const { newsItems, injuryStatus } = await fetchSleeperNews(player)
        return {
          playerName: player.name,
          side: player.side ?? null,
          injuryStatus,
          newsItems,
          error: null,
        }
      } catch {
        return {
          playerName: player.name,
          side: player.side ?? null,
          injuryStatus: 'Healthy',
          newsItems: [],
          error: null,
        }
      }
    })
  )
}
