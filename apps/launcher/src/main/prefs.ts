import Store from 'electron-store'
import type { LauncherPrefs } from '../shared'
import { PINNED_BACKEND_URLS, isPinnedBackend } from '../shared'

const defaults: LauncherPrefs = {
  favorites: [],
  recent: [],
  selectedServerId: null,
  readNewsIds: [],
  settings: {
    launchArgs: '',
    eacEnabled: true,
    theme: 'dark',
    launchOnStartup: false,
    defaultRealmTab: 'realms',
    backendUrls: [...PINNED_BACKEND_URLS],
  },
}

const store = new Store<LauncherPrefs>({ defaults })

export function loadPrefs(): LauncherPrefs {
  const prefs = store.store as LauncherPrefs
  // Force the pinned backends to the front, in order, and drop any duplicates
  // among the user-added tail. This both migrates stores that pre-date the
  // backendUrls setting and rolls new pinned backends out to existing installs
  // — the Settings UI refuses to remove them, so restoring one here can only
  // undo an edit made outside the launcher.
  const urls = prefs.settings.backendUrls ?? []
  const normalized = [...PINNED_BACKEND_URLS, ...urls.filter(u => !isPinnedBackend(u))]
  if (urls.length !== normalized.length || urls.some((u, i) => u !== normalized[i])) {
    prefs.settings = { ...prefs.settings, backendUrls: normalized }
    store.set('settings', prefs.settings)
  }
  return prefs
}

export function savePrefs(patch: Partial<LauncherPrefs>): void {
  for (const [k, v] of Object.entries(patch)) {
    store.set(k as keyof LauncherPrefs, v)
  }
}

export function getBackendUrls(): string[] {
  return loadPrefs().settings.backendUrls
}
