export const PROD_BACKEND_URL = 'https://backend-production.last-oasis.com'

export interface LauncherSettings {
  launchArgs: string
  eacEnabled: boolean
  theme: 'light' | 'dark' | 'bronze'
  launchOnStartup: boolean
  defaultRealmTab: 'realms' | 'favorites' | 'recent'
  // List of LO backend URLs to fan-out queries across. The prod URL is always
  // pinned at index 0 and treated as the "primary" (identity / MOTD source).
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
