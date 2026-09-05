import { useMemo, useRef, useState } from 'react'
import { ChevronDown, TrendingUp, TrendingDown, Info, Target } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { useRookieResearch } from '../../hooks/useRookieResearch'
import { topTargets, splitDivergence } from '../../utils/rookieResearch'
import { joinAnd } from '../../utils/recommendations'
import { POS_CHIP_ACTIVE, POS_TEXT } from '../../utils/positionColors'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'
import {
  Card, Chip, Badge, SearchInput, SectionHeader, Spinner, ErrorState, Button,
} from '../ui'

const POS_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE']
// Plain-English sort labels: "Market" and "Camp movers" read as jargon on a
// page whose whole problem was that nobody could tell what it was for.
const SORTS = [
  { id: 'fit',    label: 'Best for me' },
  { id: 'score',  label: 'Opportunity' },
  { id: 'market', label: 'Dynasty value' },
  { id: 'move',   label: 'Camp risers' },
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
            {row.fitsNeed && <Badge tone="success" soft>Your need</Badge>}
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
          <div className="font-mono text-[9px] uppercase tracking-wider text-text-tertiary mt-0.5">value</div>
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

// The roster-aware shortlist. Every other card on this page ranks the class in
// the abstract; this one answers "who should I take with my picks?".
function TargetCard({ row, onOpen }) {
  return (
    <Card padding="sm" cut accent="bg-pos-qb" interactive onClick={() => onOpen(row)} className="w-full text-left">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-sm text-text-primary dark:text-text-primary truncate">{row.name}</span>
        <span className={`font-mono text-xs shrink-0 ${TIER_TEXT[row.tier] ?? 'text-text-tertiary'}`}>
          {pct(row.score)} opp
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
        <span className={`font-mono text-[10px] uppercase ${POS_TEXT[row.position] ?? ''}`}>{row.position}</span>
        {row.team && <span className="font-mono text-[10px] text-text-tertiary">{row.team}</span>}
        <span className="font-mono text-[10px] text-text-tertiary">
          {row.value ? `${row.value.toLocaleString()} value` : 'unranked'}
          {row.adp != null ? ` · rookie ADP ${row.adp}` : ''}
        </span>
      </div>
      <p className="text-xs text-text-secondary dark:text-text-secondary mt-1 leading-snug">{row.depthText}</p>
      {row.fitReasons.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {row.fitReasons.map((r, i) => (
            <li key={i} className="text-[11px] leading-snug text-success">· {r}</li>
          ))}
        </ul>
      )}
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
      <p className="text-[11px] text-text-secondary dark:text-text-secondary mt-1 leading-snug">
        {up
          ? `The model has him ${row.divergence} spots higher than the market does among ${row.position}s.`
          : `The market has him ${Math.abs(row.divergence)} spots higher than the model does among ${row.position}s.`}
      </p>
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
  // The board is composed by the shared hook, which the profile drawer reads
  // too — one build of the class per data load, and no second copy of the
  // composition to drift from this one.
  const { rows, intel, deficits, tier, loading: researchLoading } = useRookieResearch()

  const [query, setQuery] = useState('')
  const [pos, setPos] = useState('ALL')
  const [sort, setSort] = useState('fit')
  const [selected, setSelected] = useState(null)
  const [showHow, setShowHow] = useState(false)
  const boardRef = useRef(null)

  const targets = useMemo(() => topTargets(rows), [rows])
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
    if (sort === 'fit') return filtered.sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1) || byScore(a, b))
    if (sort === 'move') {
      return filtered
        .filter(r => r.move)
        .sort((a, b) => Math.abs(b.move.delta) - Math.abs(a.move.delta) || byScore(a, b))
    }
    return filtered.sort(byScore)
  }, [rows, query, pos, sort])

  if (error) return <ErrorState message="Couldn't load the rookie class." onRetry={retry} />
  if (leagueLoading || researchLoading) return <Spinner />

  const asOf = intel?.asOf ?? null
  const needList = [...deficits]

  return (
    <div className="px-4 pb-8">
      {/* What this page is, in the fewest words that actually work. It stays
          open: the page's original failure was that nothing on screen said
          what an "opp" number meant or where to start. */}
      <Card padding="sm" accent="bg-accent" className="mt-4">
        <div className="text-sm font-semibold text-text-primary dark:text-text-primary">
          Scout the rookie class
        </div>
        <p className="text-xs text-text-secondary dark:text-text-secondary mt-1 leading-relaxed">
          Dynasty value tells you what a rookie <em>costs</em>. This page scores what he
          might <em>become</em>: an <span className="text-text-primary dark:text-text-primary font-semibold">opportunity
          score</span> from 0–100 built on where he sits on his NFL depth chart, what his
          team spent to draft him — the two things a value number doesn't price.
        </p>
        <ol className="text-xs text-text-secondary dark:text-text-secondary mt-2 space-y-1 leading-relaxed">
          <li><span className="font-mono text-[10px] text-accent mr-1.5">1</span>
            <span className="text-text-primary dark:text-text-primary font-semibold">Your Targets</span> — who fits
            your roster's holes. Start here.</li>
          <li><span className="font-mono text-[10px] text-accent mr-1.5">2</span>
            <span className="text-text-primary dark:text-text-primary font-semibold">Market vs Model</span> — where
            the price and the opportunity disagree. That gap is the edge.</li>
          <li><span className="font-mono text-[10px] text-accent mr-1.5">3</span>
            <span className="text-text-primary dark:text-text-primary font-semibold">Tap any player</span> for the
            full scouting card — depth chart, capital, news, and what he'd mean for you.</li>
        </ol>
      </Card>

      {/* The feed is best-effort by construction (Actions-published branch), so
          a missing file is an expected state with an explanation — never an
          ErrorState, which would imply the user can retry into a fix. */}
      {!intel && (
        <Card padding="sm" accent="bg-warning" className="mt-3">
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

      {targets.length > 0 && (
        <>
          <SectionHeader label="Your Targets" />
          <p className="text-xs text-text-secondary dark:text-text-secondary -mt-0.5 mb-2 leading-relaxed">
            {needList.length > 0
              ? <>Your roster is below league average at{' '}
                  <span className="text-text-primary dark:text-text-primary font-semibold">{joinAnd(needList)}</span>
                  {tier ? `, and you're ${tier.toLowerCase()}` : ''} — so these rookies are ranked by
                  opportunity <em>and</em> what they'd fix.</>
              : <>You're at or above league average everywhere{tier ? `, and you're ${tier.toLowerCase()}` : ''} —
                  with no hole to fill, these are ranked on opportunity and market price.</>}
          </p>
          <div className="space-y-2 mb-1">
            {targets.map(r => (
              <TargetCard key={r.sleeperId} row={r} onOpen={setSelected} />
            ))}
          </div>
          <Button
            variant="tinted"
            size="sm"
            fullWidth
            className="mt-2"
            onClick={() => {
              setSort('fit'); setPos('ALL'); setQuery('')
              // The board it re-ranks is below two full sections — without the
              // scroll the tap changes state the user can't see.
              boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            icon={<Target size={13} aria-hidden="true" />}
          >
            See the whole class ranked for my roster
          </Button>
        </>
      )}

      {(undervalued.length > 0 || overvalued.length > 0) && (
        <>
          <SectionHeader label="Market vs Model" />
          <p className="text-xs text-text-secondary dark:text-text-secondary -mt-0.5 mb-2 leading-relaxed">
            Where this model and the dynasty market disagree most. The number is how many
            spots apart they rank him — compared only against other rookies at his own
            position, which is the only fair comparison.
          </p>
          {undervalued.length > 0 && (
            <>
              <div className="font-mono text-[10px] uppercase tracking-wider text-success mb-1.5">
                Model likes them more — buy candidates
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
                Market likes them more — priced ahead of the role
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

      <div ref={boardRef} className="scroll-mt-4">
        <SectionHeader label="Opportunity Board" count={visible.length} />
      </div>
      <p className="text-xs text-text-secondary dark:text-text-secondary -mt-0.5 mb-2 leading-relaxed">
        Every rookie, with the opportunity score on the left and dynasty value on the right.
        <span className="text-success"> 62+ strong</span> ·
        <span className="text-warning"> 38–61 fair</span> ·
        <span className="text-text-tertiary"> under 38 thin</span>.
      </p>

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
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none mb-1">
        {SORTS.map(s => (
          <Chip key={s.id} size="sm" active={sort === s.id} onClick={() => setSort(s.id)}>
            {s.label}
          </Chip>
        ))}
      </div>
      <p className="text-[11px] text-text-tertiary dark:text-text-tertiary mb-3">
        Sorted by {SORTS.find(s => s.id === sort)?.label.toLowerCase()}
        {sort === 'fit' && ' — opportunity and value, weighted toward your roster holes'}
        {sort === 'score' && ' — the raw model score, ignoring your roster'}
        {sort === 'market' && ' — what the dynasty market charges, ignoring the model'}
        {sort === 'move' && ' — biggest depth-chart movers since the feed started tracking'}
      </p>

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
            That blend answers <em>will he play this year</em>. Dynasty asks a longer
            question, so the score is then tilted 10% toward youth, measured against
            his own position — a 22-year-old QB is normal, a 22-year-old WR is not.
            Over 712 rookies in nine classes that tilt improves the years-2-and-3
            ordering by <span className="font-mono">+0.018</span> rho (better in 8 of 9
            classes) and costs nothing measurable in year 1. A rookie with no known
            draft age — nearly every undrafted one — is left untilted rather than
            guessed at.
          </p>
          <p>
            A depth rank is scored by what it's <em>worth at that position</em>. A QB2
            is a backup, but an RB3 still plays — so the same ordinal is not the same
            opportunity.
          </p>
          <p>
            <span className="text-text-primary dark:text-text-primary font-semibold">Your Targets</span> re-ranks
            that score for your roster: it adds the market price back in, then leans toward
            positions where you're below league average and toward the kind of rookie your
            win window wants. It never changes a player's opportunity score — it only
            changes the order. That re-ranking is a judgement call, not a back-tested one.
          </p>
          <p>
            <span className="text-text-primary dark:text-text-primary font-semibold">Camp movement, height, weight and the combine
            drills are shown but not scored.</span> Camp movement can't be back-tested yet
            (the historical depth-chart feed starts in August, so there's no pre-camp
            baseline). Combine athleticism was tested and is a null — it moved the
            held-out correlation by +0.002, and only about half of any class runs the
            drills. College production was tested too, and also didn't earn a place.
            Age is the one measurable that did.
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
          research={selected}
        />
      )}
    </div>
  )
}
