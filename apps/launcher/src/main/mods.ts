import { existsSync, readFileSync, writeFileSync, readdirSync, rmSync, cpSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getClient } from './steam'
import type { ModStatus } from '../shared'

const LO_APP_ID = 903950

// ── Steam library detection ────────────────────────────────────────────────

function findLibraryForApp(appId: number): string | null {
  const steamRoot = findSteamRoot()
  if (!steamRoot) return null
  const vdfPath = join(steamRoot, 'steamapps/libraryfolders.vdf')
  if (!existsSync(vdfPath)) return null
  const content = readFileSync(vdfPath, 'utf8')
  const pathMatches = [...content.matchAll(/"path"\s+"([^"]+)"/g)]
  const libraries = [steamRoot, ...pathMatches.map(m => m[1].replace(/\\\\/g, '\\'))]
  for (const lib of libraries) {
    if (existsSync(join(lib, `steamapps/appmanifest_${appId}.acf`))) return lib
  }
  return null
}

export function findGameDir(): string | null {
  const lib = findLibraryForApp(LO_APP_ID)
  if (!lib) return null
  const dir = join(lib, 'steamapps/common/Last Oasis')
  return existsSync(dir) ? dir : null
}

export function findSteamRoot(): string | null {
  const candidates = [
    process.env['ProgramFiles(x86)'] ? join(process.env['ProgramFiles(x86)']!, 'Steam') : null,
    'C:/Program Files (x86)/Steam',
    'C:/Program Files/Steam',
  ].filter(Boolean) as string[]

  for (const p of candidates) {
    if (existsSync(join(p, 'steamapps'))) return p
  }
  return null
}

export function findWorkshopDir(): string | null {
  const lib = findLibraryForApp(LO_APP_ID)
  if (!lib) return null
  const dir = join(lib, `steamapps/workshop/content/${LO_APP_ID}`)
  return existsSync(dir) ? dir : null
}

export function findGameModsDir(): string | null {
  const gameDir = findGameDir()
  if (!gameDir) return null
  const dir = join(gameDir, 'Mist', 'Content', 'Mods')
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }) } catch { return null }
  }
  return dir
}

// ── modinfo.json helpers — regex only, never JSON.parse/stringify ──────────
// JSON.parse corrupts the large-integer asset hashes in assetsToCook.

function readModinfoField(folder: string, field: 'title' | 'active'): string | null {
  const p = join(folder, 'modinfo.json')
  if (!existsSync(p)) return null
  const content = readFileSync(p, 'utf8')
  const m = content.match(new RegExp(`"${field}"\\s*:\\s*([^,\\n}]+)`))
  return m ? m[1].trim().replace(/^"|"$/g, '') : null
}

function setModinfoActive(folder: string, active: boolean): void {
  const p = join(folder, 'modinfo.json')
  if (!existsSync(p)) return
  let content = readFileSync(p, 'utf8')
  // Use direction-specific patterns (same as the working PS reference script):
  // enabling  → replace false→true only
  // disabling → replace true→false only
  content = active
    ? content.replace(/"active"\s*:\s*false/, '"active": true')
    : content.replace(/"active"\s*:\s*true/, '"active": false')
  writeFileSync(p, content, 'utf8')
}

// ── Workshop item state flags ──────────────────────────────────────────────
// From Steamworks SDK EItemState:
const STATE_SUBSCRIBED   = 1
const STATE_INSTALLED    = 4
const STATE_NEEDS_UPDATE = 8

// ── Public API ─────────────────────────────────────────────────────────────

export function checkMods(workshopIds: string[]): ModStatus[] {
  const client = getClient()
  const workshopDir = findWorkshopDir()
  const gameModsDir = findGameModsDir()

  return workshopIds.map(id => {
    const itemId = BigInt(id)
    const state = client?.workshop.state(itemId) ?? 0
    const subscribed = (state & STATE_SUBSCRIBED) !== 0
    const upToDate   = (state & STATE_NEEDS_UPDATE) === 0

    // "installed" means the mod is present in the game's Mist/Content/Mods folder
    const installed = gameModsDir ? existsSync(join(gameModsDir, id)) : false

    // Read modinfo from game folder first, fall back to workshop download folder
    const gameFolder     = gameModsDir ? join(gameModsDir, id) : undefined
    const workshopFolder = client?.workshop.installInfo(itemId)?.folder
      ?? (workshopDir ? join(workshopDir, id) : undefined)
    const folder = (gameFolder && existsSync(gameFolder)) ? gameFolder : workshopFolder

    const active = folder ? readModinfoField(folder, 'active') === 'true' : false
    const name   = folder ? readModinfoField(folder, 'title') ?? undefined : undefined
    const info   = client?.workshop.installInfo(itemId)

    return {
      workshopId: id,
      installed,
      subscribed,
      active,
      upToDate,
      name,
      sizeBytes: info?.sizeOnDisk !== undefined ? Number(info.sizeOnDisk) : undefined,
    }
  })
}

export async function downloadMods(
  workshopIds: string[],
  onProgress: (workshopId: string, pct: number) => void
): Promise<void> {
  const client = getClient()
  if (!client) throw new Error('Steam not available')

  const pending = new Set(workshopIds)

  for (const id of workshopIds) {
    const itemId = BigInt(id)
    const state = client.workshop.state(itemId)
    if (!(state & 1)) await client.workshop.subscribe(itemId)
    client.workshop.download(itemId, true)
  }

  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      for (const id of [...pending]) {
        const itemId = BigInt(id)
        const info = client.workshop.downloadInfo(itemId)
        if (info && info.total > 0n) {
          const pct = Number((info.current * 100n) / info.total)
          onProgress(id, pct)
          // Steam sometimes keeps returning download info even after the file
          // is fully downloaded — check STATE_INSTALLED to detect true completion.
          if (client.workshop.state(itemId) & STATE_INSTALLED) {
            pending.delete(id)
          }
        } else if (client.workshop.state(itemId) & STATE_INSTALLED) {
          onProgress(id, 100)
          pending.delete(id)
        }
      }
      if (pending.size === 0) {
        clearInterval(interval)
        resolve()
      }
    }, 500)

    // 10-minute hard timeout
    setTimeout(() => {
      clearInterval(interval)
      if (pending.size > 0) {
        reject(new Error(`Download timed out for: ${[...pending].join(', ')}`))
      }
    }, 10 * 60 * 1000)
  })
}

export function listInstalledMods(): ModStatus[] {
  const workshopDir = findWorkshopDir()
  if (!workshopDir) return []
  let entries: string[]
  try {
    entries = readdirSync(workshopDir)
  } catch {
    return []
  }
  return checkMods(entries.filter(e => /^\d+$/.test(e)))
}

export function listAllMods(): ModStatus[] {
  const client = getClient()
  const workshopDir = findWorkshopDir()
  const gameModsDir = findGameModsDir()
  const idSet = new Set<string>()

  // Steam subscription list
  if (client) {
    try {
      for (const id of client.workshop.getSubscribedItems()) idSet.add(id.toString())
    } catch {}
  }

  // Workshop download directory — skip folders Steam no longer considers
  // subscribed. Steam leaves the directory in place after an unsubscribe until
  // the next game launch, and we don't want those orphans in the listing.
  if (workshopDir) {
    try {
      for (const e of readdirSync(workshopDir)) {
        if (!/^\d+$/.test(e)) continue
        if (client) {
          const state = client.workshop.state(BigInt(e))
          if ((state & STATE_SUBSCRIBED) === 0) continue
        }
        idSet.add(e)
      }
    } catch {}
  }

  // Game mods folder — catches mods installed here but not in subscription list
  if (gameModsDir) {
    try {
      for (const e of readdirSync(gameModsDir)) {
        if (/^\d+$/.test(e)) idSet.add(e)
      }
    } catch {}
  }

  return checkMods([...idSet])
}

export function removeMod(workshopId: string): void {
  // Remove from the game's Mods folder (uninstall from game)
  const gameModsDir = findGameModsDir()
  if (gameModsDir) {
    const folder = join(gameModsDir, workshopId)
    if (existsSync(folder)) rmSync(folder, { recursive: true, force: true })
  }
}

export async function subscribeMod(workshopId: string): Promise<void> {
  const client = getClient()
  if (!client) throw new Error('Steam not available')
  await client.workshop.subscribe(BigInt(workshopId))
}

export async function unsubscribeMod(workshopId: string): Promise<void> {
  const client = getClient()
  if (client) await client.workshop.unsubscribe(BigInt(workshopId))
  // Remove local files immediately — Steam only cleans up on next game exit
  removeMod(workshopId)
}

export function toggleMod(workshopId: string, active: boolean): void {
  // checkMods reads `active` from the game folder when the mod is installed
  // there, falling back to the workshop folder otherwise. Update both so the
  // toggle is visible regardless of which path checkMods picks.
  const workshopDir = findWorkshopDir()
  if (workshopDir) setModinfoActive(join(workshopDir, workshopId), active)
  const gameModsDir = findGameModsDir()
  if (gameModsDir) setModinfoActive(join(gameModsDir, workshopId), active)
}

export function activateMods(targetIds: string[], workshopDir: string): void {
  const targetSet = new Set(targetIds)
  const gameModsDir = findGameModsDir()

  // Workshop dir — set active flags
  let workshopEntries: string[] = []
  try { workshopEntries = readdirSync(workshopDir) } catch {}
  for (const entry of workshopEntries) {
    setModinfoActive(join(workshopDir, entry), targetSet.has(entry))
  }

  if (gameModsDir) {
    // Copy target mods from workshop dir into game dir if they are missing.
    // This restores mods that were removed from the game folder without
    // requiring a full re-download from Steam.
    for (const id of targetIds) {
      const gamePath = join(gameModsDir, id)
      const workshopPath = join(workshopDir, id)
      if (!existsSync(gamePath) && existsSync(workshopPath)) {
        try {
          cpSync(workshopPath, gamePath, { recursive: true })
          console.log('[mods] copied to game dir:', id)
        } catch (e) {
          console.warn('[mods] failed to copy to game dir:', id, (e as Error).message)
        }
      }
    }

    // Set active flags for everything now in game dir
    let gameEntries: string[] = []
    try { gameEntries = readdirSync(gameModsDir) } catch {}
    for (const entry of gameEntries) {
      setModinfoActive(join(gameModsDir, entry), targetSet.has(entry))
    }
  }
}
