import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSteamAuth } from '../hooks/useSteamAuth'

export default function Login(): React.JSX.Element {
  const { status, error, banInfo, restoreOrAuthenticate, authenticate } = useSteamAuth()
  const navigate = useNavigate()

  useEffect(() => {
    restoreOrAuthenticate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status === 'done') navigate('/servers', { replace: true })
  }, [status, navigate])

  if (status === 'banned' && banInfo) {
    return (
      <div className="h-full bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <h1 className="text-3xl font-bold text-red-500 mb-4">Account Banned</h1>
          <p className="text-gray-300 mb-3">{banInfo.message || 'Your account has been banned.'}</p>
          {banInfo.endDate > 0 && (
            <p className="text-gray-500 text-sm">
              Expires {new Date(banInfo.endDate * 1000).toLocaleDateString()}
            </p>
          )}
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
