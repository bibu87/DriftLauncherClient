export const PROD_BACKEND_URL = 'https://backend-production.last-oasis.com'
export const REALMDRIFT_BACKEND_URL = 'https://realmdrift.com'

// Backends shipped with the launcher. They lead the backend list in this
// order, can't be removed in Settings, and are re-added on load if a store
// is missing one — so adding an entry here rolls out to existing installs.
// Prod is additionally the primary (identity / MOTD source).
export const PINNED_BACKEND_URLS = [PROD_BACKEND_URL, REALMDRIFT_BACKEND_URL]

export function isPinnedBackend(url: string): boolean {
  return PINNED_BACKEND_URLS.includes(url)
}

export interface LauncherSettings {
  launchArgs: string
  eacEnabled: boolean
  theme: 'light' | 'dark' | 'bronze'
  launchOnStartup: boolean
  defaultRealmTab: 'realms' | 'favorites' | 'recent'
  // List of LO backend URLs to fan-out queries across. PINNED_BACKEND_URLS
  // always lead the list, in order, followed by user-added community URLs.
  backendUrls: string[]
}

export interface LauncherPrefs {
  favorites: number[]
  recent: number[]
  selectedServerId: number | null
  settings: LauncherSettings
  // gid (Steam news item id) of news the user has marked as read.
  readNewsIds: string[]
}

// One announcement from Steam's GetNewsForApp endpoint, normalised for the UI.
export interface NewsItem {
  gid: string
  title: string
  url: string
  author: string
  // Unix seconds.
  date: number
  // e.g. "Community Announcements", "Steam Blog".
  feedlabel: string
  // Plain-text snippet derived from `contents` with HTML/BBCode stripped.
  snippet: string
}
