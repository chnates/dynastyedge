import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Users, ArrowLeftRight, LayoutList, Trophy, FileText,
  RefreshCw, Sun, Moon,
} from 'lucide-react'
import DynastyEdgeLogo from './DynastyEdgeLogo'
import { useLeagueContext } from '../../context/LeagueContext'
import { getTeamName } from '../../hooks/useLeague'

const NAV_ITEMS = [
  { to: '/roster', label: 'Roster', Icon: Users },
  { to: '/trade',  label: 'Trade',  Icon: ArrowLeftRight },
  { to: '/lineup', label: 'Lineup', Icon: LayoutList },
  { to: '/league', label: 'League', Icon: Trophy },
  { to: '/draft',  label: 'Draft',  Icon: FileText },
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
  const myTeamName = league?.myRoster?.owner ? getTeamName(league.myRoster.owner) : null

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
        <div className="px-5 pt-5 pb-6">
          <DynastyEdgeLogo theme={isDark ? 'dark' : 'light'} size={88} />
          {myTeamName && (
            <p className="font-body text-[11px] text-text-tertiary mt-2 select-none">
              {myTeamName}
            </p>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3.5 rounded-lg mb-1 relative transition-colors duration-150 ` +
                (isActive
                  ? 'text-accent bg-accent/10'
                  : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5')
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-accent rounded-r-full" />
                  )}
                  <Icon size={20} strokeWidth={1.75} />
                  <span className="font-body font-medium text-[15px]">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Utility controls */}
        <div className="px-3 pb-2">
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
