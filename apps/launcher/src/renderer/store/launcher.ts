import { create } from 'zustand'
import type { Realm, LauncherSettings, LauncherPrefs, DownloadProgress, NewsItem } from '../../shared'
import { PROD_BACKEND_URL } from '../../shared'

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
  news: NewsItem[]
  newsLoading: boolean
  readNewsIds: string[]

  setQuickPlayServer: (realm: Realm | null) => void
  addFavorite: (id: number) => void
  removeFavorite: (id: number) => void
  isFavorite: (id: number) => boolean
  addRecent: (id: number) => void
  setSettings: (patch: Partial<LauncherSettings>) => void
  hydrate: (prefs: LauncherPrefs) => void
  setGameStatus: (status: GameStatus) => void
  play: (server: Realm) => Promise<void>
  refreshNews: () => Promise<void>
  markNewsRead: (gids: string[]) => void
  markAllNewsRead: () => void
}

const defaultSettings: LauncherSettings = {
  launchArgs: '',
  eacEnabled: true,
  theme: 'dark',
  launchOnStartup: false,
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
  news: [],
  newsLoading: false,
  readNewsIds: [],

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
    readNewsIds: prefs.readNewsIds ?? [],
  }),

  refreshNews: async () => {
    if (get().newsLoading) return
    set({ newsLoading: true })
    try {
      const news = await window.api.news.fetch()
      set({ news, newsLoading: false })
    } catch {
      set({ newsLoading: false })
    }
  },

  markNewsRead: (gids) => {
    set(s => {
      const next = Array.from(new Set([...s.readNewsIds, ...gids]))
      window.api.prefs.save({ readNewsIds: next }).catch(() => {})
      return { readNewsIds: next }
    })
  },

  markAllNewsRead: () => {
    set(s => {
      const allIds = s.news.map(n => n.gid)
      const next = Array.from(new Set([...s.readNewsIds, ...allIds]))
      window.api.prefs.save({ readNewsIds: next }).catch(() => {})
      return { readNewsIds: next }
    })
  },

  setGameStatus: (gameStatus) => set({ gameStatus }),

  play: async (server) => {
    // Official servers never use mods — always deactivate everything for them
    const mods = server.isOfficial ? [] : (server.mods ?? [])
    try {
      if (mods.length > 0) {
        set({ playState: { phase: 'checking' } })
        const statuses = await window.api.mods.check(mods)
        const stale = statuses.filter(s => !s.installed || !s.upToDate).map(s => s.workshopId)

        if (stale.length > 0) {
          set({ playState: { phase: 'downloading', pct: 0, workshopId: stale[0] } })
          const offProgress = window.api.mods.onProgress((p: DownloadProgress) => {
            set({ playState: { phase: 'downloading', pct: p.pct, workshopId: p.workshopId } })
          })
          await window.api.mods.download(stale)
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
