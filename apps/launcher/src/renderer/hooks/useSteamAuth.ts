import { useState, useCallback } from 'react'
import { useAuthStore } from '../store/auth'
import { PROD_BACKEND_URL } from '@drift/shared'

export type AuthStatus = 'idle' | 'checking-session' | 'steam' | 'lo' | 'done' | 'error' | 'banned'

interface BanInfo {
  message: string
  endDate: number
}

export interface BackendWarning {
  backend: string
  message: string
}

export interface SteamAuthState {
  status: AuthStatus
  error: string | null
  banInfo: BanInfo | null
  warnings: BackendWarning[]
  authenticate: () => Promise<void>
  mockAuthenticate: () => Promise<void>
  restoreOrAuthenticate: () => Promise<boolean>
}

export function useSteamAuth(): SteamAuthState {
  const [status, setStatus] = useState<AuthStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [banInfo, setBanInfo] = useState<BanInfo | null>(null)
  const [warnings, setWarnings] = useState<BackendWarning[]>([])
  const { setSteam, setSession, setPrimaryBackend } = useAuthStore()

  // Full login flow: fetches a Steam ticket per configured backend (tickets are
  // one-shot) and logs into each. The prod URL is always the primary — if it
  // fails, auth fails. Secondary (community) backend failures become warnings
  // so the user can still use the launcher with a partial set.
  const authenticate = useCallback(async () => {
    setStatus('steam')
    setError(null)
    setWarnings([])

    try {
      // First ticket — also populates Steam identity in the store.
      const steam = await window.api.steam.getTicket()
      setSteam(steam)

      setStatus('lo')
      const prefs = await window.api.prefs.load()
      const backends = prefs.settings.backendUrls
      if (backends.length === 0) throw new Error('No backends configured')

      setPrimaryBackend(PROD_BACKEND_URL)

      const collectedWarnings: BackendWarning[] = []
      for (let i = 0; i < backends.length; i++) {
        const backend = backends[i]
        const isPrimary = backend === PROD_BACKEND_URL
        // Reuse the first ticket for the primary backend; fetch a fresh one
        // for each additional backend since tickets are single-use.
        const payload = i === 0 ? steam : await window.api.steam.getTicket()
        try {
          const result = await window.api.lo.login(backend, {
            ticket: payload.ticket,
            steamId: payload.steamId,
            name: payload.name,
          })
          if (result.banned) {
            if (isPrimary) {
              setBanInfo({ message: result.banMessage, endDate: result.banEndDate })
              setStatus('banned')
              return
            }
            collectedWarnings.push({ backend, message: 'Banned on this backend' })
            continue
          }
          setSession(backend, {
            token: result.token,
            playerName: result.playerName,
            motd: result.motd,
            encryptionToken: '',
            platform: 'PC',
          })
        } catch (err) {
          if (isPrimary) throw err
          collectedWarnings.push({
            backend,
            message: err instanceof Error ? err.message : 'Login failed',
          })
        }
      }

      setWarnings(collectedWarnings)
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
      setStatus('error')
    }
  }, [setSteam, setSession, setPrimaryBackend])

  // Restore any sessions persisted from a previous run. If the primary session
  // is present we treat the user as logged in; otherwise we fall through to a
  // fresh authenticate(). Missing secondary sessions don't force a re-login —
  // the user can reconnect individual backends from Settings later.
  const restoreOrAuthenticate = useCallback(async (): Promise<boolean> => {
    setStatus('checking-session')
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

  const mockAuthenticate = useCallback(async () => {
    setStatus('lo')
    setError(null)
    try {
      const result = await window.api.dev.mockLogin()
      if (!result.banned) {
        setPrimaryBackend(PROD_BACKEND_URL)
        setSession(PROD_BACKEND_URL, {
          token: result.token,
          playerName: result.playerName,
          motd: result.motd,
          encryptionToken: '',
          platform: 'PC',
        })
        setStatus('done')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mock login failed')
      setStatus('error')
    }
  }, [setSession, setPrimaryBackend])

  return { status, error, banInfo, warnings, authenticate, mockAuthenticate, restoreOrAuthenticate }
}
