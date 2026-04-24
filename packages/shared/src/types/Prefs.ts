export const PROD_BACKEND_URL = 'https://backend-production.last-oasis.com'

export interface LauncherSettings {
  launchArgs: string
  eacEnabled: boolean
  theme: 'light' | 'dark' | 'bronze'
  language: string
  launchOnStartup: boolean
  gameChannel: string
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
}
