import { shell } from 'electron'
import { exec, spawn } from 'child_process'
import { existsSync, openSync, readSync, statSync, closeSync } from 'fs'
import { join } from 'path'
import type { WebContents } from 'electron'
import { findGameDir, findSteamRoot } from './mods'
import { PROD_BACKEND_URL } from '../shared'

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

// EAC EOS protection is initialized inside the game process via SDK calls,
// not by an external bootstrap. But the shipping exe started in isolation
// can't get the Steam/Epic auth ticket EAC needs — Last Oasis ships its own
// front-end launcher (`OasisLauncher.exe`) that handles environment setup
// before spawning the game. That's the EAC-friendly entry point.
function findGameLauncher(gameDir: string): string | null {
  // OasisLauncher.exe (≈4 MB, install root) is the official front-end launcher.
  // MistClient.exe (≈500 KB) is a thinner wrapper; treat as fallback.
  const candidates = [
    join(gameDir, 'OasisLauncher.exe'),
    join(gameDir, 'MistClient.exe'),
  ]
  return candidates.find(existsSync) ?? null
}

function findShippingExe(gameDir: string): string | null {
  // Direct shipping exe — bypasses the front-end launcher and EAC's
  // ticket-handoff. Used only when EAC is explicitly disabled.
  const candidates = [
    join(gameDir, 'Mist', 'Binaries', 'Win64', 'MistClient-Win64-Shipping.exe'),
    join(gameDir, 'Binaries', 'Win64', 'MistClient-Win64-Shipping.exe'),
    join(gameDir, 'MistClient-Win64-Shipping.exe'),
  ]
  return candidates.find(existsSync) ?? null
}

export interface LaunchOptions {
  backend?: string
  eacEnabled?: boolean
  // Free-form args from Settings → Launch arguments. Whitespace-separated;
  // forwarded after the backend override and any EAC-required args.
  launchArgs?: string
  // When set, the game opens directly into this realm via -LoginRealmID=<id>.
  // The arg is silently dropped on the steam:// fallback, which can't forward
  // launch args.
  realmId?: number
}

export function launchGame(opts: LaunchOptions = {}): Promise<void> {
  const { backend, eacEnabled = true, launchArgs = '', realmId } = opts
  const extraArgs: string[] = []
  const override = backendOverrideArg(backend)
  if (override) extraArgs.push(override)
  if (realmId !== undefined && realmId > 0) {
    extraArgs.push(`-LoginRealmID=${realmId}`)
  }
  // Free-form user args (eg. "-dx11 -log"). Empty / whitespace-only is a no-op.
  for (const tok of launchArgs.split(/\s+/)) {
    if (tok) extraArgs.push(tok)
  }

  // SteamAPI_Init() registers the launcher with the Steam client as app 903950.
  // Steam then considers this Electron process to BE the running game, and any
  // steam:// URL or -applaunch command is silently no-op'd.
  // Spawning the game exe directly bypasses that check entirely — the game
  // process connects to the already-running Steam client on its own.
  //
  // Two paths from here:
  //   - EAC on  → run the EAC EOS bootstrap; it spawns the game with the
  //     anti-cheat ring active. Required by official servers.
  //   - EAC off → run the shipping exe directly. Useful for offline / modded
  //     testing only; official servers will reject the connection.
  const gameDir = findGameDir()
  const launcher = gameDir && eacEnabled ? findGameLauncher(gameDir) : null
  const shipping = gameDir ? findShippingExe(gameDir) : null
  const exePath = launcher ?? shipping
  if (exePath && gameDir) {
    // OasisLauncher.exe needs cwd at the install root so it finds its sibling
    // configs and the Mist/ subtree. The shipping exe is happy in its own dir.
    const cwd = launcher ? gameDir : join(exePath, '..')
    console.log(`[game] launching ${launcher ? 'via game launcher' : 'shipping exe directly (EAC off)'}:`, exePath, extraArgs, `cwd=${cwd}`)
    return new Promise<void>((resolve, reject) => {
      const child = spawn(exePath, extraArgs, {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd,
      })
      // Log any stderr/stdout the bootstrap emits before exiting; helpful
      // when EAC silently fails (missing service, bad config, etc.).
      child.stdout?.on('data', d => console.log(`[game stdout] ${d.toString().trim()}`))
      child.stderr?.on('data', d => console.warn(`[game stderr] ${d.toString().trim()}`))
      child.once('error', reject)
      child.once('exit', code => { if (code !== 0 && code !== null) console.warn(`[game] launch exit code ${code}`) })
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
  // arbitrary launch args, so community-backend overrides and the
  // -LoginRealmID hint silently won't apply here. We still try, so the
  // game at least starts.
  if (override || (realmId !== undefined && realmId > 0)) {
    console.warn('[game] steam:// fallback cannot forward launch args; backend/realm hints will be ignored')
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

// LogModLoader writes three different kinds of mod ID to the log, all in the
// same `Mod <id>` shape: the realm's required mods, the client's own mods left
// active from the previous session, and the realm's *ban* list. Scraping every
// number off any line mentioning "mod" conflated all three, so a realm needing
// one mod got reported with every mod the player happened to have installed —
// including the ones the realm explicitly rejected.
//
// Match only phrases that positively identify a mod as the realm's. Lines we
// don't recognise contribute nothing rather than being guessed at.
const REQUIRED_MOD_PATTERNS = [
  // Server asked for a mod the client doesn't have loaded yet.
  /LogModLoader: Error: Missing mod (\d+)/i,
  // Emitted during "Installing Mods", which walks the server's list.
  /LogModLoader: Mod (\d+) already downloaded/i,
  /LogModLoader: Mod (\d+) is ready/i,
  // Only mods that survived the not-allowed pass get version-checked and armed.
  /LogModLoader: Checking if mod (\d+) is up-to-date/i,
  /LogModLoader: Mod (\d+) is up-to-date/i,
  /LogModLoader: Mod (\d+) will be autoloaded on next startup/i,
]

// Lines naming a mod the realm did not ask for. Checked first, per line, so a
// mod that is both locally active and realm-required still registers via its
// required lines.
const EXCLUDED_MOD_PATTERNS = [
  // "Looking for mods that were active in the previous session..." — client-side.
  /LogModLoader: Found active mod (\d+)/i,
  // The realm's ban list.
  /LogModLoader: Warning: Disabling not allowed Mod (\d+)/i,
  /LogModLoader: Mod (\d+) will not be autoloaded on next startup/i,
]

function extractWorkshopIds(lines: string[]): string[] {
  const ids = new Set<string>()
  for (const line of lines) {
    if (EXCLUDED_MOD_PATTERNS.some(re => re.test(line))) continue
    for (const re of REQUIRED_MOD_PATTERNS) {
      const m = line.match(re)
      if (m) {
        ids.add(m[1])
        break
      }
    }
  }
  return [...ids]
}

// UE4 writes `Log file open, MM/DD/YY HH:MM:SS` as the first line of every
// fresh log file. Returns the parsed unix-ms timestamp, or null if the line
// isn't a session-start marker. Allows a leading BOM (﻿) since UE4
// writes the log as UTF-8 with BOM.
function parseSessionStart(line: string): number | null {
  const m = line.match(/^﻿?Log file open, (\d{2})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const [, MM, DD, YY, hh, mm, ss] = m
  return new Date(2000 + Number(YY), Number(MM) - 1, Number(DD), Number(hh), Number(mm), Number(ss)).getTime()
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

  const gameDetectedAt = Date.now()
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
  // Session boundaries — used to gate mod collection so workshop IDs from a
  // post-migration realm don't get attributed to the realm we launched into.
  //
  //   pre-welcome     → collect (server may push a mod list during the join handshake)
  //   primary session → collect
  //   primary closed  → STOP (any subsequent session may be a different realm)
  let primaryWelcomed = false
  let primaryClosed = false
  let lastRemoteAddr: string | null = null

  // Until the log file has been rotated for this game launch (UE4 renames the
  // previous session's Mist.log on startup), we may be reading stale content
  // from the previous session. Wait for a "Log file open, …" marker whose
  // timestamp is at or after when we detected the game process.
  let freshSessionSeen = false
  // Allow some slack: the log can be opened a couple of seconds before our
  // 3-second polling loop catches the process.
  const FRESH_SLACK_MS = 30_000

  const stopTail = logPath
    ? tailLog(logPath, lines => {
        if (!freshSessionSeen) {
          for (const line of lines) {
            const ts = parseSessionStart(line)
            if (ts !== null && ts >= gameDetectedAt - FRESH_SLACK_MS) {
              freshSessionSeen = true
              // Discard any state accumulated from the prior session's log.
              primaryWelcomed = false
              primaryClosed = false
              lastRemoteAddr = null
              discovered.clear()
              console.log(`[game] fresh session marker found in log (${new Date(ts).toISOString()})`)
              break
            }
          }
          if (!freshSessionSeen) return
        }

        for (const line of lines) {
          // Track the most recent connect target so we can pair it with the
          // following Welcomed-by-server line.
          const sij = line.match(/SendInitialJoin: Sending hello[^\n]*RemoteAddr: ([\d.]+:\d+)/)
          if (sij) lastRemoteAddr = sij[1]

          const welcome = line.match(/Welcomed by server \(Level: (\S+?),/)
          if (welcome && !primaryWelcomed) {
            primaryWelcomed = true
            const levelPath = welcome[1]
            console.log(`[game] joined tile: ${levelPath} via ${lastRemoteAddr ?? '?'}`)
            safeSend(sender, 'game:joined-tile', { realmId, levelPath, remoteAddr: lastRemoteAddr })
          }

          if (primaryWelcomed && !primaryClosed && /UNetConnection::Close/.test(line)) {
            primaryClosed = true
            console.log('[game] primary session ended; mod discovery paused (further joins may be a different realm)')
          }
        }

        if (primaryClosed) return
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
