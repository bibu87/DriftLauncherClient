import { useState, useCallback } from 'react'
import { useAuthStore } from '../store/auth'
import { PROD_BACKEND_URL } from '../../shared'

// Dev sticky-ban: localStorage('drift:dev-force-ban') drives a mock ban.
//   'all'           → every backend returns banned
//   '<backend-url>' → only that backend returns banned (others go through real auth)
// Unset to disable. Only honoured in dev builds.
function shouldMockBan(backend: string): boolean {
  if (!import.meta.env.DEV) return false
  const flag = localStorage.getItem('drift:dev-force-ban')
  if (!flag) return false
  return flag === 'all' || flag === backend
}

function devBanFlagActive(): boolean {
  return import.meta.env.DEV && !!localStorage.getItem('drift:dev-force-ban')
}

export type AuthStatus = 'idle' | 'checking-session' | 'steam' | 'lo' | 'done' | 'error' | 'banned'

interface BanInfo {
  message: string
  endDate: number
}

export interface BackendWarning {
  backend: string
  message: string
  // Present when the warning is specifically a ban response. banEndDate of 0
  // indicates a permanent ban.
  ban?: { banMessage: string; banEndDate: number }
}

export interface SteamAuthState {
  status: AuthStatus
  error: string | null
  banInfo: BanInfo | null
  warnings: BackendWarning[]
  authenticate: () => Promise<void>
  mockAuthenticate: (opts?: { banned?: boolean }) => Promise<void>
  restoreOrAuthenticate: () => Promise<boolean>
}

export function useSteamAuth(): SteamAuthState {
  const [status, setStatus] = useState<AuthStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [banInfo, setBanInfo] = useState<BanInfo | null>(null)
  const [warnings, setWarnings] = useState<BackendWarning[]>([])
  const { setSteam, setSession, setPrimaryBackend, setBanWarnings } = useAuthStore()

  // Full login flow: fetches a Steam ticket per configured backend (tickets are
  // one-shot) and logs into each. Per-backend ban or login failure is collected
  // as a warning. The user is fully blocked (ban screen) only when no backend
  // succeeds; otherwise we proceed with whichever backends did log in and
  // surface the rest as toasts on the main screen.
  const authenticate = useCallback(async () => {
    setStatus('steam')
    setError(null)
    setWarnings([])
    setBanWarnings([])

    try {
      // First ticket — also populates Steam identity in the store.
      const steam = await window.api.steam.getTicket()
      setSteam(steam)

      setStatus('lo')
      const prefs = await window.api.prefs.load()
      const backends = prefs.settings.backendUrls
      if (backends.length === 0) throw new Error('No backends configured')

      const collectedWarnings: BackendWarning[] = []
      const successfulBackends: string[] = []

      for (let i = 0; i < backends.length; i++) {
        const backend = backends[i]
        // Reuse the first ticket for the first backend; fetch a fresh one
        // for each additional backend since tickets are single-use. Skip
        // ticket fetch entirely for backends that will be mock-banned.
        let payload = steam
        if (i > 0 && !shouldMockBan(backend)) {
          payload = await window.api.steam.getTicket()
        }
        try {
          const result = shouldMockBan(backend)
            ? await window.api.dev.mockLogin({ banned: true })
            : await window.api.lo.login(backend, {
                ticket: payload.ticket,
                steamId: payload.steamId,
                name: payload.name,
              })
          if (result.banned) {
            collectedWarnings.push({
              backend,
              message: 'Banned on this backend',
              ban: { banMessage: result.banMessage, banEndDate: result.banEndDate },
            })
            continue
          }
          setSession(backend, {
            token: result.token,
            playerName: result.playerName,
            motd: result.motd,
            encryptionToken: '',
            platform: 'PC',
          })
          successfulBackends.push(backend)
        } catch (err) {
          collectedWarnings.push({
            backend,
            message: err instanceof Error ? err.message : 'Login failed',
          })
        }
      }

      if (successfulBackends.length === 0) {
        // Every configured backend failed. If at least one was a ban, route to
        // the ban screen; otherwise surface the first error.
        const banEntries = collectedWarnings.filter(w => w.ban)
        if (banEntries.length > 0) {
          setBanInfo({
            message: banEntries[0].ban!.banMessage,
            endDate: banEntries[0].ban!.banEndDate,
          })
          setBanWarnings(collectedWarnings)
          setStatus('banned')
          return
        }
        throw new Error(collectedWarnings[0]?.message ?? 'Authentication failed')
      }

      // At least one backend logged in. Prefer prod as primary identity if it
      // succeeded; otherwise the first successful backend takes over.
      const effectivePrimary = successfulBackends.includes(PROD_BACKEND_URL)
        ? PROD_BACKEND_URL
        : successfulBackends[0]
      setPrimaryBackend(effectivePrimary)
      setBanWarnings(collectedWarnings)
      setWarnings(collectedWarnings)
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
      setStatus('error')
    }
  }, [setSteam, setSession, setPrimaryBackend, setBanWarnings])

  // Restore any sessions persisted from a previous run. If the primary session
  // is present we treat the user as logged in; otherwise we fall through to a
  // fresh authenticate(). Missing secondary sessions don't force a re-login —
  // the user can reconnect individual backends from Settings later.
  const restoreOrAuthenticate = useCallback(async (): Promise<boolean> => {
    setStatus('checking-session')
    // Dev sticky-ban: skip session restore so authenticate() (which honours
    // the same flag per-backend) runs and the ban screen / toast can show.
    if (devBanFlagActive()) {
      console.warn('[dev] drift:dev-force-ban active — bypassing session restore')
      await authenticate()
      return false
    }
    try {
      const stored = await window.api.session.load()
      const primary = stored[PROD_BACKEND_URL]
      if (primary) {
        setPrimaryBackend(PROD_BACKEND_URL)
        for (const [backend, s] of Object.entries(stored)) {
          setSession(backend, {
            token: s.token,
            playerName: s.playerName,
            motd: s.motd,
            encryptionToken: '',
            platform: 'PC',
          })
        }
        setStatus('done')
        return true
      }
    } catch {
      // session load failing is non-fatal — fall through to fresh auth
    }
    await authenticate()
    return false
  }, [authenticate, setSession, setPrimaryBackend])

  const mockAuthenticate = useCallback(async (opts?: { banned?: boolean }) => {
    setStatus('lo')
    setError(null)
    try {
      const result = await window.api.dev.mockLogin(opts)
      if (result.banned) {
        setBanInfo({ message: result.banMessage, endDate: result.banEndDate })
        setStatus('banned')
        return
      }
      setPrimaryBackend(PROD_BACKEND_URL)
      setSession(PROD_BACKEND_URL, {
        token: result.token,
        playerName: result.playerName,
        motd: result.motd,
        encryptionToken: '',
        platform: 'PC',
      })
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mock login failed')
      setStatus('error')
    }
  }, [setSession, setPrimaryBackend])

  return { status, error, banInfo, warnings, authenticate, mockAuthenticate, restoreOrAuthenticate }
}
