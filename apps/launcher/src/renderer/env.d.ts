import type { LOLoginResult, StoredSession, RealmSearchResult, LauncherPrefs } from '../preload/index'
import type { Realm, RealmMap, RealmSearchFilters, RealmModRecord, ModStatus, DownloadProgress, WalkerPreferences, NewsItem } from '@drift/shared'

interface API {
  dev: {
    mockLogin(): Promise<LOLoginResult>
  }
  steam: {
    getTicket(): Promise<{ ticket: string; steamId: string; name: string }>
    getAvatarUrl(): Promise<string | null>
  }
  workshop: {
    getPreviewUrls(workshopIds: string[]): Promise<Record<string, string>>
  }
  lo: {
    login(backend: string, payload: { ticket: string; steamId: string; name: string }): Promise<LOLoginResult>
  }
  session: {
    load(): Promise<Record<string, StoredSession>>
    clear(backend?: string): Promise<void>
  }
  prefs: {
    load(): Promise<LauncherPrefs>
    save(patch: Partial<LauncherPrefs>): Promise<void>
  }
  cache: {
    clear(): Promise<{ previewCleared: number; realmModsCleared: number }>
  }
  news: {
    fetch(): Promise<NewsItem[]>
  }
  shell: {
    openExternal(url: string): Promise<void>
  }
  realms: {
    search(filters: RealmSearchFilters): Promise<RealmSearchResult>
    getMap(realmId: number, characterId: number, backend: string): Promise<RealmMap>
    getWalkerPreferences(realmId: number, characterId: number, backend: string): Promise<WalkerPreferences>
  }
  drift: {
    getAllRealmMods(): Promise<RealmModRecord[]>
    getRealmMods(realmId: number): Promise<RealmModRecord | null>
    reportRealmMods(realmId: number, workshopIds: string[], reportedBy: string): Promise<void>
  }
  mods: {
    getWorkshopDir(): Promise<string | null>
    check(workshopIds: string[]): Promise<ModStatus[]>
    download(workshopIds: string[]): Promise<void>
    activate(payload: { targetIds: string[] }): Promise<void>
    listInstalled(): Promise<ModStatus[]>
    listAll(): Promise<ModStatus[]>
    remove(workshopId: string): Promise<void>
    subscribe(workshopId: string): Promise<void>
    unsubscribe(workshopId: string): Promise<void>
    toggle(workshopId: string, active: boolean): Promise<void>
    onProgress(cb: (progress: DownloadProgress) => void): () => void
  }
  game: {
    launch(realmId: number, backend: string): Promise<void>
    onStatus(cb: (status: 'idle' | 'launching' | 'running' | 'stopped') => void): () => void
    onJoinedTile(
      cb: (data: { realmId: number; levelPath: string; remoteAddr: string | null }) => void
    ): () => void
  }
  log: {
    onModsFound(cb: (data: { realmId: number; workshopIds: string[] }) => void): () => void
  }
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    onMaximizedChange(cb: (maximized: boolean) => void): () => void
  }
}

declare global {
  interface Window {
    api: API
  }
}
