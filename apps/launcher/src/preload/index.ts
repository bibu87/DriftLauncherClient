import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Realm, RealmMap, RealmSearchFilters, RealmModRecord, ModStatus, DownloadProgress, LauncherPrefs } from '@drift/shared'

export type { LauncherPrefs }

export type LOLoginResult =
  | { ok: true; banned: false; token: string; playerName: string; motd: string }
  | { ok: false; banned: true; banMessage: string; banEndDate: number }

export interface StoredSession {
  token: string
  playerName: string
  motd: string
}

export interface RealmSearchFailure {
  backend: string
  code: 'NO_SESSION' | 'SESSION_EXPIRED' | 'ERROR'
  message?: string
}

export interface RealmSearchResult {
  realms: Realm[]
  failures: RealmSearchFailure[]
}

const api = {
  steam: {
    getTicket: (): Promise<{ ticket: string; steamId: string; name: string }> =>
      ipcRenderer.invoke('steam:get-ticket'),
    getAvatarUrl: (): Promise<string | null> =>
      ipcRenderer.invoke('steam:avatar-url'),
  },
  workshop: {
    getPreviewUrls: (workshopIds: string[]): Promise<Record<string, string>> =>
      ipcRenderer.invoke('workshop:preview-urls', workshopIds),
  },
  lo: {
    login: (backend: string, payload: {
      ticket: string
      steamId: string
      name: string
    }): Promise<LOLoginResult> => ipcRenderer.invoke('lo:login', backend, payload)
  },
  session: {
    load: (): Promise<Record<string, StoredSession>> => ipcRenderer.invoke('session:load'),
    clear: (backend?: string): Promise<void> => ipcRenderer.invoke('session:clear', backend)
  },
  dev: {
    mockLogin: (): Promise<LOLoginResult> => ipcRenderer.invoke('dev:mock-login')
  },
  realms: {
    search: (filters: RealmSearchFilters): Promise<RealmSearchResult> =>
      ipcRenderer.invoke('realms:search', filters),
    getMap: (realmId: number, characterId: number, backend: string): Promise<RealmMap> =>
      ipcRenderer.invoke('realms:get-map', realmId, characterId, backend),
  },
  drift: {
    getAllRealmMods: (): Promise<RealmModRecord[]> =>
      ipcRenderer.invoke('drift:all-realm-mods'),
    getRealmMods: (realmId: number): Promise<RealmModRecord | null> =>
      ipcRenderer.invoke('drift:realm-mods', realmId),
    reportRealmMods: (realmId: number, workshopIds: string[], reportedBy: string): Promise<void> =>
      ipcRenderer.invoke('drift:report-realm-mods', realmId, workshopIds, reportedBy),
  },
  prefs: {
    load: (): Promise<LauncherPrefs> => ipcRenderer.invoke('prefs:load'),
    save: (patch: Partial<LauncherPrefs>): Promise<void> => ipcRenderer.invoke('prefs:save', patch),
  },
  cache: {
    clear: (): Promise<{ previewCleared: number; realmModsCleared: number }> =>
      ipcRenderer.invoke('cache:clear'),
  },
  mods: {
    getWorkshopDir: (): Promise<string | null> =>
      ipcRenderer.invoke('mods:workshop-dir'),
    check: (workshopIds: string[]): Promise<ModStatus[]> =>
      ipcRenderer.invoke('mods:check', workshopIds),
    download: (workshopIds: string[]): Promise<void> =>
      ipcRenderer.invoke('mods:download', workshopIds),
    activate: (payload: { targetIds: string[] }): Promise<void> =>
      ipcRenderer.invoke('mods:activate', payload),
    listInstalled: (): Promise<ModStatus[]> =>
      ipcRenderer.invoke('mods:list-installed'),
    listAll: (): Promise<ModStatus[]> =>
      ipcRenderer.invoke('mods:list-all'),
    remove: (workshopId: string): Promise<void> =>
      ipcRenderer.invoke('mods:remove', workshopId),
    subscribe: (workshopId: string): Promise<void> =>
      ipcRenderer.invoke('mods:subscribe', workshopId),
    unsubscribe: (workshopId: string): Promise<void> =>
      ipcRenderer.invoke('mods:unsubscribe', workshopId),
    toggle: (workshopId: string, active: boolean): Promise<void> =>
      ipcRenderer.invoke('mods:toggle', workshopId, active),
    onProgress: (cb: (progress: DownloadProgress) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: DownloadProgress): void => cb(data)
      ipcRenderer.on('mods:progress', handler)
      return () => ipcRenderer.removeListener('mods:progress', handler)
    }
  },
  game: {
    launch: (realmId: number, backend: string): Promise<void> => ipcRenderer.invoke('game:launch', realmId, backend),
    onStatus: (cb: (status: string) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, status: string): void => cb(status)
      ipcRenderer.on('game:status', handler)
      return () => ipcRenderer.removeListener('game:status', handler)
    }
  },
  window: {
    minimize: (): void => { ipcRenderer.send('window:minimize') },
    toggleMaximize: (): void => { ipcRenderer.send('window:maximize-toggle') },
    close: (): void => { ipcRenderer.send('window:close') },
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (cb: (maximized: boolean) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, v: boolean): void => cb(v)
      ipcRenderer.on('window:maximized-change', handler)
      return () => ipcRenderer.removeListener('window:maximized-change', handler)
    },
  },
  log: {
    onModsFound: (
      cb: (data: { realmId: number; workshopIds: string[] }) => void
    ): (() => void) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        data: { realmId: number; workshopIds: string[] }
      ): void => cb(data)
      ipcRenderer.on('log:mods-found', handler)
      return () => ipcRenderer.removeListener('log:mods-found', handler)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (non-isolated context — dev only)
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
