import { useMemo, useState } from 'react'
import { Newspaper, Search } from 'lucide-react'
import { useNewsFeed } from '../../hooks/useNewsFeed'
import { useWatchlist } from '../../hooks/useWatchlist'
import { relativeTime } from '../../hooks/usePlayerIntel'
import { POS_TEXT } from '../../utils/positionColors'
import LoadingSpinner from '../shared/LoadingSpinner'
import SectionHeader from '../shared/SectionHeader'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'
import NewsArticleSheet from '../shared/NewsArticleSheet'

// League-wide news: the full aggregated feed, browsable and filterable.
// Per-player news lives in the profile drawer and a roster slice lives on
// The Edge — this is the "show me everything" view. Zero new data sources:
// it reads the same once-per-session feed via useNewsFeed.

const FILTERS = [
  { id: 'all',   label: 'All' },
  { id: 'mine',  label: 'My Players' },
  { id: 'watch', label: 'Watchlist' },
]

const BUCKET_ORDER = ['Today', 'Yesterday', 'Earlier']

function bucketOf(iso) {
  if (!iso) return 'Earlier'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 'Earlier'
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (t >= startToday) return 'Today'
  if (t >= startToday - 86400000) return 'Yesterday'
  return 'Earlier'
}

function NewsRow({ item, onOpen }) {
  return (
    <button
      onClick={onOpen}
      className="w-full py-2.5 border-b border-border-default dark:border-border-default last:border-0 text-left active:opacity-60 transition-opacity"
    >
      <div className="flex items-center gap-1.5">
        {item.player ? (
          <>
            <span className="font-body text-xs font-semibold text-text-primary dark:text-text-primary truncate">
              {item.player.name}
            </span>
            {item.player.position && (
              <span className={`font-body text-[10px] font-semibold uppercase shrink-0 ${POS_TEXT[item.player.position] ?? 'text-text-tertiary'}`}>
                {item.player.position}
              </span>
            )}
            {item.isMine && (
              <span className="shrink-0 font-body text-[9px] font-bold uppercase tracking-wider rounded px-1 py-0.5 bg-accent text-white">
                You
              </span>
            )}
          </>
        ) : (
          <span className="font-body text-[10px] font-semibold uppercase tracking-wider text-text-tertiary dark:text-text-tertiary">
            NFL
          </span>
        )}
        <span className="flex-1" />
        <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary shrink-0">
          {[item.source, relativeTime(item.published)].filter(Boolean).join(' · ')}
        </span>
      </div>
      <p
        className="font-body text-sm font-medium text-text-primary dark:text-text-primary leading-snug mt-1"
        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {item.headline}
      </p>
      {item.story && (
        <p
          className="font-body text-xs text-text-secondary dark:text-text-secondary leading-snug mt-0.5"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {item.story}
        </p>
      )}
    </button>
  )
}

export default function NewsView() {
  const { items, loading } = useNewsFeed()
  const { watchlist } = useWatchlist()
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [openArticle, setOpenArticle] = useState(null)

  const watchSet = useMemo(() => new Set(watchlist.map(String)), [watchlist])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter(n => {
      const onWatch = n.player && watchSet.has(String(n.player.sleeperId))
      if (filter === 'mine'  && !(n.isMine || onWatch)) return false
      if (filter === 'watch' && !onWatch) return false
      if (q) {
        const hay = `${n.headline} ${n.player?.name ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, filter, query, watchSet])

  // Light date grouping; sorted order is preserved within each bucket.
  const groups = useMemo(() => {
    const map = { Today: [], Yesterday: [], Earlier: [] }
    filtered.forEach(n => { map[bucketOf(n.published)].push(n) })
    return BUCKET_ORDER.map(label => ({ label, items: map[label] })).filter(g => g.items.length)
  }, [filtered])

  if (loading) return <LoadingSpinner message="Loading news…" />

  return (
    <div className="px-4 pb-6">
      <div className="pt-4 pb-3 border-b border-border-default dark:border-border-default">
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-0.5">
          League News
        </p>
        <p className="font-body text-sm text-text-secondary dark:text-text-secondary">
          The latest NFL news, tagged to your players where it lands.
        </p>
      </div>

      <div className="relative mt-3">
        <Search size={15} strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search news or players"
          className="w-full rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default pl-9 pr-3 py-2.5 font-body text-sm text-text-primary dark:text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
        />
      </div>

      <div className="flex gap-2 mt-3">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex-1 py-2 rounded-lg font-body text-xs font-semibold transition-colors ${
              filter === f.id
                ? 'bg-accent text-white'
                : 'bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default text-text-secondary dark:text-text-secondary'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6">
          <Newspaper size={32} strokeWidth={1.5} className="text-text-tertiary mb-3" />
          <p className="font-body text-sm text-text-secondary dark:text-text-secondary">
            {items.length === 0
              ? 'No news right now — check back later.'
              : 'No stories match your filter.'}
          </p>
        </div>
      ) : (
        groups.map(group => (
          <section key={group.label}>
            <SectionHeader label={group.label} count={group.items.length} />
            <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3">
              {group.items.map((n, i) => (
                <NewsRow
                  key={`${group.label}-${i}-${n.headline}`}
                  item={n}
                  onOpen={() => setOpenArticle(n)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {selectedPlayer && (
        <PlayerProfileDrawer
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      {openArticle && (
        <NewsArticleSheet
          article={openArticle}
          onClose={() => setOpenArticle(null)}
          onViewPlayer={p => { setOpenArticle(null); setSelectedPlayer(p) }}
        />
      )}
    </div>
  )
}
