import { useState, useMemo } from 'react'
import { SLEEPER_BASE } from '../../constants'
import { fetchJSON } from '../../utils/fetchJSON'
import { useIdentity } from '../../hooks/useIdentity'
import { useLeagueContext } from '../../context/LeagueContext'
import { getTeamName } from '../../hooks/useLeague'
import { Input, Button, Loading } from '../ui'
import DynastyEdgeLogo from '../shared/DynastyEdgeLogo'
import TeamAvatar from '../shared/TeamAvatar'
import ErrorState from '../shared/ErrorState'

// Gated sign-in: resolve a Sleeper username to a roster in this league (the
// real path we'll generalize later), with a tap-to-pick team list as the
// fallback. "Login" is read-only identity resolution against a public Sleeper
// endpoint — no password, no token, it never touches the user's account.
export default function LoginScreen() {
  // Sign-in only needs Sleeper rosters — never gate it on FantasyCalc.
  const { signInRosters, sleeperLoading, sleeperError, sleeperRetry } = useLeagueContext()
  const { setIdentity } = useIdentity()

  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const rosters = useMemo(() => {
    const list = signInRosters ?? []
    return [...list].sort((a, b) => getTeamName(a.owner).localeCompare(getTeamName(b.owner)))
  }, [signInRosters])

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
      const roster = (signInRosters ?? []).find(r => r.owner?.user_id === user.user_id)
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
        {/* Branding — red score-bug hero */}
        <div className="mb-6">
          <div className="ink-field-cap flex items-center justify-center px-3 py-1.5">
            <span className="font-display text-[12px] uppercase tracking-[0.14em] leading-none">
              Your dynasty command center
            </span>
          </div>
          <div className="ink-field px-6 py-8 text-bg-primary text-center">
            <div className="flex justify-center">
              <DynastyEdgeLogo theme="dark" size={132} />
            </div>
            <p className="font-body text-[13px] text-bg-primary/70 mt-4">
              Sign in with your Sleeper username to load your team.
            </p>
          </div>
        </div>

        {sleeperLoading && !signInRosters ? (
          <Loading message="Loading league…" padded={false} />
        ) : sleeperError && !signInRosters ? (
          <ErrorState message={sleeperError} onRetry={sleeperRetry} />
        ) : (
          <>
            {/* Username sign-in */}
            <form
              onSubmit={submitUsername}
              className="bg-bg-card border border-border-default rounded-none p-4"
            >
              <label htmlFor="sleeper-username" className="block font-display uppercase text-[11px] tracking-[0.08em] text-accent mb-2">
                Sleeper username
              </label>
              <div className="flex gap-2">
                <Input
                  id="sleeper-username"
                  type="text"
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={username}
                  onChange={e => { setUsername(e.target.value); setErr(null) }}
                  placeholder="e.g. chnates"
                  className="flex-1 min-w-0 bg-bg-secondary text-[15px] focus:ring-2 focus:ring-accent/40 transition-shadow"
                />
                <Button
                  type="submit"
                  disabled={busy || !username.trim()}
                  className="shrink-0 px-5 gap-1 text-[14px] font-bold"
                >
                  {busy ? '…' : 'Go'}
                </Button>
              </div>
              {err && (
                <p className="font-body text-[13px] text-danger mt-2">{err}</p>
              )}
            </form>

            {/* Team picker fallback */}
            <div className="flex items-center gap-3 my-5">
              <span className="flex-1 h-px bg-border-default" />
              <span className="font-display uppercase tracking-[0.1em] text-[11px] text-text-secondary">or pick your team</span>
              <span className="flex-1 h-px bg-border-default" />
            </div>

            <div className="bg-bg-card border border-border-default rounded-none overflow-hidden">
              {rosters.map((roster, i) => (
                <button
                  key={roster.rosterId}
                  onClick={() => pick(roster)}
                  className={`flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-bg-secondary active:bg-bg-secondary transition-colors ${
                    i > 0 ? 'border-t border-border-default' : ''
                  }`}
                >
                  <TeamAvatar owner={roster.owner} size={34} className="ring-1 ring-border-default" />
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
                  <span className="shrink-0 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                    Pick
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-center gap-1.5 mt-5 px-4">

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
