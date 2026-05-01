import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSteamAuth } from '../hooks/useSteamAuth'
import { useAuthStore } from '../store/auth'

export default function Login(): React.JSX.Element {
  const { status, error, banInfo, restoreOrAuthenticate, authenticate, mockAuthenticate } = useSteamAuth()
  const banWarnings = useAuthStore(s => s.banWarnings)
  const navigate = useNavigate()

  useEffect(() => {
    restoreOrAuthenticate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status === 'done') navigate('/servers', { replace: true })
  }, [status, navigate])

  // Dev hook: window.__mockAuth({ banned: true }) from DevTools to drive the
  // ban screen without hitting the LO backend.
  useEffect(() => {
    if (import.meta.env.DEV) {
      ;(window as unknown as { __mockAuth?: typeof mockAuthenticate }).__mockAuth = mockAuthenticate
    }
  }, [mockAuthenticate])

  if (status === 'banned' && (banInfo || banWarnings.length > 0)) {
    // Prefer the per-backend list when present (real auth flow); fall back to
    // banInfo for the legacy / dev mockAuth() path which only sets banInfo.
    const entries = banWarnings.length > 0
      ? banWarnings.filter(w => w.ban)
      : banInfo
        ? [{ backend: '', message: '', ban: { banMessage: banInfo.message, banEndDate: banInfo.endDate } }]
        : []
    return (
      <div className="h-full bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center max-w-lg px-6">
          <h1 className="text-3xl font-bold text-red-500 mb-4">Account Banned</h1>
          <p className="text-gray-400 text-sm mb-5">
            You're banned on every configured backend. Add another backend in Settings to keep playing.
          </p>
          <ul className="text-left bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800 mb-6">
            {entries.map((w, idx) => (
              <li key={`${w.backend}-${idx}`} className="px-4 py-3 text-sm">
                {w.backend && (
                  <div className="text-gray-500 text-xs font-mono truncate mb-1">{w.backend}</div>
                )}
                <div className="text-gray-200">{w.ban?.banMessage || 'Your account has been banned.'}</div>
                <div className="text-gray-500 text-xs mt-1">
                  {w.ban && w.ban.banEndDate > 0
                    ? `Expires ${new Date(w.ban.banEndDate * 1000).toLocaleString()}`
                    : 'Permanent'}
                </div>
              </li>
            ))}
          </ul>
          <button
            onClick={() => navigate('/settings')}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors text-sm inline-flex items-center gap-2"
          >
            <SettingsGearIcon />
            Manage backends
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-gray-950 text-white flex flex-col items-center justify-center gap-3">
      <h1 className="text-5xl font-bold tracking-tight mb-6">Drift Launcher</h1>

      {(status === 'checking-session' || status === 'steam') && (
        <StatusRow label="Connecting to Steam…" />
      )}
      {status === 'lo' && (
        <StatusRow label="Signing into Last Oasis…" />
      )}
      {status === 'idle' && (
        <p className="text-gray-600 text-sm">Initialising…</p>
      )}

      {status === 'error' && (
        <div className="text-center">
          <p className="text-red-400 text-sm mb-4 max-w-sm">{error}</p>
          <button
            onClick={authenticate}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors text-sm"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

function StatusRow({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 text-gray-400 text-sm">
      <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      {label}
    </div>
  )
}

function SettingsGearIcon(): React.JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
