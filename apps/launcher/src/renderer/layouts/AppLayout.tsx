import React, { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { useLauncherStore } from '../store/launcher'
import type { GameStatus, PlayPhase } from '../store/launcher'
import driftLauncherLogo from '../assets/drift_launcher.svg'

export default function AppLayout(): React.JSX.Element {
  const { lo, avatarUrl, setAvatarUrl } = useAuthStore()
  const { quickPlayServer, gameStatus, playState, setGameStatus, play, news, readNewsIds } = useLauncherStore()
  const navigate = useNavigate()
  const unreadNews = news.reduce((n, item) => n + (readNewsIds.includes(item.gid) ? 0 : 1), 0)

  useEffect(() => {
    const off = window.api.game.onStatus(setGameStatus)
    return off
  }, [setGameStatus])

  useEffect(() => {
    if (!avatarUrl) {
      window.api.steam.getAvatarUrl().then(url => { if (url) setAvatarUrl(url) }).catch(() => {})
    }
  }, [avatarUrl, setAvatarUrl])

  const busy = gameStatus === 'launching' || gameStatus === 'running' || playState.phase !== 'idle'
  const canPlay = !!quickPlayServer && !busy

  return (
    <div className="flex h-full bg-gray-950 text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="flex flex-col w-52 bg-gray-900 border-r border-gray-800 flex-shrink-0">
        {/* Logo */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-800 flex items-center justify-center">
          <img
            src={driftLauncherLogo}
            alt="Drift Launcher"
            className="w-20 h-20 rounded-xl"
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 flex flex-col gap-1 p-3 pt-4">
          <SideNavLink to="/servers" icon={<ServersIcon />} label="Realms" />
          <SideNavLink to="/mods" icon={<ModsIcon />} label="Mods" />
          <SideNavLink to="/news" icon={<NewsIcon />} label="News" badge={unreadNews} />
          <SideNavLink to="/settings" icon={<SettingsIcon />} label="Settings" />
          <SideNavLink to="/changelog" icon={<ChangelogIcon />} label="Changelog" />
        </nav>

        {/* Bottom: selected server indicator + user */}
        <div className="p-3 border-t border-gray-800 flex flex-col gap-2">
          {quickPlayServer ? (
            <div className="px-2 py-1.5 rounded bg-gray-800 text-xs">
              <span className="text-gray-500 block">Quick Play</span>
              <span className="font-medium text-white truncate block">{quickPlayServer.name}</span>
              <span className={`mt-1 inline-flex items-center gap-1 text-xs ${
                busy ? 'text-amber-400' : 'text-gray-500'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                  gameStatus === 'running' ? 'bg-green-500' :
                  busy ? 'bg-amber-500 animate-pulse' :
                  'bg-gray-600'
                }`} />
                {getPlayLabel(playState, gameStatus)}
              </span>
            </div>
          ) : (
            <div className="px-2 py-1.5 rounded bg-gray-800 text-xs text-gray-500 italic">
              No quick play realm
            </div>
          )}

          <button
            onClick={() => quickPlayServer && play(quickPlayServer)}
            disabled={!canPlay}
            className={`w-full py-2 rounded font-bold text-sm tracking-wide transition-colors ${
              canPlay
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {getPlayLabel(playState, gameStatus)}
          </button>

          {lo && (
            <div className="flex items-center gap-2 px-1 pt-1">
              {avatarUrl ? (
                <img src={avatarUrl} className="w-7 h-7 rounded-full flex-shrink-0 object-cover" alt="" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-400 flex-shrink-0">
                  {lo.playerName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-medium text-white truncate">{lo.playerName}</div>
                <button
                  onClick={() => {
                    window.api.session.clear()
                    useAuthStore.getState().clearAll()
                    navigate('/login', { replace: true })
                  }}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}

function getPlayLabel(playState: PlayPhase, gameStatus: GameStatus): string {
  if (playState.phase === 'checking') return 'Checking mods…'
  if (playState.phase === 'downloading') return `Downloading ${playState.pct}%`
  if (playState.phase === 'activating') return 'Activating…'
  if (playState.phase === 'launching' || gameStatus === 'launching') return 'Launching…'
  if (gameStatus === 'running') return 'Running'
  return 'PLAY'
}

function SideNavLink({ to, icon, label, badge }: { to: string; icon: React.ReactNode; label: string; badge?: number }): React.JSX.Element {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${
          isActive
            ? 'bg-gray-800 text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
        }`
      }
    >
      <span className="w-4 h-4 flex-shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-gray-950 text-[10px] font-bold">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}

function ServersIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="1" width="14" height="4" rx="1"/>
      <rect x="1" y="6" width="14" height="4" rx="1"/>
      <rect x="1" y="11" width="14" height="4" rx="1"/>
    </svg>
  )
}

function ModsIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M6 1a1 1 0 0 0-1 1v1H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-2V2a1 1 0 0 0-1-1H6zm0 1h4v1H6V2zm-3 2h10v9H3V4z"/>
      <path d="M5 7h6v1H5zm0 2h4v1H5z"/>
    </svg>
  )
}

function SettingsIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
      <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.474l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
    </svg>
  )
}

function ChangelogIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h11A1.5 1.5 0 0 1 15 2.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 13.5v-11zm1.5-.5a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5h-11z"/>
      <path d="M3 5.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0 2.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9A.5.5 0 0 1 3 8zm0 2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5z"/>
    </svg>
  )
}

function NewsIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M2.5 2A1.5 1.5 0 0 0 1 3.5v9A1.5 1.5 0 0 0 2.5 14h11a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 13.5 2h-11zm.5 1.5h10v9H3v-9z"/>
      <path d="M4 5h8v1H4zm0 2h8v1H4zm0 2h5v1H4zm0 2h5v1H4z"/>
    </svg>
  )
}
