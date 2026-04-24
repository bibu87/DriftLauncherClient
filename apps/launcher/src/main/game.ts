import { shell } from 'electron'
import { exec, spawn } from 'child_process'
import { existsSync, openSync, readSync, statSync, closeSync } from 'fs'
import { join } from 'path'
import type { WebContents } from 'electron'
import { findGameDir, findSteamRoot } from './mods'
import { PROD_BACKEND_URL } from '@drift/shared'

export type GameStatus = 'idle' | 'launching' | 'running' | 'stopped'

const LO_APP_ID = 903950

// When launching into a realm hosted by a community backend, the game needs
// -backendapiurloverride=<host[:port]> so its in-game API calls target the
// same backend. No override is emitted for the prod URL (the game defaults
// there already).
function backendOverrideArg(backend: string | undefined): string | null {
  if (!backend || backend === PROD_BACKEND_URL) return null
  try {
    return `-backendapiurloverride=${new URL(backend).host}`
  } catch {
    return null
  }
}

function findLaunchExe(): string | null {
  const gameDir = findGameDir()
  if (!gameDir) return null

  // Common UE4 game exe layouts — check most-specific paths first
  const candidates = [
    join(gameDir, 'Mist', 'Binaries', 'Win64', 'MistClient-Win64-Shipping.exe'),
    join(gameDir, 'Binaries', 'Win64', 'MistClient-Win64-Shipping.exe'),
    join(gameDir, 'MistClient-Win64-Shipping.exe'),
    join(gameDir, 'MistClient.exe'),
    join(gameDir, 'OasisLauncher.exe'),
  ]
  return candidates.find(existsSync) ?? null
}

export function launchGame(backend?: string): Promise<void> {
  const extraArgs: string[] = []
  const override = backendOverrideArg(backend)
  if (override) extraArgs.push(override)

  // SteamAPI_Init() registers the launcher with the Steam client as app 903950.
  // Steam then considers this Electron process to BE the running game, and any
  // steam:// URL or -applaunch command is silently no-op'd.
  // Spawning the game exe directly bypasses that check entirely — the game
  // process connects to the already-running Steam client on its own.
  const exePath = findLaunchExe()
  if (exePath) {
    console.log('[game] launching directly:', exePath, extraArgs)
    return new Promise<void>((resolve, reject) => {
      const child = spawn(exePath, extraArgs, {
        detached: true,
        stdio: 'ignore',
        cwd: join(exePath, '..'),
      })
      child.once('error', reject)
      child.once('spawn', () => { child.unref(); resolve() })
    })
  }

  // Fallback — if game dir not found, try steam.exe -applaunch. Args after
  // the appid are forwarded to the game's argv.
  const steamRoot = findSteamRoot()
  const steamExe = steamRoot ? join(steamRoot, 'steam.exe') : null
  if (steamExe && existsSync(steamExe)) {
    console.log('[game] launching via steam -applaunch (game dir not found)', extraArgs)
    return new Promise<void>((resolve, reject) => {
      const child = spawn(steamExe, ['-applaunch', String(LO_APP_ID), ...extraArgs], {
        detached: true,
        stdio: 'ignore',
      })
      child.once('error', reject)
      child.once('spawn', () => { child.unref(); resolve() })
    })
  }

  // Last-resort fallback. The steam:// protocol doesn't cleanly forward
  // arbitrary launch args, so community-backend overrides silently won't
  // apply here — the user will end up joining on prod. We still try, so the
  // game at least starts.
  if (override) {
    console.warn('[game] steam:// fallback cannot forward backend override; launch will hit prod')
  }
  console.log('[game] launching via URL fallback')
  return shell.openExternal(`steam://rungameid/${LO_APP_ID}`)
}

function findLogPath(): string | null {
  const appData = process.env.LOCALAPPDATA
  if (appData) {
    const p = join(appData, 'Mist/Saved/Logs/Mist.log')
    if (existsSync(p)) return p
  }
  const gameDir = findGameDir()
  if (gameDir) {
    const p = join(gameDir, 'Mist/Saved/Logs/Mist.log')
    if (existsSync(p)) return p
  }
  return null
}

// EAC may wrap or relaunch the game under a different process name.
// Search the full tasklist for any Mist/OasisLauncher process rather than
// matching a single exact name.
function isGameRunning(): Promise<boolean> {
  return new Promise(resolve => {
    exec('tasklist /NH', (err, stdout) => {
      if (err) { resolve(false); return }
      const lower = stdout.toLowerCase()
      resolve(
        lower.includes('mistclient') ||
        lower.includes('oasislauncher') ||
        lower.includes('easyanticheat')
      )
    })
  })
}

function tailLog(logPath: string, onLines: (lines: string[]) => void): () => void {
  // Start at 0 so we read the whole file from the beginning — UE4 recreates the
  // log file each session, so any content we find is from the current session.
  // Also handles the case where we detect the log late (mods logged during loading).
  let pos = 0

  const id = setInterval(() => {
    try {
      const size = statSync(logPath).size
      if (size < pos) {
        // File was recreated/truncated — reset and re-read from start
        pos = 0
      }
      if (size <= pos) return
      const fd = openSync(logPath, 'r')
      const buf = Buffer.alloc(size - pos)
      readSync(fd, buf, 0, buf.length, pos)
      closeSync(fd)
      pos = size
      const lines = buf.toString('utf8').split(/\r?\n/).filter(l => l.trim())
      if (lines.length) onLines(lines)
    } catch {}
  }, 1000)

  return () => clearInterval(id)
}

// Workshop IDs are 9–11 digit numbers. We look for them only in lines that
// mention mod/workshop/ugc keywords so we don't flood the set with unrelated numbers.
function extractWorkshopIds(lines: string[]): string[] {
  const ids = new Set<string>()
  for (const line of lines) {
    if (!/mod|workshop|ugc/i.test(line)) continue
    for (const m of line.matchAll(/\b(\d{9,11})\b/g)) ids.add(m[1])
  }
  return [...ids]
}

function safeSend(sender: WebContents, channel: string, ...args: unknown[]): void {
  if (!sender.isDestroyed()) sender.send(channel, ...args)
}

export async function monitorGame(
  sender: WebContents,
  realmId: number,
  onModsFound: (realmId: number, workshopIds: string[]) => void
): Promise<void> {
  safeSend(sender, 'game:status', 'launching' satisfies GameStatus)

  // Wait up to 2 min for the game process to appear
  const launchDeadline = Date.now() + 2 * 60 * 1000
  while (!(await isGameRunning())) {
    if (Date.now() > launchDeadline) {
      console.warn('[game] timed out waiting for game process')
      safeSend(sender, 'game:status', 'stopped' satisfies GameStatus)
      return
    }
    await new Promise(r => setTimeout(r, 3000))
  }

  safeSend(sender, 'game:status', 'running' satisfies GameStatus)
  console.log('[game] game process detected')

  // Wait up to 30s for the log file to appear after process starts
  let logPath: string | null = null
  for (let i = 0; i < 10 && !logPath; i++) {
    await new Promise(r => setTimeout(r, 3000))
    logPath = findLogPath()
  }

  if (logPath) console.log('[game] tailing log:', logPath)
  else console.warn('[game] log file not found — mod discovery disabled')

  const discovered = new Set<string>()
  const stopTail = logPath
    ? tailLog(logPath, lines => {
        for (const id of extractWorkshopIds(lines)) {
          if (!discovered.has(id)) {
            discovered.add(id)
            console.log('[game] workshop ID from log:', id)
          }
        }
      })
    : null

  // Poll until process exits
  while (await isGameRunning()) {
    await new Promise(r => setTimeout(r, 5000))
  }

  stopTail?.()
  safeSend(sender, 'game:status', 'stopped' satisfies GameStatus)
  console.log('[game] process exited, discovered IDs:', discovered.size)

  if (discovered.size > 0) {
    const ids = [...discovered]
    safeSend(sender, 'log:mods-found', { realmId, workshopIds: ids })
    onModsFound(realmId, ids)
  } else {
    console.warn('[game] no workshop IDs found in log — backend not updated')
  }
}
