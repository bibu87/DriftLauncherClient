import { create } from 'zustand'
import type { Realm, LauncherSettings, LauncherPrefs, DownloadProgress } from '@drift/shared'
import { PROD_BACKEND_URL } from '@drift/shared'

export type GameStatus = 'idle' | 'launching' | 'running' | 'stopped'

export type PlayPhase =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'downloading'; pct: number; workshopId: string }
  | { phase: 'activating' }
  | { phase: 'launching' }

interface LauncherStore {
  favorites: number[]
  recent: number[]
  quickPlayServer: Realm | null
  savedServerId: number | null
  settings: LauncherSettings
  prefsLoaded: boolean
  gameStatus: GameStatus
  playState: PlayPhase

  setQuickPlayServer: (realm: Realm | null) => void
  addFavorite: (id: number) => void
  removeFavorite: (id: number) => void
  isFavorite: (id: number) => boolean
  addRecent: (id: number) => void
  setSettings: (patch: Partial<LauncherSettings>) => void
  hydrate: (prefs: LauncherPrefs) => void
  setGameStatus: (status: GameStatus) => void
  play: (server: Realm) => Promise<void>
}

const defaultSettings: LauncherSettings = {
  launchArgs: '',
  eacEnabled: true,
  theme: 'dark',
  language: 'en',
  launchOnStartup: false,
  gameChannel: 'default',
  defaultRealmTab: 'realms',
  backendUrls: [PROD_BACKEND_URL],
}

export const useLauncherStore = create<LauncherStore>((set, get) => ({
  favorites: [],
  recent: [],
  quickPlayServer: null,
  savedServerId: null,
  settings: defaultSettings,
  prefsLoaded: false,
  gameStatus: 'idle',
  playState: { phase: 'idle' },

  setQuickPlayServer: (realm) => {
    set({ quickPlayServer: realm })
    window.api.prefs.save({ selectedServerId: realm?.id ?? null }).catch(() => {})
  },

  addFavorite: (id) => {
    set(s => {
      const favorites = s.favorites.includes(id) ? s.favorites : [...s.favorites, id]
      window.api.prefs.save({ favorites }).catch(() => {})
      return { favorites }
    })
  },
  removeFavorite: (id) => {
    set(s => {
      const favorites = s.favorites.filter(f => f !== id)
      window.api.prefs.save({ favorites }).catch(() => {})
      return { favorites }
    })
  },
  isFavorite: (id) => get().favorites.includes(id),

  addRecent: (id) => {
    set(s => {
      const recent = [id, ...s.recent.filter(r => r !== id)].slice(0, 20)
      window.api.prefs.save({ recent }).catch(() => {})
      return { recent }
    })
  },

  setSettings: (patch) => set(s => ({ settings: { ...s.settings, ...patch } })),

  hydrate: (prefs) => set({
    favorites: prefs.favorites,
    recent: prefs.recent,
    settings: { ...defaultSettings, ...prefs.settings },
    prefsLoaded: true,
    savedServerId: prefs.selectedServerId ?? null,
  }),

  setGameStatus: (gameStatus) => set({ gameStatus }),

  play: async (server) => {
    // Official servers never use mods — always deactivate everything for them
    const mods = server.isOfficial ? [] : (server.mods ?? [])
    try {
      if (mods.length > 0) {
        set({ playState: { phase: 'checking' } })
        const statuses = await window.api.mods.check(mods)
        const missing = statuses.filter(s => !s.installed).map(s => s.workshopId)

        if (missing.length > 0) {
          set({ playState: { phase: 'downloading', pct: 0, workshopId: missing[0] } })
          const offProgress = window.api.mods.onProgress((p: DownloadProgress) => {
            set({ playState: { phase: 'downloading', pct: p.pct, workshopId: p.workshopId } })
          })
          await window.api.mods.download(missing)
          offProgress()
        }
      }

      // Always activate — passing an empty array deactivates all mods (vanilla servers)
      set({ playState: { phase: 'activating' } })
      await window.api.mods.activate({ targetIds: mods })

      set({ playState: { phase: 'launching' } })
      get().addRecent(server.id)
      await window.api.game.launch(server.id, server.backend)
      set({ playState: { phase: 'idle' } })
    } catch (err) {
      console.error('[play]', err)
      set({ playState: { phase: 'idle' } })
    }
  },
}))
