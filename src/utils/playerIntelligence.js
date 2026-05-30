const TIMEOUT_MS = 10_000

function buildPrompt(player) {
  return `You are a dynasty fantasy football analyst. Research the current status of ${player.name} (${player.position}${player.team ? `, ${player.team}` : ''}) who has a dynasty trade value of ${player.value || 0}.

Use web search to find: current injury status and official designation, recent usage trends (snap %, target share, or rush touches over the last 3 games), depth chart situation, and any news from the last 2 weeks that materially affects dynasty fantasy value.

Respond with ONLY valid JSON — no other text before or after:
{"injuryStatus":"Healthy","usageTrend":"stable","depthChartNote":"","newsAlert":null,"buyLowSellHigh":"hold","confidence":"high"}

Rules:
- injuryStatus must be exactly one of: "Healthy", "Questionable", "Out"
- usageTrend must be exactly one of: "increasing", "stable", "declining"
- buyLowSellHigh must be exactly one of: "buy", "sell", "hold"
- confidence must be exactly one of: "high", "medium", "low"
- newsAlert: brief string if there is significant news, null if nothing material`
}

function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object found in response')
  return JSON.parse(match[0])
}

async function callAgentForPlayer(player) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY not configured')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: buildPrompt(player) }],
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`API ${res.status}: ${body.slice(0, 120)}`)
    }

    const data = await res.json()

    // The model may emit tool_use blocks before the final text block
    const textBlocks = (data.content || []).filter(b => b.type === 'text')
    const lastText = textBlocks[textBlocks.length - 1]
    if (!lastText?.text) throw new Error('No text block in response')

    const parsed = extractJSON(lastText.text)
    return {
      playerName: player.name,
      side: player.side ?? null,
      injuryStatus: parsed.injuryStatus ?? 'Healthy',
      usageTrend: parsed.usageTrend ?? 'stable',
      depthChartNote: parsed.depthChartNote ?? '',
      newsAlert: parsed.newsAlert ?? null,
      buyLowSellHigh: parsed.buyLowSellHigh ?? 'hold',
      confidence: parsed.confidence ?? 'medium',
      error: null,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchPlayerIntelligence(players) {
  if (!players?.length) return []
  if (!import.meta.env.VITE_ANTHROPIC_API_KEY) return []

  const limited = players.slice(0, 6)

  return Promise.all(
    limited.map(async (player) => {
      try {
        return await callAgentForPlayer(player)
      } catch (err) {
        return {
          playerName: player.name,
          side: player.side ?? null,
          injuryStatus: null,
          usageTrend: null,
          depthChartNote: null,
          newsAlert: null,
          buyLowSellHigh: null,
          confidence: null,
          error: err.name === 'AbortError' ? 'Request timed out' : 'Live data unavailable',
        }
      }
    })
  )
}
