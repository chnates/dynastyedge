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
      className="min-h-screen app-bg text-text-primary font-body overflow-y-auto"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="max-w-[460px] mx-auto px-4 pt-8 pb-10">
        {/* Branding */}
        <div className="hero-card rounded-2xl px-6 py-8 mb-6 text-white text-center">
          <div className="flex justify-center">
            <DynastyEdgeLogo theme="dark" size={120} />
          </div>
          <p className="font-body text-[15px] text-white/80 mt-3">
            Your dynasty command center.
          </p>
          <p className="font-body text-[13px] text-white/60 mt-1">
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
            <form onSubmit={submitUsername} className="bg-bg-card border border-border-default rounded-xl p-4">
              <label htmlFor="sleeper-username" className="block font-display font-bold uppercase text-[11px] tracking-[0.08em] text-text-secondary mb-2">
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
                  className="flex-1 min-w-0 bg-bg-secondary border border-border-default rounded-lg px-3 py-2.5 font-body text-[15px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={busy || !username.trim()}
                  className="shrink-0 px-4 rounded-lg bg-accent text-white font-body font-semibold text-[14px] disabled:opacity-40 flex items-center gap-1"
                >
                  {busy ? '…' : <>Go <ChevronRight size={16} strokeWidth={2.25} /></>}
                </button>
              </div>
              {err && (
                <p className="font-body text-[13px] text-danger mt-2">{err}</p>
              )}
            </form>

            {/* Team picker fallback */}
            <div className="flex items-center gap-3 my-5">
              <span className="flex-1 h-px bg-border-default" />
              <span className="font-body text-[12px] text-text-tertiary">or pick your team</span>
              <span className="flex-1 h-px bg-border-default" />
            </div>

            <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
              {rosters.map((roster, i) => (
                <button
                  key={roster.rosterId}
                  onClick={() => pick(roster)}
                  className={`flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                    i > 0 ? 'border-t border-border-default' : ''
                  }`}
                >
                  <TeamAvatar owner={roster.owner} size={32} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-body font-medium text-[15px] text-text-primary truncate">
                      {getTeamName(roster.owner)}
                    </span>
                    {roster.owner?.username && (
                      <span className="block font-body text-[12px] text-text-tertiary truncate">
                        @{roster.owner.username}
                        {roster.hasRecord && ` · ${roster.record.wins}-${roster.record.losses}${roster.record.ties ? `-${roster.record.ties}` : ''}`}
                      </span>
                    )}
                  </span>
                  <ChevronRight size={18} strokeWidth={1.75} className="text-text-tertiary shrink-0" />
                </button>
              ))}
            </div>

            <div className="flex items-center justify-center gap-1.5 mt-5 px-4">
              <ShieldCheck size={14} strokeWidth={1.75} className="text-text-tertiary shrink-0" />
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
