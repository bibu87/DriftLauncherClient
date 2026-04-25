import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { RealmMap, RealmMapTile, RealmMapWalker, WalkerPreferences } from '@drift/shared'

import iconSleepingGiantsRoads from '../assets/maps/sleeping_giants_roads.png'
import iconSleepingGiants from '../assets/maps/sleeping_giants.png'
import iconCanyon from '../assets/maps/canyon.png'
import iconVolcanyon from '../assets/maps/volcanyon.png'
import iconVolcanic from '../assets/maps/volcanic.png'
import iconKaliSpires from '../assets/maps/kali_spires.png'
import iconAncientCity from '../assets/maps/ancient_city.png'
import iconCraterIron from '../assets/maps/crater_iron.png'
import iconWormMap from '../assets/maps/wormmap.png'
import iconCradle from '../assets/maps/cradle.png'

import walkerBalang from '../assets/walkers/Balang_Walker_icon.png'
import walkerBuffalo from '../assets/walkers/Buffalo_Walker_icon.png'
import walkerCamelop from '../assets/walkers/Camelop_Walker_icon.png'
import walkerCobra from '../assets/walkers/Cobra_Walker_icon.png'
import walkerDinghy from '../assets/walkers/Dinghy_Walker_icon.png'
import walkerDomus from '../assets/walkers/Domus_Walker_icon.png'
import walkerFalco from '../assets/walkers/Falco_Walker_icon.png'
import walkerFirefly from '../assets/walkers/Firefly_Walker_icon.png'
import walkerHercul from '../assets/walkers/Hercul_Walker_icon.png'
import walkerHornet from '../assets/walkers/Hornet_Walker_icon.png'
import walkerMollusk from '../assets/walkers/Mollusk_Walker_icon.png'
import walkerPanda from '../assets/walkers/Panda_Walker.png'
import walkerProxy from '../assets/walkers/Proxy_Walker_icon.png'
import walkerRaptor from '../assets/walkers/Raptor_Sky_Walker_icon.png'
import walkerSchmetterling from '../assets/walkers/Schmetterling_Walker_icon.png'
import walkerSilur from '../assets/walkers/Silur_Walker_icon.png'
import walkerSpider from '../assets/walkers/Spider_Walker_icon.png'
import walkerStiletto from '../assets/walkers/Stiletto_Walker_icon.png'
import walkerTitan from '../assets/walkers/Titan_Walker_icon.png'
import walkerToboggan from '../assets/walkers/Toboggan_Walker_icon.png'
import walkerTusker from '../assets/walkers/Tusker_Walker.png'

// Order matters: more specific substrings must come first
// (e.g. "SleepingGiants_Roads" before "SleepingGiants").
const ICON_MATCHERS: Array<[RegExp, string]> = [
  [/SleepingGiants_Roads/i, iconSleepingGiantsRoads],
  [/SleepingGiants/i, iconSleepingGiants],
  [/Volcanyon/i, iconVolcanyon],
  [/Volcanic/i, iconVolcanic],
  [/KaliSpires|Kali_Spires/i, iconKaliSpires],
  [/AncientCity|Ancient_City/i, iconAncientCity],
  [/Crater/i, iconCraterIron],
  [/WormMap|EventMap_Worm/i, iconWormMap],
  [/MiniOasis|Cradle/i, iconCradle],
  [/Canyon/i, iconCanyon],
]

function iconForMapPath(path: string | undefined): string | null {
  if (!path) return null
  for (const [re, icon] of ICON_MATCHERS) if (re.test(path)) return icon
  return null
}

// Walker class_path → species + icon. Order matters where one name is a substring
// of another (e.g. "RaptorSky" before "Raptor", "Schmetterling" before plain prefixes).
// `species` is the human-readable label used in the type filter dropdown.
// `icon: null` = species recognised but no icon shipped (drop a PNG into
// src/renderer/assets/walkers/ and add an import + entry to enable it).
const WALKER_MATCHERS: Array<{ re: RegExp; species: string; icon: string | null }> = [
  { re: /Schmetterling/i, species: 'Schmetterling', icon: walkerSchmetterling },
  { re: /Raptor[_\s]?Sky|RaptorSky/i, species: 'Raptor Sky', icon: walkerRaptor },
  { re: /Camelop/i, species: 'Camelop', icon: walkerCamelop },
  { re: /Toboggan/i, species: 'Toboggan', icon: walkerToboggan },
  { re: /Stiletto/i, species: 'Stiletto', icon: walkerStiletto },
  { re: /Mollusk/i, species: 'Mollusk', icon: walkerMollusk },
  { re: /Buffalo/i, species: 'Buffalo', icon: walkerBuffalo },
  { re: /Firefly/i, species: 'Firefly', icon: walkerFirefly },
  { re: /Balang/i, species: 'Balang', icon: walkerBalang },
  { re: /Hercul/i, species: 'Hercul', icon: walkerHercul },
  { re: /Hornet/i, species: 'Hornet', icon: walkerHornet },
  { re: /Spider/i, species: 'Spider', icon: walkerSpider },
  { re: /Dinghy/i, species: 'Dinghy', icon: walkerDinghy },
  { re: /Tusker/i, species: 'Tusker', icon: walkerTusker },
  { re: /Cobra/i, species: 'Cobra', icon: walkerCobra },
  { re: /Domus/i, species: 'Domus', icon: walkerDomus },
  { re: /Falco/i, species: 'Falco', icon: walkerFalco },
  { re: /Panda/i, species: 'Panda', icon: walkerPanda },
  { re: /Proxy/i, species: 'Proxy', icon: walkerProxy },
  { re: /Silur/i, species: 'Silur', icon: walkerSilur },
  { re: /Titan/i, species: 'Titan', icon: walkerTitan },
  // Nomad is the starter walker; no dedicated icon shipped, so reuse the Spider art.
  { re: /Nomad/i, species: 'Nomad', icon: walkerSpider },
]

function walkerSpecies(classPath: string, name?: string): { species: string; icon: string | null } {
  for (const m of WALKER_MATCHERS) {
    if (classPath && m.re.test(classPath)) return { species: m.species, icon: m.icon }
  }
  // Fallback: walker user-given name often contains the species
  // (e.g. "My Stiletto", "Big Hercul"). Useful when class_path uses
  // a code name we don't recognize.
  if (name) {
    for (const m of WALKER_MATCHERS) {
      if (m.re.test(name)) return { species: m.species, icon: m.icon }
    }
  }
  // Log the unmatched class_path once per session so we can extend matchers.
  if (classPath && !loggedUnknown.has(classPath)) {
    loggedUnknown.add(classPath)
    console.warn(`[walkers] unknown class_path: ${classPath}${name ? ` (name: "${name}")` : ''}`)
  }
  return { species: 'Unknown', icon: null }
}

const loggedUnknown = new Set<string>()

// Flat-top hex, odd-q offset coords. Size = distance from center to corner.
const HEX_SIZE = 48
const HEX_WIDTH = 2 * HEX_SIZE
const HEX_HEIGHT = Math.sqrt(3) * HEX_SIZE
const PADDING = 24

// Wiki map PNGs are self-contained hex art — render them at the hex width
// and overscale slightly so the art fully covers the underlying polygon.
const ICON_SCALE = 1.02
const ICON_SIZE = HEX_WIDTH * ICON_SCALE

function hexCenter(x: number, y: number): { cx: number; cy: number } {
  const offsetY = x % 2 === 0 ? 0 : HEX_HEIGHT / 2
  return {
    cx: x * HEX_WIDTH * 0.75 + HEX_WIDTH / 2 + PADDING,
    cy: y * HEX_HEIGHT + offsetY + HEX_HEIGHT / 2 + PADDING,
  }
}

function hexPoints(cx: number, cy: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i
    pts.push(`${cx + HEX_SIZE * Math.cos(angle)},${cy + HEX_SIZE * Math.sin(angle)}`)
  }
  return pts.join(' ')
}

interface Props {
  realmId: number
  realmName: string
  characterId: number
  backend: string
  onClose: () => void
}

export default function RealmMapModal({ realmId, realmName, characterId, backend, onClose }: Props): React.JSX.Element {
  const [data, setData] = useState<RealmMap | null>(null)
  const [walkerPrefs, setWalkerPrefs] = useState<WalkerPreferences | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hover, setHover] = useState<{ tile: RealmMapTile; x: number; y: number } | null>(null)
  const [focusedTileId, setFocusedTileId] = useState<number | null>(null)
  const [filterQuery, setFilterQuery] = useState('')
  const [filterSpecies, setFilterSpecies] = useState<string>('')
  const [filterFavOnly, setFilterFavOnly] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const mapBodyRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setWalkerPrefs(null)
    window.api.realms.getMap(realmId, characterId, backend)
      .then(map => { if (!cancelled) { setData(map); setLoading(false) } })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        setLoading(false)
      })
    // Walker prefs are best-effort: a failure here just means we won't show
    // favorite indicators — the map itself should still render.
    window.api.realms.getWalkerPreferences(realmId, characterId, backend)
      .then(prefs => { if (!cancelled) setWalkerPrefs(prefs) })
      .catch(() => { /* ignore — favorites become invisible */ })
    return () => { cancelled = true }
  }, [realmId, characterId, backend])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const layout = useMemo(() => {
    if (!data || data.tiles.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 400, height: 400 }
    }
    // Prefer the realm's declared bounds; fall back to tile extents if bounds look empty.
    const tileMinX = Math.min(...data.tiles.map(t => t.x))
    const tileMinY = Math.min(...data.tiles.map(t => t.y))
    const tileMaxX = Math.max(...data.tiles.map(t => t.x))
    const tileMaxY = Math.max(...data.tiles.map(t => t.y))
    const minX = Number.isFinite(data.minX) && data.maxX >= data.minX ? Math.min(data.minX, tileMinX) : tileMinX
    const maxX = Number.isFinite(data.maxX) && data.maxX >= data.minX ? Math.max(data.maxX, tileMaxX) : tileMaxX
    const minY = Number.isFinite(data.minY) && data.maxY >= data.minY ? Math.min(data.minY, tileMinY) : tileMinY
    const maxY = Number.isFinite(data.maxY) && data.maxY >= data.minY ? Math.max(data.maxY, tileMaxY) : tileMaxY
    const cols = maxX - minX + 1
    const rows = maxY - minY + 1
    const width = cols * HEX_WIDTH * 0.75 + HEX_WIDTH * 0.25 + PADDING * 2
    const height = rows * HEX_HEIGHT + HEX_HEIGHT / 2 + PADDING * 2
    return { minX, minY, maxX, maxY, width, height }
  }, [data])

  const tileByKey = useMemo(() => {
    const map = new Map<string, RealmMapTile>()
    for (const t of data?.tiles ?? []) map.set(`${t.x},${t.y}`, t)
    return map
  }, [data])

  const emptyCells = useMemo(() => {
    const out: Array<{ x: number; y: number }> = []
    for (let y = layout.minY; y <= layout.maxY; y++) {
      for (let x = layout.minX; x <= layout.maxX; x++) {
        if (!tileByKey.has(`${x},${y}`)) out.push({ x, y })
      }
    }
    return out
  }, [layout, tileByKey])

  // Set of walker_ids the player has marked as a preferred (favorite) walker.
  // Walker prefs come from /Api/Migration/GetWalkerPreferences — presence in
  // the list = favorite. Empty when no prefs are set or the call failed.
  const favoriteIds = useMemo(() => {
    const set = new Set<number>()
    for (const w of walkerPrefs?.walkers ?? []) {
      if (w.walkerId > 0) set.add(w.walkerId)
    }
    return set
  }, [walkerPrefs])

  const allWalkers = useMemo<SidebarWalker[]>(() => {
    if (!data) return []
    const out: SidebarWalker[] = []
    for (const tile of data.tiles) {
      for (const w of tile.walkers) {
        const { species, icon } = walkerSpecies(w.classPath, w.name)
        out.push({ ...w, tile, species, icon, isFavorite: favoriteIds.has(w.walkerId) })
      }
    }
    return out
  }, [data, favoriteIds])

  const speciesOptions = useMemo(() => {
    const set = new Set<string>()
    for (const w of allWalkers) set.add(w.species)
    return Array.from(set).sort()
  }, [allWalkers])

  const filteredWalkers = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    return allWalkers
      .filter(w => !filterFavOnly || w.isFavorite)
      .filter(w => !filterSpecies || w.species === filterSpecies)
      .filter(w => {
        if (!q) return true
        return (
          w.name.toLowerCase().includes(q) ||
          w.characterOwnerName.toLowerCase().includes(q) ||
          w.species.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => {
        // Favorites first, then by name.
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
        return (a.name || a.species).localeCompare(b.name || b.species)
      })
  }, [allWalkers, filterQuery, filterSpecies, filterFavOnly])

  const focusTile = (tileId: number): void => {
    setFocusedTileId(tileId)
    const el = tileRefs.current.get(tileId)
    if (el) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-8"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="relative bg-gray-950 border border-gray-800 rounded-xl shadow-2xl max-w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-gray-900/80 flex-shrink-0">
          <div>
            <div className="text-sm font-semibold text-white">{realmName}</div>
            {data && <div className="text-xs text-gray-500">{data.tiles.length} tiles</div>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
            aria-label="Close"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
              <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden bg-gray-950">
          {/* Walker sidebar — only shown once we have a successful map load. */}
          {!loading && !error && data && (
            <WalkerSidebar
              walkers={filteredWalkers}
              speciesOptions={speciesOptions}
              filterQuery={filterQuery}
              setFilterQuery={setFilterQuery}
              filterSpecies={filterSpecies}
              setFilterSpecies={setFilterSpecies}
              filterFavOnly={filterFavOnly}
              setFilterFavOnly={setFilterFavOnly}
              focusedTileId={focusedTileId}
              onFocus={focusTile}
              totalCount={allWalkers.length}
            />
          )}
          <div ref={mapBodyRef} className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center justify-center min-h-[300px] min-w-[400px] text-gray-500 text-sm">
              Loading map…
            </div>
          )}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center min-h-[300px] min-w-[400px] text-center gap-2 px-8">
              <div className="text-sm font-semibold text-gray-300">Can't load map</div>
              <div className="text-xs text-gray-500 max-w-md">{errorMessage(error, characterId)}</div>
            </div>
          )}
          {!loading && !error && data && (
            <div
              className="relative mx-auto"
              style={{ width: layout.width, height: layout.height }}
              onMouseLeave={() => setHover(null)}
            >
              <svg
                width={layout.width}
                height={layout.height}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                className="absolute inset-0"
              >
                {/* Empty cells — the always-visible hex grid */}
                {emptyCells.map(({ x, y }) => {
                  const { cx, cy } = hexCenter(x - layout.minX, y - layout.minY)
                  return (
                    <polygon
                      key={`empty-${x}-${y}`}
                      points={hexPoints(cx, cy)}
                      fill="#0b1220"
                      stroke="#1f2937"
                      strokeWidth={1}
                      opacity={0.6}
                    />
                  )
                })}
                {/* Tile cells — only drawn for tiles without a map icon, so the PNG's hex art */}
                {/* isn't framed by a mismatched polygon stroke. */}
                {data.tiles.map(tile => {
                  const mapPath = data.mapLookup[String(tile.mapId)]?.path
                  if (iconForMapPath(mapPath)) return null
                  const { cx, cy } = hexCenter(tile.x - layout.minX, tile.y - layout.minY)
                  const fill = !tile.isOnline
                    ? '#1f2937'
                    : tile.type === 'OASIS'
                      ? '#14532d'
                      : tile.type === 'MINI_OASIS'
                        ? '#1e3a8a'
                        : tile.type === 'EVENT'
                          ? '#7c2d12'
                          : '#111827'
                  return (
                    <polygon
                      key={tile.id}
                      points={hexPoints(cx, cy)}
                      fill={fill}
                      stroke="none"
                      opacity={tile.isOnline ? 0.9 : 0.55}
                    />
                  )
                })}
                {/* Focus ring — drawn last in the SVG so it overlays cell fills, but the
                    HTML <img> overlay still renders on top. That's fine: the ring sits on the
                    polygon edge and the icon doesn't reach the corners, so the highlight is
                    still visible on iconified tiles. */}
                {focusedTileId !== null && (() => {
                  const tile = data.tiles.find(t => t.id === focusedTileId)
                  if (!tile) return null
                  const { cx, cy } = hexCenter(tile.x - layout.minX, tile.y - layout.minY)
                  return (
                    <polygon
                      points={hexPoints(cx, cy)}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth={3}
                      style={{ filter: 'drop-shadow(0 0 6px #fbbf24)' }}
                    />
                  )
                })()}
              </svg>

              {/* HTML overlay for tile icons + hover targets. <img> is more reliable than SVG <image> in Electron. */}
              {/* Icon box is a square of HEX_WIDTH (= 2·size) to match the wiki's square PNG canvas, */}
              {/* so the flat-top hex art inside fills the full cell width and overlaps neighbours in the */}
              {/* transparent corners — no visible gaps between tiles. */}
              {data.tiles.map(tile => {
                const { cx, cy } = hexCenter(tile.x - layout.minX, tile.y - layout.minY)
                const mapPath = data.mapLookup[String(tile.mapId)]?.path
                const icon = iconForMapPath(mapPath)
                return (
                  <div
                    key={`hit-${tile.id}`}
                    ref={el => {
                      if (el) tileRefs.current.set(tile.id, el)
                      else tileRefs.current.delete(tile.id)
                    }}
                    className="absolute"
                    style={{
                      left: cx - HEX_WIDTH / 2,
                      top: cy - HEX_WIDTH / 2,
                      width: HEX_WIDTH,
                      height: HEX_WIDTH,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => setHover({ tile, x: e.clientX, y: e.clientY })}
                    onMouseMove={e => setHover({ tile, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setFocusedTileId(prev => prev === tile.id ? null : tile.id)}
                  >
                    {icon && (
                      <img
                        src={icon}
                        alt=""
                        draggable={false}
                        className="pointer-events-none absolute block"
                        style={{
                          left: '50%',
                          top: '50%',
                          width: ICON_SIZE,
                          height: ICON_SIZE,
                          transform: 'translate(-50%, -50%)',
                          opacity: tile.isOnline ? 1 : 0.4,
                        }}
                      />
                    )}
                    <TypeBadge type={tile.type} isOnline={tile.isOnline} />
                  </div>
                )
              })}
            </div>
          )}
          </div>
        </div>
      </div>

      {hover && (
        <TileTooltip tile={hover.tile} x={hover.x} y={hover.y} regionName={data?.regionLookup[String(hover.tile.regionId)]?.name ?? ''} clanName={data?.clanLookup[String(hover.tile.claimClanId)]?.name} />
      )}
    </div>
  )
}

interface SidebarWalker extends RealmMapWalker {
  tile: RealmMapTile
  species: string
  icon: string | null
  isFavorite: boolean
}

function WalkerSidebar({
  walkers,
  speciesOptions,
  filterQuery,
  setFilterQuery,
  filterSpecies,
  setFilterSpecies,
  filterFavOnly,
  setFilterFavOnly,
  focusedTileId,
  onFocus,
  totalCount,
}: {
  walkers: SidebarWalker[]
  speciesOptions: string[]
  filterQuery: string
  setFilterQuery: (v: string) => void
  filterSpecies: string
  setFilterSpecies: (v: string) => void
  filterFavOnly: boolean
  setFilterFavOnly: (v: boolean) => void
  focusedTileId: number | null
  onFocus: (tileId: number) => void
  totalCount: number
}): React.JSX.Element {
  return (
    <aside className="w-72 flex-shrink-0 border-r border-gray-800 bg-gray-900/40 flex flex-col">
      <div className="p-3 border-b border-gray-800 flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Walkers</div>
          <div className="text-[11px] text-gray-500">
            {walkers.length === totalCount ? totalCount : `${walkers.length} / ${totalCount}`}
          </div>
        </div>
        <input
          type="text"
          value={filterQuery}
          onChange={e => setFilterQuery(e.target.value)}
          placeholder="Search name, owner, type…"
          className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-600"
        />
        <div className="flex gap-2">
          <SpeciesSelect
            value={filterSpecies}
            onChange={setFilterSpecies}
            options={speciesOptions}
          />
          <button
            type="button"
            onClick={() => setFilterFavOnly(!filterFavOnly)}
            title={filterFavOnly ? 'Show all walkers' : 'Show favorites only'}
            className={`px-2 rounded border text-xs transition-colors ${
              filterFavOnly
                ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                : 'border-gray-800 bg-gray-950 text-gray-500 hover:text-gray-300'
            }`}
          >
            <FavoriteStar filled={filterFavOnly} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {walkers.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-500">
            {totalCount === 0 ? 'No walkers found on this realm.' : 'No walkers match the current filters.'}
          </div>
        ) : (
          <ul className="divide-y divide-gray-800/60">
            {walkers.map(w => (
              <li key={`${w.tile.id}-${w.id}`}>
                <button
                  type="button"
                  onClick={() => onFocus(w.tile.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-800/50 transition-colors ${
                    focusedTileId === w.tile.id ? 'bg-amber-500/10' : ''
                  }`}
                >
                  <div className="w-9 h-9 flex-shrink-0 bg-gray-950 border border-gray-800 rounded overflow-hidden flex items-center justify-center">
                    {w.icon ? (
                      <img src={w.icon} alt="" className="w-full h-full object-contain" draggable={false} />
                    ) : (
                      <span className="text-[9px] uppercase tracking-wide text-gray-500 font-semibold px-1 truncate">
                        {w.species.slice(0, 3)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-gray-200 truncate">
                        {w.name || `${w.species} walker`}
                      </span>
                      {w.isFavorite && <FavoriteStar filled className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">
                      {w.species}
                      {w.characterOwnerName ? ` · ${w.characterOwnerName}` : ''}
                    </div>
                    <div className="text-[10px] text-gray-600">
                      Tile {w.tile.name || `${w.tile.x},${w.tile.y}`}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

// Custom dropdown — native <select> option popups in Electron can render with
// light OS colors regardless of CSS, so we render our own button + list instead.
function SpeciesSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const label = value || 'All types'

  return (
    <div ref={wrapRef} className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-xs text-gray-200 hover:border-gray-700 focus:outline-none focus:border-gray-600"
      >
        <span className="truncate">{label}</span>
        <svg viewBox="0 0 12 12" className="w-3 h-3 text-gray-500 flex-shrink-0 ml-1" fill="currentColor">
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        // Dark theme rebinds .bg-gray-950 to transparent, so we use .bg-gray-900/80
        // (rebound to frosted dark glass) to match the modal header's surface.
        <div className="absolute z-10 left-0 right-0 mt-1 bg-gray-900/80 backdrop-blur-md border border-gray-800 rounded shadow-xl max-h-60 overflow-y-auto">
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false) }}
            className={`w-full text-left px-2 py-1.5 text-xs hover:bg-gray-800 ${value === '' ? 'bg-gray-800 text-white' : 'text-gray-300'}`}
          >
            All types
          </button>
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false) }}
              className={`w-full text-left px-2 py-1.5 text-xs hover:bg-gray-800 ${value === opt ? 'bg-gray-800 text-white' : 'text-gray-300'}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FavoriteStar({ filled, className }: { filled?: boolean; className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? 'w-4 h-4'}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinejoin="round"
    >
      <path d="M8 1.6l1.96 4.18 4.54.51-3.39 3.1.93 4.46L8 11.62l-4.04 2.23.93-4.46-3.39-3.1 4.54-.51L8 1.6z" />
    </svg>
  )
}

function TypeBadge({ type, isOnline }: { type: string; isOnline: boolean }): React.JSX.Element | null {
  const variant =
    type === 'OASIS' ? { bg: '#14532d', ring: '#4ade80', title: 'Oasis', icon: <OasisGlyph /> } :
    type === 'MINI_OASIS' ? { bg: '#1e3a8a', ring: '#60a5fa', title: 'Cradle', icon: <CradleGlyph /> } :
    type === 'EVENT' ? (
      isOnline
        ? { bg: '#7c2d12', ring: '#fb923c', title: 'Event', icon: <EventGlyph /> }
        : { bg: '#1f2937', ring: '#6b7280', title: 'Event (offline)', icon: <EventOfflineGlyph /> }
    ) : null
  if (!variant) return null

  // Positioned as percentages of the HEX_WIDTH × HEX_WIDTH hit square, so it scales with HEX_SIZE.
  // Top-right of the hex interior: vertex is at (75%, 6.7%); badge sits just inside.
  return (
    <div
      className="absolute pointer-events-none flex items-center justify-center rounded-full border-2 shadow-md"
      title={variant.title}
      style={{
        right: '8%',
        top: '12%',
        width: '26%',
        height: '26%',
        backgroundColor: variant.bg,
        borderColor: variant.ring,
        color: variant.ring,
        opacity: isOnline || type !== 'EVENT' ? 1 : 0.85,
      }}
    >
      {variant.icon}
    </div>
  )
}

// Flat-top hex "oasis" glyph: a stylized leaf / drop (inline SVG so it scales with the badge).
function OasisGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="62%" height="62%" fill="currentColor">
      <path d="M8 1c2.5 3 4.5 5.5 4.5 8.2a4.5 4.5 0 1 1-9 0C3.5 6.5 5.5 4 8 1z"/>
    </svg>
  )
}

function CradleGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="60%" height="60%" fill="currentColor">
      <circle cx="8" cy="8" r="3.2"/>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  )
}

function EventGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="72%" height="72%" fill="currentColor">
      <path d="M9.5 1.5 4 9h3l-1.5 5.5L11 7H8l1.5-5.5z"/>
    </svg>
  )
}

function EventOfflineGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="72%" height="72%" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M9.5 1.5 4 9h3l-1.5 5.5L11 7H8l1.5-5.5z"/>
      <line x1="2" y1="14" x2="14" y2="2"/>
    </svg>
  )
}

function TileTooltip({ tile, x, y, regionName, clanName }: { tile: RealmMapTile; x: number; y: number; regionName: string; clanName?: string }): React.JSX.Element {
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x + 16,
    top: y + 16,
    pointerEvents: 'none',
    zIndex: 60,
    backgroundColor: '#030712',
    backdropFilter: 'none',
  }
  return (
    <div style={style} className="border border-gray-700 rounded-md shadow-xl px-3 py-2 text-xs text-gray-200 max-w-xs">
      <div className="font-semibold text-white mb-1">{tile.name || 'Unnamed tile'}</div>
      <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-gray-400">
        <span>Type</span><span className="text-gray-200">{tile.type || '—'}</span>
        {(() => {
          const life = tileLifecycle(tile)
          if (!life) return null
          return <><span>{life.label}</span><span className={life.color}>{life.text}</span></>
        })()}
        {regionName && <><span>Region</span><span className="text-gray-200">{regionName}</span></>}
        <span>Difficulty</span><span className="text-gray-200">{tile.difficulty || '—'}</span>
        <span>PvP</span><span className="text-gray-200">{tile.pvpMode || '—'}</span>
        <span>Status</span><span className={tile.isOnline ? 'text-green-400' : 'text-gray-500'}>{tile.isOnline ? 'Online' : 'Offline'}</span>
        {tile.maxSlots > 0 && <><span>Slots</span><span className="text-gray-200">{tile.usedSlots}/{tile.maxSlots}</span></>}
        {tile.clanCap > 0 && <><span>Clan cap</span><span className="text-gray-200">{tile.clanCap}</span></>}
        {clanName && <><span>Claim</span><span className="text-amber-300">{clanName}</span></>}
        {tile.playerDeaths24h > 0 && <><span>Deaths 24h</span><span className="text-red-300">{tile.playerDeaths24h}</span></>}
      </div>
    </div>
  )
}

// Picks the most relevant time-based row for the tooltip:
//  - tile hasn't spawned yet (activationDate in future) → "Spawns in …"
//  - tile is active and will burn (decayDate in future) → "Burns in …"
//  - decayDate in the past                              → "Burned … ago"
function tileLifecycle(tile: RealmMapTile): { label: string; text: string; color: string } | null {
  const now = Math.floor(Date.now() / 1000)
  if (tile.activationDate > now) {
    return { label: 'Spawns', text: `in ${fmtDuration(tile.activationDate - now)}`, color: 'text-blue-300' }
  }
  if (tile.decayDate > now) {
    return { label: 'Burns', text: `in ${fmtDuration(tile.decayDate - now)}`, color: 'text-amber-300' }
  }
  if (tile.decayDate > 0) {
    return { label: 'Burned', text: `${fmtDuration(now - tile.decayDate)} ago`, color: 'text-gray-500' }
  }
  return null
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  if (h < 24) return rm > 0 ? `${h}h ${rm}m` : `${h}h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`
}

function errorMessage(code: string, characterId: number): string {
  if (code === 'NO_CHARACTER') return 'You need a character on this realm to view its map.'
  if (code === 'MAP_UNAVAILABLE') return 'The realm appears to be offline — no live map data available.'
  if (code === 'SESSION_EXPIRED') return 'Your session expired. Please log in again.'
  if (characterId <= 0) return 'You need a character on this realm to view its map.'
  return code
}
