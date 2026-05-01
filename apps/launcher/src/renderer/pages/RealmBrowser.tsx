import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Realm, RealmSearchFilters, ModStatus, DownloadProgress } from '@drift/shared'
import { useAuthStore } from '../store/auth'

type Provider = NonNullable<RealmSearchFilters['provider']>
type ModPanelState = 'idle' | 'checking' | 'checked' | 'downloading' | 'ready' | 'activating' | 'error'

// Realm IDs collide across LO backends, so keys combine both.
const realmKey = (backend: string, realmId: number): string => `${backend} ${realmId}`

export default function RealmBrowser(): React.JSX.Element {
  const { lo, clearAll } = useAuthStore()
  const navigate = useNavigate()

  const [realms, setRealms] = useState<Realm[]>([])
  // Keyed by `${backend} ${realmId}` — realmId alone isn't unique across LO backends.
  const [modMap, setModMap] = useState<Map<string, string[]>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [provider, setProvider] = useState<Provider>('ANY_PROVIDER')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [selectedRealm, setSelectedRealm] = useState<Realm | null>(null)
  const [modStatuses, setModStatuses] = useState<ModStatus[]>([])
  const [modPanelState, setModPanelState] = useState<ModPanelState>('idle')
  const [modError, setModError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Map<string, number>>(new Map())
  const [gameStatus, setGameStatus] = useState<'idle' | 'launching' | 'running' | 'stopped'>('idle')

  const loadDriftOverlay = useCallback(async () => {
    try {
      const records = await window.api.drift.getAllRealmMods()
      const map = new Map<string, string[]>()
      for (const r of records) {
        if (r.workshopIds.length > 0) map.set(realmKey(r.backend, r.realmId), r.workshopIds)
      }
      setModMap(map)
    } catch {
      // Drift backend down — overlay stays empty
    }
  }, [])

  const search = useCallback(async (filters: RealmSearchFilters) => {
    if (!lo?.token) return
    setLoading(true)
    setError(null)
    try {
      const { realms, failures } = await window.api.realms.search(filters)
      if (failures.length > 0) console.warn('[realms] partial search failures:', failures)
      setRealms(realms)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load realms')
    } finally {
      setLoading(false)
    }
  }, [lo?.token])

  useEffect(() => { loadDriftOverlay() }, [loadDriftOverlay])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      search({ name: nameInput || undefined, provider, status: 'ONLINE' })
    }, nameInput ? 400 : 0)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [nameInput, provider, search])

  useEffect(() => {
    const unsub = window.api.mods.onProgress((p: DownloadProgress) => {
      setProgress(prev => new Map(prev).set(p.workshopId, p.pct))
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = window.api.game.onStatus(s => setGameStatus(s))
    return unsub
  }, [])

  const handleSelectRealm = useCallback((realm: Realm) => {
    if (selectedRealm?.id === realm.id) {
      setSelectedRealm(null)
      return
    }
    setSelectedRealm(realm)
    setModStatuses([])
    setModPanelState('idle')
    setModError(null)
    setProgress(new Map())
  }, [selectedRealm?.id])

  const handleCheckMods = useCallback(async () => {
    if (!selectedRealm) return
    const ids = modMap.get(realmKey(selectedRealm.backend, selectedRealm.id)) ?? []
    setModPanelState('checking')
    setModError(null)
    try {
      const statuses = await window.api.mods.check(ids)
      setModStatuses(statuses)
      const allReady = statuses.every(s => s.installed)
      setModPanelState(allReady ? 'ready' : 'checked')
    } catch (err) {
      setModError(err instanceof Error ? err.message : 'Check failed')
      setModPanelState('error')
    }
  }, [selectedRealm, modMap])

  const handleDownload = useCallback(async () => {
    const missing = modStatuses.filter(s => !s.installed).map(s => s.workshopId)
    setModPanelState('downloading')
    setModError(null)
    setProgress(new Map())
    try {
      await window.api.mods.download(missing)
      const ids = modMap.get(realmKey(selectedRealm!.backend, selectedRealm!.id)) ?? []
      const statuses = await window.api.mods.check(ids)
      setModStatuses(statuses)
      setModPanelState('ready')
    } catch (err) {
      setModError(err instanceof Error ? err.message : 'Download failed')
      setModPanelState('error')
    }
  }, [modStatuses, modMap, selectedRealm])

  const handleActivate = useCallback(async () => {
    if (!selectedRealm) return
    const targetIds = modMap.get(realmKey(selectedRealm.backend, selectedRealm.id)) ?? []
    setModPanelState('activating')
    setModError(null)
    try {
      await window.api.mods.activate({ targetIds })
      const statuses = await window.api.mods.check(targetIds)
      setModStatuses(statuses)
      setModPanelState('ready')
    } catch (err) {
      setModError(err instanceof Error ? err.message : 'Activation failed')
      setModPanelState('error')
    }
  }, [selectedRealm, modMap])

  const handleLaunch = useCallback(async () => {
    if (!selectedRealm) return
    setGameStatus('launching')
    try {
      await window.api.game.launch(selectedRealm.id, selectedRealm.backend)
    } catch (err) {
      setModError(err instanceof Error ? err.message : 'Launch failed')
      setGameStatus('idle')
    }
  }, [selectedRealm])

  const handleLogout = useCallback(async () => {
    await window.api.session.clear()
    clearAll()
    navigate('/login')
  }, [clearAll, navigate])

  const moddedCount = realms.filter(r => modMap.has(realmKey(r.backend, r.id))).length
  const selectedMods = selectedRealm ? (modMap.get(realmKey(selectedRealm.backend, selectedRealm.id)) ?? []) : []

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="border-b border-gray-800 px-6 py-3 flex items-center gap-4">
        <h1 className="text-lg font-semibold tracking-wide flex-1">Realm Browser</h1>
        {gameStatus !== 'idle' && (
          <span className={`text-xs px-2 py-0.5 rounded-full border ${
            gameStatus === 'launching' ? 'text-yellow-400 border-yellow-800/50 bg-yellow-950/40' :
            gameStatus === 'running'   ? 'text-green-400 border-green-800/50 bg-green-950/40' :
                                        'text-gray-400 border-gray-700 bg-gray-800'
          }`}>
            {gameStatus === 'launching' ? 'Launching…' : gameStatus === 'running' ? 'Running' : 'Stopped'}
          </span>
        )}
        {lo?.motd && (
          <span className="text-gray-500 text-xs italic truncate max-w-xs">{lo.motd}</span>
        )}
        {lo && <span className="text-gray-400 text-sm font-medium">{lo.playerName}</span>}
        <button
          onClick={handleLogout}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Sign out
        </button>
      </header>

      <div className="px-6 py-4 flex items-center gap-3 border-b border-gray-800/50">
        <input
          type="text"
          placeholder="Search realms…"
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm placeholder-gray-600 focus:outline-none focus:border-gray-500"
        />
        <div className="flex rounded-lg overflow-hidden border border-gray-700 text-xs">
          {(['ANY_PROVIDER', 'OFFICIAL', 'PRIVATE'] as Provider[]).map(p => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`px-3 py-1.5 transition-colors ${
                provider === p ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'
              }`}
            >
              {p === 'ANY_PROVIDER' ? 'All' : p === 'OFFICIAL' ? 'Official' : 'Private'}
            </button>
          ))}
        </div>
        <button
          onClick={() => { loadDriftOverlay(); search({ name: nameInput || undefined, provider, status: 'ONLINE' }) }}
          disabled={loading}
          className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors disabled:opacity-40"
        >
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      <main className="flex-1 overflow-y-auto px-6 py-4">
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-950/50 border border-red-800 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}
        {loading && realms.length === 0 && (
          <div className="flex items-center justify-center py-20 text-gray-600 text-sm">Loading realms…</div>
        )}
        {!loading && !error && realms.length === 0 && (
          <div className="flex items-center justify-center py-20 text-gray-600 text-sm">No realms found.</div>
        )}
        {realms.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {realms.map(realm => (
              <RealmCard
                key={realm.id}
                realm={realm}
                mods={modMap.get(realmKey(realm.backend, realm.id))}
                selected={selectedRealm?.id === realm.id}
                onClick={() => handleSelectRealm(realm)}
              />
            ))}
          </div>
        )}
      </main>

      {selectedRealm && selectedMods.length > 0 && (
        <ModPanel
          realm={selectedRealm}
          workshopIds={selectedMods}
          statuses={modStatuses}
          state={modPanelState}
          error={modError}
          progress={progress}
          gameStatus={gameStatus}
          onCheck={handleCheckMods}
          onDownload={handleDownload}
          onActivate={handleActivate}
          onLaunch={handleLaunch}
          onClose={() => setSelectedRealm(null)}
        />
      )}

      {!loading && realms.length > 0 && !selectedRealm && (
        <footer className="px-6 py-2 border-t border-gray-800/50 text-xs text-gray-600 flex items-center gap-3">
          <span>{realms.length} realm{realms.length !== 1 ? 's' : ''}</span>
          {moddedCount > 0 && <span className="text-amber-600">{moddedCount} modded</span>}
        </footer>
      )}
    </div>
  )
}

// ── Realm Card ────────────────────────────────────────────────────────────

function RealmCard({
  realm, mods, selected, onClick
}: {
  realm: Realm
  mods?: string[]
  selected: boolean
  onClick: () => void
}): React.JSX.Element {
  const isModded = mods !== undefined && mods.length > 0
  const playerPct = realm.maxPlayers > 0
    ? Math.min(100, (realm.players / realm.maxPlayers) * 100) : 0
  const barColor = playerPct >= 90 ? 'bg-red-500' : playerPct >= 60 ? 'bg-yellow-500' : 'bg-green-500'

  return (
    <button
      onClick={onClick}
      className={`text-left bg-gray-900 border rounded-xl p-4 flex flex-col gap-3 transition-colors w-full ${
        selected
          ? 'border-blue-600 ring-1 ring-blue-600/40'
          : isModded
            ? 'border-amber-800/60 hover:border-amber-700/60'
            : 'border-gray-800 hover:border-gray-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${realm.isOnline ? 'bg-green-400' : 'bg-gray-600'}`} />
            <span className="font-medium text-sm truncate">{realm.name}</span>
          </div>
          {realm.description && (
            <p className="text-gray-500 text-xs mt-1 line-clamp-2">{realm.description}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {realm.isOfficial
            ? <Badge color="blue">Official</Badge>
            : <Badge color="gray">Private</Badge>}
          {isModded && <Badge color="amber">{mods!.length} mod{mods!.length !== 1 ? 's' : ''}</Badge>}
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        {realm.regionKey && <span className="uppercase tracking-wide">{realm.regionKey}</span>}
        {realm.size > 0 && <span>Size {realm.size}</span>}
        {realm.clanCap > 0 && <span>Clan {realm.clanCap}</span>}
        <span className="ml-auto flex items-center gap-2">
          {realm.hasPassword && <LockIcon />}
          {realm.hasAllowlist && <ListIcon />}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${playerPct}%` }} />
        </div>
        <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">
          {realm.players}/{realm.maxPlayers}
        </span>
      </div>
    </button>
  )
}

// ── Mod Panel ─────────────────────────────────────────────────────────────

function ModPanel({
  realm, workshopIds, statuses, state, error, progress, gameStatus,
  onCheck, onDownload, onActivate, onLaunch, onClose
}: {
  realm: Realm
  workshopIds: string[]
  statuses: ModStatus[]
  state: ModPanelState
  error: string | null
  progress: Map<string, number>
  gameStatus: 'idle' | 'launching' | 'running' | 'stopped'
  onCheck: () => void
  onDownload: () => void
  onActivate: () => void
  onLaunch: () => void
  onClose: () => void
}): React.JSX.Element {
  const missing = statuses.filter(s => !s.installed)
  const allInstalled = statuses.length > 0 && missing.length === 0
  const allActive = statuses.length > 0 && statuses.every(s => s.active)
  const busy = state === 'checking' || state === 'downloading' || state === 'activating'
  const gameRunning = gameStatus === 'launching' || gameStatus === 'running'

  const statusMap = new Map(statuses.map(s => [s.workshopId, s]))

  return (
    <div className="border-t border-gray-800 bg-gray-900/80 backdrop-blur px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="font-medium text-sm">{realm.name}</span>
          <span className="text-gray-500 text-xs ml-2">{workshopIds.length} mod{workshopIds.length !== 1 ? 's' : ''}</span>
        </div>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xs">✕ Close</button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {workshopIds.map(id => {
          const s = statusMap.get(id)
          const pct = progress.get(id)
          return (
            <div
              key={id}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs border ${
                !s ? 'border-gray-700 bg-gray-800 text-gray-400'
                  : s.installed && s.active ? 'border-green-800/60 bg-green-950/40 text-green-400'
                  : s.installed ? 'border-blue-800/60 bg-blue-950/40 text-blue-400'
                  : 'border-red-800/60 bg-red-950/40 text-red-400'
              }`}
            >
              {!s ? (
                <span className="text-gray-500">?</span>
              ) : s.installed && s.active ? (
                <span>✓</span>
              ) : s.installed ? (
                <span>●</span>
              ) : pct !== undefined ? (
                <span>{pct}%</span>
              ) : (
                <span>↓</span>
              )}
              <span className="truncate max-w-[120px]" title={s?.name ?? id}>
                {s?.name ?? id}
              </span>
            </div>
          )
        })}
      </div>

      {error && (
        <p className="text-red-400 text-xs mb-3">{error}</p>
      )}

      <div className="flex items-center gap-2">
        {state === 'idle' && (
          <button
            onClick={onCheck}
            className="px-4 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
          >
            Check mods
          </button>
        )}
        {state === 'checking' && (
          <span className="text-xs text-gray-500">Checking…</span>
        )}
        {state === 'checked' && missing.length > 0 && (
          <>
            <span className="text-xs text-amber-500 flex-1">{missing.length} mod{missing.length !== 1 ? 's' : ''} need download</span>
            <button
              onClick={onDownload}
              className="px-4 py-1.5 text-xs bg-amber-800 hover:bg-amber-700 border border-amber-700 rounded-lg transition-colors"
            >
              Download missing
            </button>
          </>
        )}
        {state === 'downloading' && (
          <span className="text-xs text-gray-500">Downloading…</span>
        )}
        {(state === 'ready' || (state === 'checked' && allInstalled)) && (
          <>
            {allActive
              ? <span className="text-xs text-green-500 flex-1">All mods active</span>
              : <span className="text-xs text-gray-500 flex-1">Ready to activate</span>
            }
            <button
              onClick={onActivate}
              disabled={busy || gameRunning}
              className="px-4 py-1.5 text-xs bg-blue-800 hover:bg-blue-700 border border-blue-700 rounded-lg transition-colors disabled:opacity-40"
            >
              {allActive ? 'Re-activate' : 'Activate mods'}
            </button>
            {allActive && (
              <button
                onClick={onLaunch}
                disabled={gameRunning}
                className="px-4 py-1.5 text-xs bg-green-800 hover:bg-green-700 border border-green-700 rounded-lg transition-colors disabled:opacity-40 font-medium"
              >
                {gameStatus === 'launching' ? 'Launching…' : gameStatus === 'running' ? 'Running' : 'Launch'}
              </button>
            )}
          </>
        )}
        {state === 'activating' && (
          <span className="text-xs text-gray-500">Activating…</span>
        )}
        {state === 'error' && (
          <button
            onClick={onCheck}
            className="px-4 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
}

// ── Shared components ─────────────────────────────────────────────────────

function Badge({ color, children }: { color: 'blue' | 'gray' | 'amber', children: React.ReactNode }): React.JSX.Element {
  const cls = {
    blue: 'bg-blue-900/60 text-blue-300 border-blue-800/50',
    gray: 'bg-gray-800 text-gray-400 border-gray-700',
    amber: 'bg-amber-900/50 text-amber-400 border-amber-800/50',
  }[color]
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>{children}</span>
  )
}

function LockIcon(): React.JSX.Element {
  return (
    <svg aria-label="Password protected" className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
      <path d="M11.5 6V4.5a3.5 3.5 0 0 0-7 0V6H3v8h10V6h-1.5ZM6 4.5a2 2 0 0 1 4 0V6H6V4.5Zm2 6.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" />
    </svg>
  )
}

function ListIcon(): React.JSX.Element {
  return (
    <svg aria-label="Allowlist enabled" className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 4h1.5v1.5H2V4Zm3 0h9v1.5H5V4Zm-3 4h1.5v1.5H2V8Zm3 0h9v1.5H5V8Zm-3 4h1.5v1.5H2v-1.5Zm3 0h9v1.5H5v-1.5Z" />
    </svg>
  )
}
