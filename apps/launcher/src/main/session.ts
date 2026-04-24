import { safeStorage } from 'electron'
import Store from 'electron-store'
import { PROD_BACKEND_URL } from '@drift/shared'

// Per-backend session. `token` is encrypted at rest via electron's safeStorage;
// playerName / motd are plaintext so they can be restored even when encryption
// is unavailable (in which case `token` comes back empty and the user must
// re-authenticate).
interface StoredSessionEntry {
  tokenEncrypted: string
  playerName: string
  motd: string
}

interface StoreSchema {
  // backendUrl → entry
  sessions?: Record<string, StoredSessionEntry>
  // Legacy single-session fields (pre-multi-backend). Migrated on first load.
  loTokenEncrypted?: string
  loPlayerName?: string
  loMotd?: string
}

const store = new Store<StoreSchema>({ name: 'drift-session' })

export interface StoredSession {
  token: string
  playerName: string
  motd: string
}

// One-shot migration: move pre-multi-backend fields into sessions[PROD]. Runs
// on module load so subsequent reads go through the new shape.
;(function migrate(): void {
  const legacyToken = store.get('loTokenEncrypted')
  const legacyName = store.get('loPlayerName')
  if (!legacyToken || !legacyName) return
  const existing = store.get('sessions') ?? {}
  if (!existing[PROD_BACKEND_URL]) {
    existing[PROD_BACKEND_URL] = {
      tokenEncrypted: legacyToken,
      playerName: legacyName,
      motd: store.get('loMotd') ?? '',
    }
    store.set('sessions', existing)
  }
  store.delete('loTokenEncrypted')
  store.delete('loPlayerName')
  store.delete('loMotd')
})()

export function saveSession(backend: string, token: string, playerName: string, motd: string): void {
  if (!safeStorage.isEncryptionAvailable()) return
  const sessions = store.get('sessions') ?? {}
  sessions[backend] = {
    tokenEncrypted: safeStorage.encryptString(token).toString('base64'),
    playerName,
    motd,
  }
  store.set('sessions', sessions)
}

export function loadSession(backend: string): StoredSession | null {
  const sessions = store.get('sessions') ?? {}
  const entry = sessions[backend]
  if (!entry || !safeStorage.isEncryptionAvailable()) return null
  try {
    const token = safeStorage.decryptString(Buffer.from(entry.tokenEncrypted, 'base64'))
    return { token, playerName: entry.playerName, motd: entry.motd }
  } catch {
    delete sessions[backend]
    store.set('sessions', sessions)
    return null
  }
}

export function loadAllSessions(): Record<string, StoredSession> {
  const sessions = store.get('sessions') ?? {}
  const out: Record<string, StoredSession> = {}
  for (const backend of Object.keys(sessions)) {
    const s = loadSession(backend)
    if (s) out[backend] = s
  }
  return out
}

// clearSession(backend) drops only that backend's entry. clearSession() with no
// argument wipes everything — used on full sign-out.
export function clearSession(backend?: string): void {
  if (!backend) {
    store.clear()
    return
  }
  const sessions = store.get('sessions') ?? {}
  delete sessions[backend]
  store.set('sessions', sessions)
}
