export interface Realm {
  id: number
  name: string
  isOfficial: boolean
  regionKey: string
  platform: 'PC' | 'XBOX' | 'CROSS' | 'NONE'
  isOnline: boolean
  message: string
  characterId: number
  size: number
  clanCap: number
  startDate: number
  endDate: number
  players: number
  maxPlayers: number
  hasPassword: boolean
  hasAllowlist: boolean
  description: string
  // Origin backend URL (e.g. "https://backend-production.last-oasis.com").
  // Set at search time; realm-scoped calls (GetMap, etc.) must target this backend.
  backend: string
  // Overlaid from Drift backend
  mods?: string[]
  isModded?: boolean
}

export interface RealmModRecord {
  realmId: number
  workshopIds: string[]
  reportedAt: string
  reportedBy: string
}

export interface RealmSearchFilters {
  name?: string
  provider?: 'ANY_PROVIDER' | 'OFFICIAL' | 'PRIVATE'
  regionKeys?: string[]
  platforms?: string[]
  status?: 'ANY_STATUS' | 'OFFLINE' | 'ONLINE'
  restrictedAccess?: string
  character?: string
}

export interface RealmMapTile {
  id: number
  x: number
  y: number
  name: string
  isOnline: boolean
  isSpawnable: boolean
  type: string
  difficulty: string
  pvpMode: string
  regionId: number
  mapId: number
  usedSlots: number
  maxSlots: number
  clanCap: number
  playerDeaths24h: number
  playerDeathsHour: number
  claimability: string
  claimClanId: number
  claimCharacterId: number
  // Unix seconds, 0 if not set. activationDate = when tile spawns (is active).
  // decayDate = when tile will burn / despawn.
  activationDate: number
  decayDate: number
}

export interface RealmMap {
  id: number
  name: string
  minX: number
  maxX: number
  minY: number
  maxY: number
  characterId: number
  characterX: number
  characterY: number
  tiles: RealmMapTile[]
  regionLookup: Record<string, { name: string; key: string }>
  clanLookup: Record<string, { name: string; colorId: string }>
  mapLookup: Record<string, { path: string }>
}
