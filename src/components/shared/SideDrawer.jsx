import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Zap, Users, ArrowLeftRight, LayoutList, Trophy, FileText, Newspaper,
  RefreshCw, Sun, Moon,
} from 'lucide-react'
import DynastyEdgeLogo from './DynastyEdgeLogo'
import TeamAvatar from './TeamAvatar'
import { useLeagueContext } from '../../context/LeagueContext'
import { getTeamName } from '../../hooks/useLeague'

// Each section has an identity color — icons always wear it, the active
// item gets a matching tinted background and edge bar.
const NAV_ITEMS = [
  { to: '/edge',   label: 'The Edge', Icon: Zap,          text: 'text-accent',  activeBg: 'bg-accent/10',  bar: 'bg-accent'  },
  { to: '/roster', label: 'Roster', Icon: Users,          text: 'text-pos-wr',  activeBg: 'bg-pos-wr/10',  bar: 'bg-pos-wr'  },
  { to: '/trade',  label: 'Trade',  Icon: ArrowLeftRight, text: 'text-success', activeBg: 'bg-success/10', bar: 'bg-success' },
  { to: '/lineup', label: 'Lineup', Icon: LayoutList,     text: 'text-pos-te',  activeBg: 'bg-pos-te/10',  bar: 'bg-pos-te'  },
  { to: '/league', label: 'League', Icon: Trophy,         text: 'text-warning', activeBg: 'bg-warning/10', bar: 'bg-warning' },
  { to: '/news',   label: 'News',   Icon: Newspaper,      text: 'text-pos-def', activeBg: 'bg-pos-def/10', bar: 'bg-pos-def' },
  { to: '/draft',  label: 'Draft',  Icon: FileText,       text: 'text-pos-qb',  activeBg: 'bg-pos-qb/10',  bar: 'bg-pos-qb'  },
]

export default function SideDrawer({
  isOpen,
  onClose,
  lastUpdated,
  onRefresh,
  loading,
  isDark,
  onToggleTheme,
}) {
  const { league } = useLeagueContext()
  const myOwner = league?.myRoster?.owner ?? null
  const myTeamName = myOwner ? getTeamName(myOwner) : null

  const touchStartX = useRef(null)

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  function handlePanelTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
  }

  function handlePanelTouchEnd(e) {
    if (touchStartX.current === null) return
    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    if (deltaX < -50) onClose()
    touchStartX.current = null
  }

  return (
    <>
      {/* Scrim */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={`fixed top-0 left-0 bottom-0 z-50 w-[80vw] max-w-[300px] bg-bg-secondary border-r border-border-default flex flex-col transition-transform duration-[250ms] ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        onTouchStart={handlePanelTouchStart}
        onTouchEnd={handlePanelTouchEnd}
        aria-hidden={!isOpen}
      >
        {/* Branding */}
        <div className="px-5 pt-5 pb-4">
          <DynastyEdgeLogo theme={isDark ? 'dark' : 'light'} size={88} />
          {myTeamName && (
            <div className="flex items-center gap-1.5 mt-2 select-none">
              <TeamAvatar owner={myOwner} size={18} />
              <p className="font-body text-[11px] text-text-tertiary">
                {myTeamName}
              </p>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="px-3">
          {NAV_ITEMS.map(({ to, label, Icon, text, activeBg, bar }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3.5 rounded-lg mb-1 relative transition-colors duration-150 ` +
                (isActive
                  ? `${text} ${activeBg}`
                  : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5')
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full ${bar}`} />
                  )}
                  <Icon size={20} strokeWidth={1.75} className={text} />
                  <span className="font-body font-medium text-[15px]">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Utility controls */}
        <div className="px-3 mt-4 pb-4">
          <div className="h-px bg-border-default mx-2 mb-3" />

          {lastUpdated && (
            <div className="px-3 py-1.5">
              <span className="font-body text-[11px] text-text-tertiary">{lastUpdated}</span>
            </div>
          )}

          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={18} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />
            <span className="font-body font-medium text-[14px]">Refresh data</span>
          </button>

          <button
            onClick={onToggleTheme}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            {isDark ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
            <span className="font-body font-medium text-[14px]">
              {isDark ? 'Light mode' : 'Dark mode'}
            </span>
          </button>
        </div>
      </div>
    </>
  )
}
