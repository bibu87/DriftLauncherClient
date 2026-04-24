import Store from 'electron-store'
import type { LauncherPrefs } from '@drift/shared'
import { PROD_BACKEND_URL } from '@drift/shared'

const defaults: LauncherPrefs = {
  favorites: [],
  recent: [],
  selectedServerId: null,
  settings: {
    launchArgs: '',
    eacEnabled: true,
    theme: 'dark',
    launchOnStartup: false,
    defaultRealmTab: 'realms',
    backendUrls: [PROD_BACKEND_URL],
  },
}

const store = new Store<LauncherPrefs>({ defaults })

export function loadPrefs(): LauncherPrefs {
  const prefs = store.store as LauncherPrefs
  // Migrate older stores that pre-date the backendUrls setting, and self-heal
  // if the prod URL has been dropped (we enforce it as index 0 elsewhere but
  // guard here too so no caller ever sees an empty list).
  const urls = prefs.settings.backendUrls ?? []
  const normalized = [PROD_BACKEND_URL, ...urls.filter(u => u !== PROD_BACKEND_URL)]
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
