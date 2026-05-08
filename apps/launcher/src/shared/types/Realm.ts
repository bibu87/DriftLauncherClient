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
  // Origin LO backend URL — realmId alone is not unique across LO backends.
  backend: string
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

export interface RealmMapWalker {
  // Per-instance off-map id (changes between sessions).
  id: number
  // Stable walker entity id used by the in-game walker preferences API.
  walkerId: number
  // UE4 class path, e.g. "/Game/Walkers/Balang/...". Used to pick the species icon.
  classPath: string
  name: string
  characterOwnerId: number
  characterOwnerName: string
  sharedWithClan: boolean
  waterCostMultiplier: number
  waterUnits: number
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
  // Walkers stationed on this tile, flattened across all directions.
  walkers: RealmMapWalker[]
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

// One entry from /Api/Migration/GetWalkerPreferences. The launcher uses these
// purely as an "is this walker favorited?" indicator on the map view —
// presence in the list = favorited (matched by walkerId against tile walkers).
export interface WalkerPreference {
  walkerId: number
  realmTileId: number
  classPath: string
  name: string
  isPersonal: boolean
  isPacked: boolean
}

export interface WalkerPreferences {
  walkers: WalkerPreference[]
  hasClan: boolean
  canManageClanPreferences: boolean
}
