import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { useLauncherStore } from '../store/launcher'
import type { GameStatus, PlayPhase } from '../store/launcher'
import type { Realm } from '../../shared'
import { PROD_BACKEND_URL } from '../../shared'
import RealmMapModal from './RealmMapModal'

type Tab = 'favorites' | 'recent' | 'realms'
type TypeFilter = 'official' | 'vanilla' | 'modded'
type SortKey = 'players-desc' | 'players-asc' | 'name-asc' | 'name-desc' | 'wipe-asc' | 'started-desc'

function fmtRelTime(unix: number): string {
  if (!unix) return 'None'
  const diff = Math.floor(Date.now() / 1000) - unix
  if (diff >= 0) {
    const d = Math.floor(diff / 86400)
    return d === 0 ? 'today' : `${d}d ago`
  }
  return `in ${Math.ceil(-diff / 86400)}d`
}

function clanCapLabel(cap: number): string {
  // Official realms report clan_cap = 0 (no realm-wide cap — each tile has its
  // own). Only cap == 1 is genuinely "Solo".
  if (cap <= 0) return '—'
  if (cap === 1) return 'Solo'
  return String(cap)
}

export default function ServerBrowser(): React.JSX.Element {
  const { lo, clearAll } = useAuthStore()
  const sessions = useAuthStore(s => s.sessions)
  const banWarnings = useAuthStore(s => s.banWarnings)
  const dismissBanWarning = useAuthStore(s => s.dismissBanWarning)
  const navigate = useNavigate()
  const { favorites, recent, quickPlayServer, setQuickPlayServer, addFavorite, removeFavorite, isFavorite, gameStatus, playState, play, settings } = useLauncherStore()

  const [tab, setTab] = useState<Tab>(settings.defaultRealmTab)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [mapOpenRealm, setMapOpenRealm] = useState<Realm | null>(null)
  const [realms, setRealms] = useState<Realm[]>([])
  const [modNames, setModNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modsFoundBanner, setModsFoundBanner] = useState<{ realmId: number; count: number } | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [filterOnline, setFilterOnline] = useState(false)
  const [filterMyChar, setFilterMyChar] = useState(false)
  const [filterNoPassword, setFilterNoPassword] = useState(false)
  const [typeFilters, setTypeFilters] = useState<Set<TypeFilter>>(() => new Set())
  const [regionFilters, setRegionFilters] = useState<Set<string>>(() => new Set())
  const [sortKey, setSortKey] = useState<SortKey>('players-desc')
  const [showFilterPopup, setShowFilterPopup] = useState(false)
  const filterAnchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showFilterPopup) return
    const onMouseDown = (e: MouseEvent) => {
      if (filterAnchorRef.current && !filterAnchorRef.current.contains(e.target as Node)) {
        setShowFilterPopup(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [showFilterPopup])

  const toggleTypeFilter = useCallback((t: TypeFilter) => {
    setTypeFilters(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t); else next.add(t)
      return next
    })
  }, [])

  const toggleRegionFilter = useCallback((r: string) => {
    setRegionFilters(prev => {
      const next = new Set(prev)
      if (next.has(r)) next.delete(r); else next.add(r)
      return next
    })
  }, [])

  const clearAllFilters = useCallback(() => {
    setFilterOnline(false)
    setFilterMyChar(false)
    setFilterNoPassword(false)
    setTypeFilters(new Set())
    setRegionFilters(new Set())
  }, [])

  const activeFilterCount =
    (filterOnline ? 1 : 0) +
    (filterMyChar ? 1 : 0) +
    (filterNoPassword ? 1 : 0) +
    typeFilters.size +
    regionFilters.size

  const fetchRealms = useCallback(async () => {
    // Allow loading if any backend has a session — even if the prod (primary)
    // session is missing because the user is banned there.
    if (Object.keys(sessions).length === 0) return
    setLoading(true)
    setError(null)
    try {
      const { realms: raw, failures } = await window.api.realms.search({})
      if (failures.length > 0) {
        console.warn('[realms] partial search failures:', failures)
      }
      // If the primary (prod) backend session expired, the main process has
      // already cleared its stored token — bounce to login so a fresh Steam
      // ticket can re-establish the session. Failures from secondary backends
      // alone shouldn't kick the user out: their realms just won't appear.
      const primaryExpired = failures.some(
        (f: { backend: string; code: string }) => f.backend === PROD_BACKEND_URL && f.code === 'SESSION_EXPIRED'
      )
      if (primaryExpired) {
        clearAll()
        navigate('/login', { replace: true })
        return
      }
      const allModRecords = await window.api.drift.getAllRealmMods()
      // Key by (backend, realmId) — realm IDs collide across LO backends.
      const modKey = (backend: string, realmId: number): string => `${backend} ${realmId}`
      const modMap = new Map(allModRecords.map(r => [modKey(r.backend, r.realmId), r.workshopIds]))
      const overlaid: Realm[] = raw.map((r: Realm) => {
        const k = modKey(r.backend, r.id)
        return {
          ...r,
          // Official servers never use player mods — ignore any stored entries
          mods: r.isOfficial ? undefined : modMap.get(k),
          isModded: !r.isOfficial && modMap.has(k) && (modMap.get(k)?.length ?? 0) > 0,
        }
      })
      setRealms(overlaid)

      // Restore or refresh the quick-play realm from the fresh list.
      const { quickPlayServer: cur, savedServerId: saved } = useLauncherStore.getState()
      const targetId = cur?.id ?? saved
      if (targetId) {
        const match = overlaid.find(r => r.id === targetId)
        if (match) setQuickPlayServer(match)
      }

      const allModIds = [...new Set(overlaid.flatMap(r => r.mods ?? []))]
      if (allModIds.length > 0) {
        window.api.mods.check(allModIds).then(statuses => {
          const names: Record<string, string> = {}
          for (const s of statuses) { if (s.name) names[s.workshopId] = s.name }
          setModNames(names)
        }).catch(() => {})
      }
    } catch (e) {
      const msg = (e as Error).message
      // Backend returned 403 — main process already cleared the stored session.
      // Clear the in-memory auth store and bounce to the login page.
      if (msg.includes('SESSION_EXPIRED')) {
        clearAll()
        navigate('/login', { replace: true })
        return
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [sessions, clearAll, navigate])

  useEffect(() => { fetchRealms() }, [fetchRealms])

  useEffect(() => {
    const off = window.api.log.onModsFound(({ realmId, workshopIds }) => {
      setModsFoundBanner({ realmId, count: workshopIds.length })
      fetchRealms()
      setTimeout(() => setModsFoundBanner(null), 6000)
    })
    return off
  }, [fetchRealms])

  const regions = useMemo(() => {
    const keys = [...new Set(realms.map(r => r.regionKey).filter(Boolean))].sort()
    return keys
  }, [realms])

  const displayed = useMemo(() => {
    let list: Realm[]
    if (tab === 'favorites') {
      list = favorites.map(id => realms.find(r => r.id === id)).filter(Boolean) as Realm[]
    } else if (tab === 'recent') {
      list = recent.map(id => realms.find(r => r.id === id)).filter(Boolean) as Realm[]
    } else {
      list = [...realms]
    }

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(r => r.name.toLowerCase().includes(q))
    }
    if (filterOnline) list = list.filter(r => r.isOnline)
    if (filterMyChar) list = list.filter(r => r.characterId > 0)
    if (filterNoPassword) list = list.filter(r => !r.hasPassword)
    if (regionFilters.size > 0) list = list.filter(r => regionFilters.has(r.regionKey))
    if (typeFilters.size > 0) {
      list = list.filter(r => {
        if (typeFilters.has('official') && r.isOfficial) return true
        if (typeFilters.has('vanilla') && !r.isOfficial && !r.isModded) return true
        if (typeFilters.has('modded') && r.isModded) return true
        return false
      })
    }

    const cmps: Record<SortKey, (a: Realm, b: Realm) => number> = {
      'players-desc':  (a, b) => b.players - a.players,
      'players-asc':   (a, b) => a.players - b.players,
      'name-asc':      (a, b) => a.name.localeCompare(b.name),
      'name-desc':     (a, b) => b.name.localeCompare(a.name),
      'wipe-asc':      (a, b) => (a.endDate || Infinity) - (b.endDate || Infinity),
      'started-desc':  (a, b) => b.startDate - a.startDate,
    }
    const cmp = cmps[sortKey]

    // Always pin official servers to the top, then apply selected sort within each group
    list = [
      ...list.filter(r => r.isOfficial).sort(cmp),
      ...list.filter(r => !r.isOfficial).sort(cmp),
    ]
    return list
  }, [tab, realms, favorites, recent, search, filterOnline, filterMyChar, filterNoPassword, regionFilters, typeFilters, sortKey])

  const busy = gameStatus === 'launching' || gameStatus === 'running' || playState.phase !== 'idle'

  const handleLaunch = useCallback(async (realm: Realm) => {
    if (busy) return
    await play(realm)
  }, [busy, play])

  const banToasts = banWarnings.filter(w => w.ban)

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">
      {/* Ban toasts — surfaces backends where the user is banned but other
          backends still work, so the user can play with the partial set. */}
      {banToasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
          {banToasts.map(w => (
            <div key={w.backend} className="bg-red-950/95 border border-red-800 rounded-lg shadow-lg p-3 text-sm">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-semibold text-red-300">Banned</span>
                <button
                  onClick={() => dismissBanWarning(w.backend)}
                  className="text-red-400 hover:text-red-200 leading-none"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
              <div className="text-gray-500 text-xs font-mono truncate mb-1">{w.backend}</div>
              <div className="text-gray-200">{w.ban!.banMessage || 'No message provided.'}</div>
              <div className="text-gray-400 text-xs mt-1">
                {w.ban!.banEndDate > 0
                  ? `Expires ${new Date(w.ban!.banEndDate * 1000).toLocaleString()}`
                  : 'Permanent'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex-shrink-0 flex border-b border-gray-800/70 px-5">
        {(['favorites', 'recent', 'realms'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'realms' ? 'All Realms' : t.charAt(0).toUpperCase() + t.slice(1)}
            {t === tab && (
              <span className="ml-1.5 text-xs text-gray-500">({displayed.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex-shrink-0 px-5 pt-3 pb-3 border-b border-gray-800/70">
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Search realm name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded-md pl-8 pr-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 w-56"
            />
            <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-500" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zm-5.242 1.656a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z"/>
            </svg>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Sort</span>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              className="bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-white focus:outline-none focus:border-gray-500 appearance-none pr-6"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\' fill=\'%236b7280\'%3E%3Cpath d=\'M7.247 11.14L2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: '12px' }}
            >
              <option value="players-desc">Players ↓</option>
              <option value="players-asc">Players ↑</option>
              <option value="name-asc">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
              <option value="wipe-asc">Wipe soonest</option>
              <option value="started-desc">Started newest</option>
            </select>
          </div>

          <button
            onClick={fetchRealms}
            disabled={loading}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-md text-sm text-gray-300 transition-colors disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/>
              <path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/>
            </svg>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>

          <div className="relative" ref={filterAnchorRef}>
            <button
              onClick={() => setShowFilterPopup(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors border ${
                activeFilterCount > 0 || showFilterPopup
                  ? 'bg-gray-700 border-gray-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6 10.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/>
              </svg>
              Filters
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] leading-none font-semibold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {showFilterPopup && (
              <div className="absolute right-0 top-full mt-1.5 w-64 bg-gray-900 border border-gray-700 rounded-md shadow-xl z-20 p-3 space-y-3">
                <FilterGroup title="Server type">
                  <CheckRow label="Official" checked={typeFilters.has('official')} onChange={() => toggleTypeFilter('official')} />
                  <CheckRow label="Vanilla" checked={typeFilters.has('vanilla')} onChange={() => toggleTypeFilter('vanilla')} />
                  <CheckRow label="Modded" checked={typeFilters.has('modded')} onChange={() => toggleTypeFilter('modded')} />
                </FilterGroup>

                {regions.length > 0 && (
                  <FilterGroup title="Region">
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {regions.map(r => (
                        <CheckRow key={r} label={r} checked={regionFilters.has(r)} onChange={() => toggleRegionFilter(r)} />
                      ))}
                    </div>
                  </FilterGroup>
                )}

                <FilterGroup title="Other">
                  <CheckRow label="Online only" checked={filterOnline} onChange={v => setFilterOnline(v)} />
                  <CheckRow label="My character" checked={filterMyChar} onChange={v => setFilterMyChar(v)} />
                  <CheckRow label="No password" checked={filterNoPassword} onChange={v => setFilterNoPassword(v)} />
                </FilterGroup>

                <div className="pt-2 border-t border-gray-800 flex justify-end">
                  <button
                    onClick={clearAllFilters}
                    disabled={activeFilterCount === 0}
                    className="text-xs text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
        {modsFoundBanner && (
          <div className="mb-1 px-3 py-2 rounded-md bg-green-900/50 border border-green-700/60 text-green-300 text-xs">
            {modsFoundBanner.count} mod{modsFoundBanner.count !== 1 ? 's' : ''} discovered from game session (realm {modsFoundBanner.realmId}) — list refreshed.
          </div>
        )}

        {error && <div className="py-8 text-center text-red-400 text-sm">{error}</div>}

        {!error && loading && displayed.length === 0 && (
          <div className="py-8 text-center text-gray-500 text-sm">Loading servers…</div>
        )}

        {!error && !loading && displayed.length === 0 && (
          <div className="py-8 text-center text-gray-500 text-sm">
            {tab === 'favorites' ? 'No favourites yet. Star a server to add it here.' :
             tab === 'recent' ? 'No recently played servers.' :
             'No servers found.'}
          </div>
        )}

        {displayed.map(realm => (
          <RealmCard
            key={realm.id}
            realm={realm}
            expanded={expandedId === realm.id}
            quickPlay={quickPlayServer?.id === realm.id}
            favorite={isFavorite(realm.id)}
            busy={busy}
            gameStatus={gameStatus}
            playState={playState}
            modNames={modNames}
            onSelect={() => setExpandedId(expandedId === realm.id ? null : realm.id)}
            onToggleFavorite={() => isFavorite(realm.id) ? removeFavorite(realm.id) : addFavorite(realm.id)}
            onSetQuickPlay={() => setQuickPlayServer(quickPlayServer?.id === realm.id ? null : realm)}
            onLaunch={() => handleLaunch(realm)}
            onViewMap={() => setMapOpenRealm(realm)}
          />
        ))}
      </div>

      {mapOpenRealm && lo?.token && (
        <RealmMapModal
          realmId={mapOpenRealm.id}
          realmName={mapOpenRealm.name}
          characterId={mapOpenRealm.characterId}
          backend={mapOpenRealm.backend}
          onClose={() => setMapOpenRealm(null)}
        />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300 hover:text-white select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
      />
      <span>{label}</span>
    </label>
  )
}

interface RealmCardProps {
  realm: Realm
  expanded: boolean
  quickPlay: boolean
  favorite: boolean
  busy: boolean
  gameStatus: GameStatus
  playState: PlayPhase
  modNames: Record<string, string>
  onSelect: () => void
  onToggleFavorite: () => void
  onSetQuickPlay: () => void
  onLaunch: () => void
  onViewMap: () => void
}

function RealmCard({ realm, expanded, quickPlay, favorite, busy, gameStatus, playState, modNames, onSelect, onToggleFavorite, onSetQuickPlay, onLaunch, onViewMap }: RealmCardProps): React.JSX.Element {
  const fillPct = realm.maxPlayers > 0 ? Math.round((realm.players / realm.maxPlayers) * 100) : 0
  const barColor = realm.isOfficial || realm.isModded ? 'bg-amber-500' : 'bg-green-500'
  const modCount = realm.mods?.length ?? 0

  return (
    <div
      className={`rounded-lg border transition-colors overflow-hidden ${
        expanded
          ? 'border-blue-500 bg-gray-900'
          : quickPlay
            ? 'border-green-700 bg-gray-900 hover:border-green-600'
            : 'border-gray-800 bg-gray-900 hover:border-gray-700'
      }`}
    >
      {/* Card body — clickable */}
      <div className="px-4 pt-3 pb-3 cursor-pointer" onClick={onSelect}>
        {/* Title row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <span className="font-semibold text-sm text-white leading-snug">{realm.name}</span>
          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
            {realm.isOfficial && <Badge variant="blue">Official</Badge>}
            {realm.isModded && <Badge variant="amber">Modded</Badge>}
            {!realm.isOfficial && !realm.isModded && <Badge variant="gray">Vanilla</Badge>}
            {realm.backend !== PROD_BACKEND_URL && (
              <Badge variant="teal" title={realm.backend}>Community</Badge>
            )}
            {realm.characterId > 0 && <Badge variant="purple">My character</Badge>}
            {realm.hasAllowlist && <Badge variant="gray">Allowlist</Badge>}
            {!realm.isOnline && <Badge variant="offline">Offline</Badge>}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-start gap-6 mb-2.5">
          <RegionCell region={realm.regionKey} />
          <PlatformCell platform={realm.platform} />
          <MetaCell label="Clan cap" value={clanCapLabel(realm.clanCap)} />
          <MetaCell label="Started" value={fmtRelTime(realm.startDate)} />
          <MetaCell label="Wipe" value={fmtRelTime(realm.endDate)} />
          <MetaCell label="Size" value={String(realm.size || '—')} />
          {/* Spacer + map/favorite buttons */}
          <div className="ml-auto flex items-center gap-1">
            {realm.characterId > 0 && (
              <button
                onClick={e => { e.stopPropagation(); onViewMap() }}
                className="p-1 rounded text-gray-600 hover:text-blue-400 transition-colors"
                title="View map"
              >
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                  <path fillRule="evenodd" d="M15.817.613A.5.5 0 0 1 16 1v13a.5.5 0 0 1-.402.49l-5 1a.502.502 0 0 1-.196 0L5.5 14.51l-4.902.98A.5.5 0 0 1 0 15V2a.5.5 0 0 1 .402-.49l5-1a.5.5 0 0 1 .196 0l4.902.98 4.902-.98a.5.5 0 0 1 .415.103zM10 2.41l-4-.8v11.98l4 .8V2.41zm1 11.98 4-.8V1.61l-4 .8v11.98zm-6-.8V1.61l-4 .8v11.98l4-.8z"/>
                </svg>
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); onToggleFavorite() }}
              className={`p-1 rounded transition-colors ${
                favorite ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'
              }`}
              title={favorite ? 'Remove from favourites' : 'Add to favourites'}
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                <path d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Player bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${fillPct}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 flex-shrink-0 w-28 text-right">
            {realm.players} / {realm.maxPlayers} players
          </span>
        </div>

        {/* Mod chips */}
        {modCount > 0 && realm.mods && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {realm.mods.slice(0, 6).map(id => (
              <span key={id} className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-xs text-gray-400">
                {modNames[id] ?? id}
              </span>
            ))}
            {realm.mods.length > 6 && (
              <span className="px-1.5 py-0.5 text-xs text-gray-500">+{realm.mods.length - 6} more</span>
            )}
          </div>
        )}

      </div>

      {/* Expanded join panel */}
      {expanded && (
        <div className="border-t border-gray-800 px-4 py-3 bg-gray-900/80">
          <div className="text-xs font-semibold text-gray-300 mb-2.5">
            Join: {realm.name}
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mb-3">
            <JoinDetail label="Clan cap" value={clanCapLabel(realm.clanCap)} />
            <JoinDetail label="Max players" value={String(realm.maxPlayers)} />
            <JoinDetail label="Wipe end" value={fmtRelTime(realm.endDate)} />
            <JoinDetail label="Password" value={realm.hasPassword ? 'Yes' : 'No'} />
            <JoinDetail label="Allowlist" value={realm.hasAllowlist ? 'Yes' : 'No'} />
          </div>

          {realm.description && (
            <p className="text-xs text-gray-400 leading-relaxed mb-3">{realm.description}</p>
          )}

          <div className="text-xs text-gray-500 mb-3">
            <span className="text-gray-400">Mods required: </span>
            {modCount === 0
              ? 'None'
              : realm.mods?.map(id => modNames[id] ?? id).join(', ')}
          </div>

          <div className="flex gap-2">
            <button
              onClick={e => { e.stopPropagation(); onSetQuickPlay() }}
              title={quickPlay ? 'Remove from Quick Play' : 'Pin as Quick Play'}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-md text-sm font-medium transition-colors border ${
                quickPlay
                  ? 'border-green-600 bg-green-900/40 text-green-300 hover:bg-red-900/30 hover:border-red-600 hover:text-red-300'
                  : 'border-gray-600 bg-gray-800 text-gray-300 hover:border-green-600 hover:text-green-300'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5h-4v4.5c0 .276-.224 1.5-.5 1.5s-.5-1.224-.5-1.5V10h-4a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.189A5.921 5.921 0 0 1 5 6.833V2.377a2.853 2.853 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354z"/>
              </svg>
              {quickPlay ? 'Quick Play' : 'Pin'}
            </button>

            <button
              onClick={e => { e.stopPropagation(); onLaunch() }}
              disabled={busy}
              className={`flex-1 py-2.5 rounded-md font-bold text-sm tracking-wide transition-colors flex items-center justify-center gap-2 ${
                busy
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {getLaunchLabel(playState, gameStatus)}
              {!busy && (
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/>
                  <path fillRule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Badge({ variant, children, title }: { variant: 'blue' | 'amber' | 'gray' | 'purple' | 'offline' | 'teal'; children: React.ReactNode; title?: string }): React.JSX.Element {
  const cls = {
    blue:    'bg-blue-900/50 text-blue-300 border-blue-800/60',
    amber:   'bg-amber-900/50 text-amber-300 border-amber-800/60',
    gray:    'bg-gray-800 text-gray-400 border-gray-700',
    purple:  'bg-purple-900/50 text-purple-300 border-purple-800/60',
    offline: 'bg-gray-800 text-gray-500 border-gray-700',
    teal:    'bg-teal-900/50 text-teal-300 border-teal-800/60',
  }[variant]
  return (
    <span title={title} className={`px-1.5 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {children}
    </span>
  )
}

function MetaCell({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-semibold text-gray-200 mt-0.5">{value}</span>
    </div>
  )
}

function JoinDetail({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs text-gray-200">{value}</span>
    </div>
  )
}

// ── Region / Platform visual cells ───────────────────────────────────────────

const REGION_COLOR: Record<string, string> = {
  EU:  'text-blue-400',
  NA:  'text-red-400',
  SEA: 'text-emerald-400',
  AU:  'text-yellow-400',
  SA:  'text-orange-400',
  RU:  'text-purple-400',
}

function RegionCell({ region }: { region: string }): React.JSX.Element {
  const colorClass = REGION_COLOR[(region ?? '').toUpperCase()] ?? 'text-gray-400'
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-500">Region</span>
      <div className={`flex items-center gap-1 mt-0.5 ${colorClass}`}>
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.5-6.923c-.67.204-1.335.82-1.887 1.855A7.97 7.97 0 0 0 5.145 4H7.5V1.077zM4.09 4a9.267 9.267 0 0 1 .64-1.539 6.7 6.7 0 0 1 .597-.933A7.025 7.025 0 0 0 2.255 4H4.09zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a6.958 6.958 0 0 0-.656 2.5h2.49zM4.847 5a12.5 12.5 0 0 0-.338 2.5H7.5V5H4.847zM8.5 5v2.5h2.99a12.495 12.495 0 0 0-.337-2.5H8.5zM4.51 8.5a12.5 12.5 0 0 0 .337 2.5H7.5V8.5H4.51zm3.99 0V11h2.653c.187-.765.306-1.608.338-2.5H8.5zM5.145 12c.138.386.295.744.468 1.068.552 1.035 1.218 1.65 1.887 1.855V12H5.145zm.182 2.472a6.696 6.696 0 0 1-.597-.933A9.268 9.268 0 0 1 4.09 12H2.255a7.024 7.024 0 0 0 3.072 2.472zM3.82 11a13.652 13.652 0 0 1-.312-2.5h-2.49c.062.89.291 1.733.656 2.5H3.82zm6.853 3.472A7.024 7.024 0 0 0 13.745 12H11.91a9.27 9.27 0 0 1-.64 1.539 6.688 6.688 0 0 1-.597.933zM8.5 12v2.923c.67-.204 1.335-.82 1.887-1.855.173-.324.33-.682.468-1.068H8.5zm3.68-1h2.146c.365-.767.594-1.61.656-2.5h-2.49a13.65 13.65 0 0 1-.312 2.5zm2.802-3.5a6.959 6.959 0 0 0-.656-2.5H12.18c.174.782.282 1.623.312 2.5h2.49zM11.27 2.461c.247.464.462.98.64 1.539h1.835a7.024 7.024 0 0 0-3.072-2.472c.218.284.418.598.597.933zM10.855 4a7.966 7.966 0 0 0-.468-1.068C9.835 1.897 9.17 1.282 8.5 1.077V4h2.355z"/>
        </svg>
        <span className="text-xs font-semibold">{region || '—'}</span>
      </div>
    </div>
  )
}

type Platform = 'PC' | 'XBOX' | 'CROSS' | 'NONE'

function PlatformCell({ platform }: { platform: Platform }): React.JSX.Element {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-500">Platform</span>
      <div className="flex items-center gap-1 mt-0.5">
        <PlatformIcon platform={platform} />
      </div>
    </div>
  )
}

function PlatformIcon({ platform }: { platform: Platform }): React.JSX.Element {
  if (platform === 'PC') return (
    <span className="inline-flex items-center gap-1 text-gray-300 text-xs font-semibold">
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 4s0-2 2-2h12s2 0 2 2v6s0 2-2 2h-4c0 .667.083 1.167.25 1.5H11a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1h.75c.167-.333.25-.833.25-1.5H2s-2 0-2-2V4zm1.398-.855a.758.758 0 0 0-.254.302A1.46 1.46 0 0 0 1 4v6c0 .325.078.502.145.602.07.105.17.188.302.254a1.464 1.464 0 0 0 .538.143L2.5 11h11l.015-.001a1.464 1.464 0 0 0 .538-.143.758.758 0 0 0 .302-.254A1.464 1.464 0 0 0 15 10V4c0-.325-.078-.502-.145-.602a.757.757 0 0 0-.302-.254A1.46 1.46 0 0 0 13.5 3h-11c-.325 0-.502.078-.602.145z"/>
      </svg>
      PC
    </span>
  )
  if (platform === 'XBOX') return (
    <span className="inline-flex items-center gap-1 text-green-400 text-xs font-semibold">
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
        <path d="M7.987 16a8 8 0 1 1 .026 0zm-1.07-11.422c-1.595.33-2.993 1.215-3.948 2.49a6.927 6.927 0 0 0-1.328 4.048A6.977 6.977 0 0 0 3 13.764c.353-.396.854-.81 1.523-1.244 1.158-.748 2.883-1.51 5.476-1.51s4.318.762 5.476 1.51c.669.434 1.17.848 1.523 1.244a6.977 6.977 0 0 0 1.359-2.648 6.927 6.927 0 0 0-1.328-4.048c-.955-1.275-2.353-2.16-3.948-2.49-.324.39-.672.73-1.044 1.013a5.03 5.03 0 0 1-1.037.62v.001a3.18 3.18 0 0 1-.963.237 3.18 3.18 0 0 1-.963-.237v-.001a5.03 5.03 0 0 1-1.037-.62 7.066 7.066 0 0 1-1.044-1.013z"/>
        <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
      </svg>
      Xbox
    </span>
  )
  if (platform === 'CROSS') return (
    <span className="inline-flex items-center gap-1 text-blue-400 text-xs font-semibold">
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 4s0-2 2-2h12s2 0 2 2v6s0 2-2 2h-4c0 .667.083 1.167.25 1.5H11a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1h.75c.167-.333.25-.833.25-1.5H2s-2 0-2-2V4zm1.398-.855a.758.758 0 0 0-.254.302A1.46 1.46 0 0 0 1 4v6c0 .325.078.502.145.602.07.105.17.188.302.254a1.464 1.464 0 0 0 .538.143L2.5 11h11l.015-.001a1.464 1.464 0 0 0 .538-.143.758.758 0 0 0 .302-.254A1.464 1.464 0 0 0 15 10V4c0-.325-.078-.502-.145-.602a.757.757 0 0 0-.302-.254A1.46 1.46 0 0 0 13.5 3h-11c-.325 0-.502.078-.602.145z"/>
      </svg>
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
        <path d="M7.987 16a8 8 0 1 1 .026 0zm-1.07-11.422c-1.595.33-2.993 1.215-3.948 2.49a6.927 6.927 0 0 0-1.328 4.048A6.977 6.977 0 0 0 3 13.764c.353-.396.854-.81 1.523-1.244 1.158-.748 2.883-1.51 5.476-1.51s4.318.762 5.476 1.51c.669.434 1.17.848 1.523 1.244a6.977 6.977 0 0 0 1.359-2.648 6.927 6.927 0 0 0-1.328-4.048c-.955-1.275-2.353-2.16-3.948-2.49-.324.39-.672.73-1.044 1.013a5.03 5.03 0 0 1-1.037.62v.001a3.18 3.18 0 0 1-.963.237 3.18 3.18 0 0 1-.963-.237v-.001a5.03 5.03 0 0 1-1.037-.62 7.066 7.066 0 0 1-1.044-1.013z"/>
        <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
      </svg>
      Cross
    </span>
  )
  return <span className="text-xs text-gray-500">—</span>
}

function getLaunchLabel(playState: PlayPhase, gameStatus: GameStatus): string {
  if (playState.phase === 'checking') return 'Checking mods…'
  if (playState.phase === 'downloading') return `Downloading ${playState.pct}%`
  if (playState.phase === 'activating') return 'Activating mods…'
  if (playState.phase === 'launching' || gameStatus === 'launching') return 'Launching…'
  if (gameStatus === 'running') return 'Game running'
  return 'Launch'
}
