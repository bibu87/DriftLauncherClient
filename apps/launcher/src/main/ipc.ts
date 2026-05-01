import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import axios from 'axios'
import { getSteamTicket, getLocalSteamId64 } from './steam'
import { saveSession, loadSession, loadAllSessions, clearSession } from './session'
import {
  encodeLoginRequest,
  decodeLoginResponse,
  encodeRealmSearchRequest,
  decodeRealmSearchResponse,
  encodeRealmGetMapRequest,
  decodeRealmGetMapResponse,
  encodeWalkerPreferencesRequest,
  decodeWalkerPreferencesResponse,
  encodeSetWalkerPreferenceRequest,
  encodeDeleteWalkerPreferenceRequest,
  postLoProtobuf,
} from './lo'
import { checkMods, downloadMods, activateMods, findWorkshopDir, listInstalledMods, listAllMods, removeMod, toggleMod, subscribeMod, unsubscribeMod } from './mods'
import { launchGame, monitorGame } from './game'
import { loadPrefs, savePrefs, getBackendUrls } from './prefs'
import { getAllRealmMods, getRealmMods, reportRealmMods, pullFromBackend, clearRealmMods } from './realm-mods'
import { fetchNews } from './news'
import type { LauncherPrefs, Realm, RealmSearchFilters } from '@drift/shared'
import { PROD_BACKEND_URL } from '@drift/shared'

export function registerIpcHandlers(): void {
  // ── Custom window controls (frame: false titlebar) ─────────────────────────

  ipcMain.on('window:minimize', e => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('window:maximize-toggle', e => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    if (w.isMaximized()) w.unmaximize(); else w.maximize()
  })
  ipcMain.on('window:close', e => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.handle('window:is-maximized', e => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false)

  // ── Phase 2: Steam auth ────────────────────────────────────────────────────

  ipcMain.handle('steam:get-ticket', () => {
    return getSteamTicket()
  })

  ipcMain.handle('steam:avatar-url', async () => {
    const steamId = getLocalSteamId64()
    if (!steamId) return null
    try {
      const res = await axios.get<string>(
        `https://steamcommunity.com/profiles/${steamId}/?xml=1`,
        { headers: { Accept: 'text/xml' }, timeout: 5000 }
      )
      const m = res.data.match(/<avatarMedium><!\[CDATA\[(.+?)\]\]><\/avatarMedium>/)
      return m ? m[1] : null
    } catch {
      return null
    }
  })

  ipcMain.handle(
    'lo:login',
    async (_event, backend: string, payload: { ticket: string; steamId: string; name: string }) => {
      const body = await encodeLoginRequest(payload)
      let resBuf: ArrayBuffer
      try {
        resBuf = await postLoProtobuf(backend, '/Api/Player/LoginWithSteam', body)
      } catch (err) {
        if (axios.isAxiosError(err)) {
          throw new Error(`LO backend error ${err.response?.status}`)
        }
        throw err
      }

      const result = await decodeLoginResponse(resBuf)

      if (result.banned) {
        return { ok: false as const, ...result }
      }

      saveSession(backend, result.token, result.playerName, result.motd)

      return { ok: true as const, ...result }
    }
  )

  ipcMain.handle('session:load', () => loadAllSessions())
  ipcMain.handle('session:clear', (_event, backend?: string) => { clearSession(backend) })

  // Dev-only mock: bypasses Steam + LO backend entirely. Writes against the
  // prod URL so the renderer sees a normal primary session. Pass `{ banned: true }`
  // to simulate a ban response (no session is saved in that case).
  if (!app.isPackaged) {
    ipcMain.handle('dev:mock-login', (_event, opts?: { banned?: boolean }) => {
      if (opts?.banned) {
        return {
          ok: false as const,
          banned: true as const,
          banMessage: 'Simulated ban (dev mock)',
          banEndDate: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
        }
      }
      const fake = { token: 'dev-mock-token', playerName: 'DevPlayer', motd: '[dev] mock auth active' }
      saveSession(PROD_BACKEND_URL, fake.token, fake.playerName, fake.motd)
      return { ok: true as const, banned: false as const, ...fake }
    })
  }

  // ── Prefs ──────────────────────────────────────────────────────────────────

  ipcMain.handle('prefs:load', () => loadPrefs())
  ipcMain.handle('prefs:save', (_event, patch: Partial<LauncherPrefs>) => { savePrefs(patch) })

  // ── Phase 3: Realm browser ─────────────────────────────────────────────────

  // Fan out realm search across all configured backends. Each backend uses its
  // own stored session token. Missing sessions and per-backend errors do not
  // fail the whole call — they come back as `failures` so the renderer can
  // show banners / prompt re-auth for that backend specifically.
  ipcMain.handle('realms:search', async (_event, filters: RealmSearchFilters) => {
    const backends = getBackendUrls()
    const body = await encodeRealmSearchRequest(filters)

    const tasks = backends.map(async (backend) => {
      const session = loadSession(backend)
      if (!session) {
        return { backend, ok: false as const, code: 'NO_SESSION' as const }
      }
      try {
        const resBuf = await postLoProtobuf(backend, '/Api/JoinRealm/Search', body, { token: session.token })
        const realms = await decodeRealmSearchResponse(resBuf, backend)
        return { backend, ok: true as const, realms }
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 403) {
          clearSession(backend)
          return { backend, ok: false as const, code: 'SESSION_EXPIRED' as const }
        }
        const message = axios.isAxiosError(err)
          ? `HTTP ${err.response?.status ?? 'NETWORK'}`
          : err instanceof Error ? err.message : String(err)
        return { backend, ok: false as const, code: 'ERROR' as const, message }
      }
    })

    const settled = await Promise.all(tasks)
    const realms: Realm[] = []
    const failures: Array<{ backend: string; code: 'NO_SESSION' | 'SESSION_EXPIRED' | 'ERROR'; message?: string }> = []
    for (const r of settled) {
      if (r.ok) realms.push(...r.realms)
      else failures.push({ backend: r.backend, code: r.code, message: 'message' in r ? r.message : undefined })
    }
    return { realms, failures }
  })

  ipcMain.handle('realms:get-map', async (_event, realmId: number, characterId: number, backend: string) => {
    if (!characterId || characterId <= 0) {
      throw new Error('NO_CHARACTER')
    }
    const session = loadSession(backend)
    if (!session) throw new Error('SESSION_EXPIRED')

    const body = await encodeRealmGetMapRequest(realmId)
    try {
      const resBuf = await postLoProtobuf(backend, '/Api/Realm/GetMap', body, { token: session.token, realmId, characterId })
      return await decodeRealmGetMapResponse(resBuf)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status
        if (status === 403) {
          clearSession(backend)
          throw new Error('SESSION_EXPIRED')
        }
        if (status === 500) {
          // Realm exists but backend can't produce a map — usually realm offline / no live state.
          throw new Error('MAP_UNAVAILABLE')
        }
        throw new Error(`LO backend error ${status}`)
      }
      throw err
    }
  })

  // Walker preferences are per-character; the launcher only uses them as a
  // "favorited?" indicator on the map view. Empty list (no clan / no prefs set)
  // is a normal response, not an error.
  ipcMain.handle('realms:get-walker-preferences', async (_event, realmId: number, characterId: number, backend: string) => {
    if (!characterId || characterId <= 0) throw new Error('NO_CHARACTER')
    const session = loadSession(backend)
    if (!session) throw new Error('SESSION_EXPIRED')

    const body = await encodeWalkerPreferencesRequest()
    try {
      const resBuf = await postLoProtobuf(backend, '/Api/Migration/GetWalkerPreferences', body, { token: session.token, realmId, characterId })
      return await decodeWalkerPreferencesResponse(resBuf)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status
        if (status === 403) {
          clearSession(backend)
          throw new Error('SESSION_EXPIRED')
        }
        throw new Error(`LO backend error ${status}`)
      }
      throw err
    }
  })

  // Toggle a walker's "preferred" flag. Both endpoints take {walkerId} only and
  // return an empty body, so the response buffer is discarded. The renderer is
  // responsible for refetching or applying an optimistic update.
  ipcMain.handle('realms:set-walker-preference', async (_event, realmId: number, characterId: number, backend: string, walkerId: number) => {
    if (!characterId || characterId <= 0) throw new Error('NO_CHARACTER')
    if (!walkerId || walkerId <= 0) throw new Error('INVALID_WALKER')
    const session = loadSession(backend)
    if (!session) throw new Error('SESSION_EXPIRED')
    const body = await encodeSetWalkerPreferenceRequest(walkerId)
    try {
      await postLoProtobuf(backend, '/Api/Migration/SetWalkerPreference', body, { token: session.token, realmId, characterId })
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status
        if (status === 403) {
          clearSession(backend)
          throw new Error('SESSION_EXPIRED')
        }
        throw new Error(`LO backend error ${status}`)
      }
      throw err
    }
  })

  ipcMain.handle('realms:delete-walker-preference', async (_event, realmId: number, characterId: number, backend: string, walkerId: number) => {
    if (!characterId || characterId <= 0) throw new Error('NO_CHARACTER')
    if (!walkerId || walkerId <= 0) throw new Error('INVALID_WALKER')
    const session = loadSession(backend)
    if (!session) throw new Error('SESSION_EXPIRED')
    const body = await encodeDeleteWalkerPreferenceRequest(walkerId)
    try {
      await postLoProtobuf(backend, '/Api/Migration/DeleteWalkerPreference', body, { token: session.token, realmId, characterId })
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status
        if (status === 403) {
          clearSession(backend)
          throw new Error('SESSION_EXPIRED')
        }
        throw new Error(`LO backend error ${status}`)
      }
      throw err
    }
  })

  // ── Drift realm-mods (local electron-store, no external backend needed) ──────

  // Pull from backend (best-effort) then return the refreshed local cache.
  // Backend failures leave the existing cache intact.
  ipcMain.handle('drift:all-realm-mods', async () => {
    await pullFromBackend()
    return getAllRealmMods()
  })

  ipcMain.handle('drift:realm-mods', (_event, backend: string, realmId: number) =>
    getRealmMods(backend, realmId)
  )

  ipcMain.handle('drift:report-realm-mods', (_event, backend: string, realmId: number, workshopIds: string[], reportedBy: string) => {
    reportRealmMods(backend, realmId, workshopIds, reportedBy)
  })

  // ── Workshop item metadata ─────────────────────────────────────────────────
  // GetPublishedFileDetails is a public Steam API endpoint — no key required.

  const previewCache = new Map<string, string>()

  ipcMain.handle('workshop:preview-urls', async (_event, workshopIds: string[]) => {
    const missing = workshopIds.filter(id => !previewCache.has(id))
    if (missing.length > 0) {
      try {
        const params = new URLSearchParams()
        params.set('itemcount', String(missing.length))
        missing.forEach((id, i) => params.set(`publishedfileids[${i}]`, id))
        const res = await axios.post(
          'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/',
          params.toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 }
        )
        const details: { publishedfileid: string; preview_url?: string }[] =
          res.data?.response?.publishedfiledetails ?? []
        for (const d of details) {
          if (d.preview_url) previewCache.set(d.publishedfileid, d.preview_url)
        }
      } catch (err) {
        console.warn('[workshop] preview fetch failed:', (err as Error).message)
      }
    }
    return Object.fromEntries(workshopIds.filter(id => previewCache.has(id)).map(id => [id, previewCache.get(id)!]))
  })

  // ── Cache management ───────────────────────────────────────────────────────
  // Clears non-essential caches only: HTTP cache, in-memory workshop preview
  // URLs, and the realm-mods store (refilled from backend on next startup).
  // Does NOT touch sessions or user prefs.
  ipcMain.handle('cache:clear', async () => {
    const previewCleared = previewCache.size
    previewCache.clear()
    const realmModsCleared = clearRealmMods()
    await session.defaultSession.clearCache()
    return { previewCleared, realmModsCleared }
  })

  // ── Phase 5: Mod manager ───────────────────────────────────────────────────

  ipcMain.handle('mods:workshop-dir', () => findWorkshopDir())

  ipcMain.handle('mods:check', (_event, workshopIds: string[]) => {
    return checkMods(workshopIds)
  })

  ipcMain.handle('mods:download', async (event, workshopIds: string[]) => {
    await downloadMods(workshopIds, (workshopId, pct) => {
      event.sender.send('mods:progress', { workshopId, pct, speed: 0 })
    })
  })

  ipcMain.handle('mods:list-installed', () => listInstalledMods())
  ipcMain.handle('mods:list-all', () => listAllMods())

  ipcMain.handle('mods:remove', (_event, workshopId: string) => {
    removeMod(workshopId)
  })

  ipcMain.handle('mods:subscribe', (_event, workshopId: string) => subscribeMod(workshopId))
  ipcMain.handle('mods:unsubscribe', (_event, workshopId: string) => unsubscribeMod(workshopId))

  ipcMain.handle('mods:toggle', (_event, workshopId: string, active: boolean) => {
    toggleMod(workshopId, active)
  })

  ipcMain.handle('mods:activate', (_event, payload: { targetIds: string[] }) => {
    const workshopDir = findWorkshopDir()
    if (!workshopDir) throw new Error('Last Oasis workshop directory not found')
    activateMods(payload.targetIds, workshopDir)
  })

  // ── Steam news ─────────────────────────────────────────────────────────────

  ipcMain.handle('news:fetch', () => fetchNews())

  // ── External links ────────────────────────────────────────────────────────
  // Restricted to http/https so a renderer compromise can't shell-exec random
  // schemes (file://, javascript:, etc.).
  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    if (typeof url !== 'string') return
    const lower = url.toLowerCase()
    if (!lower.startsWith('http://') && !lower.startsWith('https://')) return
    await shell.openExternal(url)
  })

  // ── Phase 6: Launch & log watcher ─────────────────────────────────────────

  ipcMain.handle('game:launch', async (event, realmId: number, backend: string) => {
    const { settings } = loadPrefs()
    await launchGame({
      backend,
      eacEnabled: settings.eacEnabled,
      launchArgs: settings.launchArgs,
    })
    // Fire-and-forget — monitor runs async and posts events back via sender.
    // Capture `backend` in the closure so the report carries the LO backend
    // the realm came from (realmId alone collides across backends).
    monitorGame(event.sender, realmId, (id, workshopIds) => {
      reportRealmMods(backend, id, workshopIds, 'log-watcher')
    }).catch(err => console.error('[game] monitor error:', err))
  })
}
