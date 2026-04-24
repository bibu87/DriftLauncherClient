import { create } from 'zustand'
import type { SteamSession, LOSession } from '@drift/shared'

// Per-backend LO sessions. `primaryBackend` names the "identity source" —
// usually the prod URL — whose playerName / motd populate the header. `lo` is
// a convenience mirror of `sessions[primaryBackend]`, kept in sync on every
// write so existing consumers (AppLayout, ServerBrowser) don't need to know
// about the per-backend map.
interface AuthStore {
  steam: SteamSession | null
  sessions: Record<string, LOSession>
  primaryBackend: string | null
  lo: LOSession | null
  avatarUrl: string | null
  setSteam: (s: SteamSession) => void
  setSession: (backend: string, session: LOSession) => void
  removeSession: (backend: string) => void
  setPrimaryBackend: (backend: string | null) => void
  setAvatarUrl: (url: string | null) => void
  clearAll: () => void
}

function derivePrimary(
  sessions: Record<string, LOSession>,
  primaryBackend: string | null,
): LOSession | null {
  return primaryBackend ? sessions[primaryBackend] ?? null : null
}

export const useAuthStore = create<AuthStore>((set) => ({
  steam: null,
  sessions: {},
  primaryBackend: null,
  lo: null,
  avatarUrl: null,
  setSteam: (steam) => set({ steam }),
  setSession: (backend, session) =>
    set((s) => {
      const sessions = { ...s.sessions, [backend]: session }
      return { sessions, lo: derivePrimary(sessions, s.primaryBackend) }
    }),
  removeSession: (backend) =>
    set((s) => {
      const sessions = { ...s.sessions }
      delete sessions[backend]
      return { sessions, lo: derivePrimary(sessions, s.primaryBackend) }
    }),
  setPrimaryBackend: (primaryBackend) =>
    set((s) => ({ primaryBackend, lo: derivePrimary(s.sessions, primaryBackend) })),
  setAvatarUrl: (avatarUrl) => set({ avatarUrl }),
  clearAll: () => set({ steam: null, sessions: {}, primaryBackend: null, lo: null, avatarUrl: null })
}))
