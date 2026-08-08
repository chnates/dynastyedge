import { useMemo, useState } from 'react'
import { ChevronDown, TrendingUp, TrendingDown, Info } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { useRookieADP } from '../../hooks/useRookieADP'
import { useRookieIntel } from '../../hooks/useRookieIntel'
import { buildRookieProspects } from '../../utils/rookieAdp'
import { buildRookieResearch, splitDivergence } from '../../utils/rookieResearch'
import { POS_CHIP_ACTIVE, POS_TEXT } from '../../utils/positionColors'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'
import {
  Card, Chip, Badge, SearchInput, SectionHeader, Spinner, ErrorState, Button,
} from '../ui'

const POS_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE']
const SORTS = [
  { id: 'score',  label: 'Opportunity' },
  { id: 'market', label: 'Market' },
  { id: 'move',   label: 'Camp movers' },
]

const TIER_TEXT = {
  strong: 'text-success dark:text-success',
  fair:   'text-warning dark:text-warning',
  weak:   'text-text-tertiary dark:text-text-tertiary',
}
const REASON_TONE = {
  good: 'text-success dark:text-success',
  flat: 'text-text-secondary dark:text-text-secondary',
  bad:  'text-danger dark:text-danger',
}

// Score reads as 0–100 on screen; the model works in 0–1.
const pct = score => (score == null ? '—' : String(Math.round(score * 100)))

function MoveChip({ move }) {
  if (!move) return null
  const up = move.direction === 'up'
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
      up ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
    }`}>
      <Icon size={11} aria-hidden="true" />
      {Math.abs(move.delta)} {Math.abs(move.delta) === 1 ? 'spot' : 'spots'}
    </span>
  )
}

function RookieRow({ row, onOpen }) {
  const capital = row.pick == null
    ? (row.noData ? '—' : 'UDFA')
    : `${row.round ? `R${row.round} · ` : ''}#${row.pick}`
  return (
    <Card padding="sm" interactive onClick={() => onOpen(row)} className="w-full text-left">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 text-center">
          <div className={`font-mono text-lg leading-none ${TIER_TEXT[row.tier] ?? 'text-text-tertiary'}`}>
            {pct(row.score)}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-text-tertiary mt-0.5">opp</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="font-semibold text-sm text-text-primary dark:text-text-primary truncate">{row.name}</span>
            <span className={`font-mono text-[10px] uppercase ${POS_TEXT[row.position] ?? 'text-text-tertiary'}`}>
              {row.position}
            </span>
            {row.team && <span className="font-mono text-[10px] text-text-tertiary">{row.team}</span>}
          </div>
          <div className="text-xs text-text-secondary dark:text-text-secondary mt-0.5 truncate">
            {row.noData ? 'No depth-chart or draft record yet' : row.depthText}
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="font-mono text-[10px] text-text-tertiary">{capital}</span>
            {row.slot && <span className="font-mono text-[10px] text-text-tertiary">{row.slot}{row.rank ?? ''}</span>}
            <MoveChip move={row.move} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-sm text-text-primary dark:text-text-primary">
            {row.value ? row.value.toLocaleString() : '—'}
          </div>
          {row.divergence != null && Math.abs(row.divergence) >= 8 && (
            <div className={`font-mono text-[10px] mt-0.5 ${row.divergence > 0 ? 'text-success' : 'text-danger'}`}>
              {row.divergence > 0 ? '+' : ''}{row.divergence}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function DivergenceCard({ row, onOpen, kind }) {
  const up = kind === 'under'
  return (
    <Card
      padding="sm"
      cut
      accent={up ? 'bg-success' : 'bg-danger'}
      interactive
      onClick={() => onOpen(row)}
      className="w-full text-left"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-sm text-text-primary dark:text-text-primary truncate">{row.name}</span>
        <span className={`font-mono text-xs shrink-0 ${up ? 'text-success' : 'text-danger'}`}>
          {up ? '+' : ''}{row.divergence}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className={`font-mono text-[10px] uppercase ${POS_TEXT[row.position] ?? ''}`}>{row.position}</span>
        {row.team && <span className="font-mono text-[10px] text-text-tertiary">{row.team}</span>}
        <span className="font-mono text-[10px] text-text-tertiary">
          market #{row.marketRank} · model #{row.modelRank}
        </span>
      </div>
      <ul className="mt-1.5 space-y-0.5">
        {row.reasons.map((r, i) => (
          <li key={i} className={`text-[11px] leading-snug ${REASON_TONE[r.tone]}`}>· {r.text}</li>
        ))}
      </ul>
    </Card>
  )
}

export default function RookieResearchView() {
  const { loading: leagueLoading, error, retry, values } = useLeagueContext()
  const { rookieMap, loading: rookiesLoading } = useRookieADP()
  const { intel, loading: intelLoading } = useRookieIntel()

  const [query, setQuery] = useState('')
  const [pos, setPos] = useState('ALL')
  const [sort, setSort] = useState('score')
  const [selected, setSelected] = useState(null)
  const [showHow, setShowHow] = useState(false)

  const rows = useMemo(() => {
    const prospects = buildRookieProspects(rookieMap, values?.playerMap)
    return buildRookieResearch(prospects, intel)
  }, [rookieMap, values, intel])

  const { undervalued, overvalued } = useMemo(() => splitDivergence(rows), [rows])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = rows.filter(r =>
      (pos === 'ALL' || r.position === pos) &&
      (!q || r.name.toLowerCase().includes(q)))
    // Dynasty value breaks ties. It matters most when the feed hasn't
    // published: every score is null, so without this the order is arbitrary
    // and the board leads with unranked deep-stash names instead of the
    // players the market actually rates.
    const byScore = (a, b) =>
      (b.score ?? -1) - (a.score ?? -1) || (b.value ?? -1) - (a.value ?? -1)
    if (sort === 'market') return filtered.sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
    if (sort === 'move') {
      return filtered
        .filter(r => r.move)
        .sort((a, b) => Math.abs(b.move.delta) - Math.abs(a.move.delta) || byScore(a, b))
    }
    return filtered.sort(byScore)
  }, [rows, query, pos, sort])

  if (error) return <ErrorState message="Couldn't load the rookie class." onRetry={retry} />
  if (leagueLoading || rookiesLoading || intelLoading) return <Spinner />

  const asOf = intel?.asOf ?? null

  return (
    <div className="px-4 pb-8">
      {/* The feed is best-effort by construction (Actions-published branch), so
          a missing file is an expected state with an explanation — never an
          ErrorState, which would imply the user can retry into a fix. */}
      {!intel && (
        <Card padding="sm" accent="bg-warning" className="mt-4">
          <div className="text-sm font-semibold text-text-primary dark:text-text-primary">
            Rookie intel hasn't published yet
          </div>
          <p className="text-xs text-text-secondary dark:text-text-secondary mt-1 leading-relaxed">
            Depth charts and NFL draft capital come from a daily GitHub Action.
            Until its first run lands, this page shows the rookie class at market
            value only — opportunity scores appear once the feed is live.
          </p>
        </Card>
      )}

      {(undervalued.length > 0 || overvalued.length > 0) && (
        <>
          <SectionHeader label="Market vs Model" />
          <p className="text-xs text-text-secondary dark:text-text-secondary -mt-0.5 mb-2 leading-relaxed">
            Where this model and the dynasty market disagree most. The number is
            the gap between market rank and model rank.
          </p>
          {undervalued.length > 0 && (
            <>
              <div className="font-mono text-[10px] uppercase tracking-wider text-success mb-1.5">
                Model likes them more
              </div>
              <div className="space-y-2 mb-3">
                {undervalued.map(r => (
                  <DivergenceCard key={r.sleeperId} row={r} kind="under" onOpen={setSelected} />
                ))}
              </div>
            </>
          )}
          {overvalued.length > 0 && (
            <>
              <div className="font-mono text-[10px] uppercase tracking-wider text-danger mb-1.5">
                Market likes them more
              </div>
              <div className="space-y-2">
                {overvalued.map(r => (
                  <DivergenceCard key={r.sleeperId} row={r} kind="over" onOpen={setSelected} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <SectionHeader label="Opportunity Board" count={visible.length} />

      <SearchInput
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search rookies"
        className="mb-2"
      />
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none mb-2">
        {POS_FILTERS.map(p => (
          <Chip
            key={p}
            size="sm"
            active={pos === p}
            activeClass={p === 'ALL' ? undefined : POS_CHIP_ACTIVE[p]}
            onClick={() => setPos(p)}
          >
            {p}
          </Chip>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none mb-3">
        {SORTS.map(s => (
          <Chip key={s.id} size="sm" active={sort === s.id} onClick={() => setSort(s.id)}>
            {s.label}
          </Chip>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-text-secondary dark:text-text-secondary py-6 text-center">
          {sort === 'move'
            ? 'No rookie has changed depth-chart position yet this camp.'
            : 'No rookies match this filter.'}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map(r => (
            <RookieRow key={r.sleeperId} row={r} onOpen={setSelected} />
          ))}
        </div>
      )}

      {/* ── How this works ── */}
      <Button
        variant="ghost"
        size="sm"
        fullWidth
        onClick={() => setShowHow(v => !v)}
        aria-expanded={showHow}
        className="justify-start gap-1.5 px-0 mt-5 font-mono text-[10px] uppercase tracking-wider"
        icon={<Info size={13} aria-hidden="true" />}
      >
        How this works
        <ChevronDown
          size={13}
          className={`transition-transform ${showHow ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </Button>
      {showHow && (
        <Card padding="sm" className="space-y-2.5 text-xs leading-relaxed text-text-secondary dark:text-text-secondary">
          <p>
            <span className="text-text-primary dark:text-text-primary font-semibold">Opportunity</span> blends
            two things a dynasty value doesn't price: where a rookie sits on his NFL
            depth chart, and what his team spent to draft him — 30% depth, 70% capital.
          </p>
          <p>
            Those weights come from a back-test of 396 drafted skill rookies across
            2021–2025. Draft capital alone predicts a rookie season at rho +0.60 and
            the depth chart alone at +0.54; blended they reach <span className="font-mono">+0.66</span>.
          </p>
          <p>
            A depth rank is scored by what it's <em>worth at that position</em>. A QB2
            is a backup, but an RB3 still plays — so the same ordinal is not the same
            opportunity.
          </p>
          <p>
            <span className="text-text-primary dark:text-text-primary font-semibold">Camp movement is shown, not scored.</span> It
            can't be back-tested yet (the historical depth-chart feed starts in August,
            so there's no pre-camp baseline to measure against).
          </p>
          <p>
            <span className="text-text-primary dark:text-text-primary font-semibold">Preseason stats are deliberately absent.</span> They
            predict a rookie season at rho −0.20 — good rookies sit in August, so
            preseason usage measures job insecurity, not talent.
          </p>
          <p className="text-text-tertiary dark:text-text-tertiary">
            This is a model, not a forecast. It reads opportunity, which is knowable —
            it can't know breakouts, injuries, or a coach changing his mind.
            {asOf && <> Depth charts as of {asOf}.</>}
          </p>
        </Card>
      )}

      {selected && (
        <PlayerProfileDrawer
          player={selected}
          playerMap={values?.playerMap ?? {}}
          onClose={() => setSelected(null)}
          isDraftContext
        />
      )}
    </div>
  )
}
