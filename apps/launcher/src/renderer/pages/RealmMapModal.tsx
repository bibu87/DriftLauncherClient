import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { RealmMap, RealmMapTile } from '@drift/shared'

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
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hover, setHover] = useState<{ tile: RealmMapTile; x: number; y: number } | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    window.api.realms.getMap(realmId, characterId, backend)
      .then(map => { if (!cancelled) { setData(map); setLoading(false) } })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        setLoading(false)
      })
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
        <div className="flex-1 overflow-auto p-4 bg-gray-950">
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

      {hover && (
        <TileTooltip tile={hover.tile} x={hover.x} y={hover.y} regionName={data?.regionLookup[String(hover.tile.regionId)]?.name ?? ''} clanName={data?.clanLookup[String(hover.tile.claimClanId)]?.name} />
      )}
    </div>
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
