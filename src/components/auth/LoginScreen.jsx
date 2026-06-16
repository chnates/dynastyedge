import { useState, useMemo } from 'react'
import { ChevronRight, ShieldCheck } from 'lucide-react'
import { SLEEPER_BASE } from '../../constants'
import { fetchJSON } from '../../utils/fetchJSON'
import { useIdentity } from '../../hooks/useIdentity'
import { useLeagueContext } from '../../context/LeagueContext'
import { getTeamName } from '../../hooks/useLeague'
import DynastyEdgeLogo from '../shared/DynastyEdgeLogo'
import TeamAvatar from '../shared/TeamAvatar'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'

// Neon edge-bar palette cycled across the team picker rows so the list reads
// colorful, not monochrome. Uses the app's identity tokens (never status-as-id).
const EDGE_BARS = [
  'bg-accent', 'bg-pos-def', 'bg-pos-wr', 'bg-pos-rb',
  'bg-pos-qb', 'bg-pos-te', 'bg-success', 'bg-warning',
]

// Gated sign-in: resolve a Sleeper username to a roster in this league (the
// real path we'll generalize later), with a tap-to-pick team list as the
// fallback. "Login" is read-only identity resolution against a public Sleeper
// endpoint — no password, no token, it never touches the user's account.
export default function LoginScreen() {
  const { league, loading, error, retry } = useLeagueContext()
  const { setIdentity } = useIdentity()

  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const rosters = useMemo(() => {
    const list = league?.allRosters ?? []
    return [...list].sort((a, b) => getTeamName(a.owner).localeCompare(getTeamName(b.owner)))
  }, [league])

  function pick(roster) {
    setIdentity({ userId: roster.owner?.user_id ?? null, rosterId: roster.rosterId })
  }

  async function submitUsername(e) {
    e.preventDefault()
    const clean = username.trim().toLowerCase()
    if (!clean || busy) return
    setBusy(true)
    setErr(null)
    try {
      const user = await fetchJSON(`${SLEEPER_BASE}/user/${encodeURIComponent(clean)}`, { label: 'Sleeper' })
      if (!user?.user_id) {
        setErr(`Couldn't find a Sleeper user named "${username.trim()}". Check the spelling or pick your team below.`)
        return
      }
      const roster = (league?.allRosters ?? []).find(r => r.owner?.user_id === user.user_id)
      if (!roster) {
        setErr(`"${username.trim()}" isn't a manager in this league. Pick your team below.`)
        return
      }
      setIdentity({ userId: user.user_id, rosterId: roster.rosterId })
    } catch {
      setErr('Something went wrong reaching Sleeper. Try again, or pick your team below.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      // Own fixed full-viewport scroller — the document body never scrolls
      // (index.css locks it), so this screen must scroll itself or the team
      // list gets clipped below the fold.
      className="fixed inset-0 overflow-y-auto login-bg text-text-primary font-body"
      style={{
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
        paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)',
      }}
    >
      <div className="max-w-[460px] mx-auto px-4">
        {/* Branding */}
        <div className="hero-card login-hero rounded-3xl px-6 py-9 mb-6 text-white text-center relative overflow-hidden">
          <div className="flex justify-center">
            <DynastyEdgeLogo theme="dark" size={132} />
          </div>
          <p className="font-display font-bold uppercase tracking-[0.14em] text-[13px] text-white/90 mt-4 hero-value">
            Your dynasty command center
          </p>
          <p className="font-body text-[13px] text-white/70 mt-1.5">
            Sign in with your Sleeper username to load your team.
          </p>
        </div>

        {loading && !league ? (
          <LoadingSpinner message="Loading league…" />
        ) : error && !league ? (
          <ErrorState message={error} onRetry={retry} />
        ) : (
          <>
            {/* Username sign-in */}
            <form
              onSubmit={submitUsername}
              className="bg-bg-card/80 backdrop-blur-sm border border-accent/30 rounded-2xl p-4 shadow-[0_0_30px_-10px_rgb(79_127_255_/_0.5)]"
            >
              <label htmlFor="sleeper-username" className="block font-display font-bold uppercase text-[11px] tracking-[0.08em] text-accent mb-2">
                Sleeper username
              </label>
              <div className="flex gap-2">
                <input
                  id="sleeper-username"
                  type="text"
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={username}
                  onChange={e => { setUsername(e.target.value); setErr(null) }}
                  placeholder="e.g. chnates"
                  className="flex-1 min-w-0 bg-bg-secondary border border-border-default rounded-xl px-3 py-2.5 font-body text-[15px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/40 transition-shadow"
                />
                <button
                  type="submit"
                  disabled={busy || !username.trim()}
                  className="neon-cta shrink-0 px-5 rounded-xl text-white font-body font-bold text-[14px] disabled:opacity-40 disabled:shadow-none flex items-center gap-1 transition-opacity"
                >
                  {busy ? '…' : <>Go <ChevronRight size={16} strokeWidth={2.5} /></>}
                </button>
              </div>
              {err && (
                <p className="font-body text-[13px] text-danger mt-2">{err}</p>
              )}
            </form>

            {/* Team picker fallback */}
            <div className="flex items-center gap-3 my-5">
              <span className="flex-1 h-px bg-gradient-to-r from-transparent to-accent/40" />
              <span className="font-display font-bold uppercase tracking-[0.1em] text-[11px] text-text-secondary">or pick your team</span>
              <span className="flex-1 h-px bg-gradient-to-l from-transparent to-pos-def/40" />
            </div>

            <div className="bg-bg-card/80 backdrop-blur-sm border border-border-default rounded-2xl overflow-hidden">
              {rosters.map((roster, i) => (
                <button
                  key={roster.rosterId}
                  onClick={() => pick(roster)}
                  className={`flex items-center gap-3 w-full pl-3 pr-4 py-3 text-left relative hover:bg-white/5 active:bg-white/10 transition-colors ${
                    i > 0 ? 'border-t border-border-default' : ''
                  }`}
                >
                  <span className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full ${EDGE_BARS[i % EDGE_BARS.length]}`} />
                  <TeamAvatar owner={roster.owner} size={34} className="ring-2 ring-white/10" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-body font-semibold text-[15px] text-text-primary truncate">
                      {getTeamName(roster.owner)}
                    </span>
                    {roster.owner?.username && (
                      <span className="block font-body text-[12px] text-text-tertiary truncate">
                        @{roster.owner.username}
                        {roster.hasRecord && ` · ${roster.record.wins}-${roster.record.losses}${roster.record.ties ? `-${roster.record.ties}` : ''}`}
                      </span>
                    )}
                  </span>
                  <ChevronRight size={18} strokeWidth={2} className="text-accent shrink-0" />
                </button>
              ))}
            </div>

            <div className="flex items-center justify-center gap-1.5 mt-5 px-4">
              <ShieldCheck size={14} strokeWidth={1.75} className="text-success shrink-0" />
              <p className="font-body text-[12px] text-text-tertiary text-center">
                Read-only. We never post to or change your Sleeper account.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
