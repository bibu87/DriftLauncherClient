import protobuf from 'protobufjs'
import axios from 'axios'
import path from 'path'
import { app } from 'electron'
import type { Realm, RealmMap, RealmMapTile, RealmMapWalker, WalkerPreferences } from '@drift/shared'

// Log verbosity. At 'info' (default) each LO call logs a single line with
// method, endpoint, status and timing. At 'debug' the decoded request and
// response payloads are also dumped.
//   Info only:  (default)                       → `[lo-http] -> POST /path …`
//   Full proto: LOG_LEVEL=debug pnpm dev        → adds `[lo-proto] …` dumps
const LOG_LEVEL = (process.env['LOG_LEVEL'] ?? 'info').toLowerCase()
const DEBUG_PROTO = LOG_LEVEL === 'debug'

// Short tag for logs so fan-out calls to multiple backends are distinguishable.
function backendTag(backend: string): string {
  try {
    return new URL(backend).host
  } catch {
    return backend
  }
}

export interface LoAuthContext {
  token?: string        // omit for unauthenticated (login) calls
  realmId?: number      // required by in-game endpoints like /Api/Realm/GetMap
  characterId?: number
}

function buildAuthHeader(auth: LoAuthContext): string {
  const parts: string[] = [`"type" : "gameclient"`]
  if (auth.token) parts.push(`"token" : "${auth.token}"`)
  if (auth.realmId) parts.push(`"realmId" : "${auth.realmId}"`)
  if (auth.characterId) parts.push(`"characterId" : "${auth.characterId}"`)
  return `{ ${parts.join(', ')} }`
}

function fmtCtx(auth: LoAuthContext): string {
  const bits: string[] = []
  if (auth.realmId) bits.push(`realmId=${auth.realmId}`)
  if (auth.characterId) bits.push(`characterId=${auth.characterId}`)
  return bits.length ? ` [${bits.join(' ')}]` : ''
}

function logProto(label: string, value: unknown): void {
  if (!DEBUG_PROTO) return
  try {
    console.log(`[lo-proto] ${label}\n${JSON.stringify(value, null, 2)}`)
  } catch {
    console.log(`[lo-proto] ${label} <unserializable>`)
  }
}

// Deep-replace any string-valued `token` property with <redacted>. Used when
// logging decoded messages so session tokens don't end up in logs/screenshots.
function redactTokens<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(redactTokens) as unknown as T
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = k === 'token' && typeof v === 'string' ? '<redacted>' : redactTokens(v)
  }
  return out as T
}

/**
 * POST a protobuf body to an LO backend. Builds the x-auth-token header
 * from `auth` (supporting login / search / in-game variants), logs the
 * request and response to the main-process console, and returns the raw
 * response buffer on 2xx. Non-2xx responses are surfaced as axios errors
 * the caller must translate.
 *
 * `backend` is the origin (scheme+host) of the target backend, e.g.
 * "https://backend-production.last-oasis.com". Callers pick the right
 * backend per realm — see getBackendUrls() in prefs.
 */
export async function postLoProtobuf(
  backend: string,
  pathStr: string,
  body: Buffer,
  auth: LoAuthContext = {}
): Promise<ArrayBuffer> {
  const start = Date.now()
  const tag = backendTag(backend)
  console.log(`[lo-http] -> POST ${tag}${pathStr}${fmtCtx(auth)} (${body.length}B)`)
  try {
    const res = await axios.post(`${backend}${pathStr}`, body, {
      headers: { ...LO_HEADERS, 'x-auth-token': buildAuthHeader(auth) },
      responseType: 'arraybuffer',
    })
    const buf = res.data as ArrayBuffer
    console.log(`[lo-http] <- ${res.status} ${tag}${pathStr} (${Date.now() - start}ms, ${buf.byteLength}B)`)
    return buf
  } catch (err) {
    const ms = Date.now() - start
    if (axios.isAxiosError(err)) {
      const status = err.response?.status ?? 'NETWORK'
      console.log(`[lo-http] <- ${status} ${tag}${pathStr} (${ms}ms)`)
    } else {
      console.log(`[lo-http] <- ERROR ${tag}${pathStr} (${ms}ms)`, err)
    }
    throw err
  }
}

// Dev: resolves relative to the bundled main output at apps/launcher/out/main/,
// so four levels up lands at the repo root → packages/lo-protos/Protos.
// Packaged: electron-builder copies the protos into the app's resources dir
// (via extraResources in package.json), exposed as process.resourcesPath.
const PROTO_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'Protos')
  : path.join(__dirname, '../../../../packages/lo-protos/Protos')

let _root: protobuf.Root | null = null

async function getRoot(): Promise<protobuf.Root> {
  if (_root) return _root
  _root = await protobuf.load([
    path.join(PROTO_DIR, 'BackendApiPlayerLoginWithSteam.proto'),
    path.join(PROTO_DIR, 'BackendApiPlayerLoginCommon.proto'),
    path.join(PROTO_DIR, 'BackendApiCommon.proto'),
    path.join(PROTO_DIR, 'BackendApiJoinRealmSearch.proto'),
    path.join(PROTO_DIR, 'BackendApiRealmCommon.proto'),
    path.join(PROTO_DIR, 'BackendApiRealmGetMap.proto'),
    path.join(PROTO_DIR, 'BackendApiMigrationGetWalkerPreferences.proto'),
    path.join(PROTO_DIR, 'BackendApiMigrationSetWalkerPreference.proto'),
    path.join(PROTO_DIR, 'BackendApiMigrationDeleteWalkerPreference.proto'),
  ])
  return _root
}

export interface LoginRequest {
  steamId: string
  name: string
  ticket: string  // raw hex from steamworks.js
}

export interface LoginSuccess {
  banned: false
  token: string
  playerName: string
  motd: string
}

export interface LoginBanned {
  banned: true
  banMessage: string
  banEndDate: number  // unix seconds (uint64 → number)
}

export async function encodeLoginRequest(req: LoginRequest): Promise<Buffer> {
  const root = await getRoot()
  const ReqType = root.lookupType('MistProto.BackendApiPlayerLoginWithSteamRequest')
  const msg = ReqType.create({
    uniqueNetId: `STEAM:${req.steamId}`,
    steamName: req.name,
    steamSessionTicket: req.ticket.toUpperCase(),
    createNewSession: true
  })
  logProto('encode LoginWithSteamRequest', { ...msg, steamSessionTicket: '<redacted>' })
  return Buffer.from(ReqType.encode(msg).finish())
}

export async function decodeLoginResponse(buf: ArrayBuffer): Promise<LoginSuccess | LoginBanned> {
  const root = await getRoot()
  const ResType = root.lookupType('MistProto.BackendApiPlayerLoginWithSteamResponse')
  const msg = ResType.decode(new Uint8Array(buf)).toJSON() as {
    result?: {
      success?: {
        token?: string
        name?: string
        motd?: string
        banned?: boolean
        banMessage?: string
        banEndDate?: number | string
      }
    }
  }

  logProto('decode LoginWithSteamResponse', redactTokens(msg))
  const success = msg?.result?.success
  if (!success) throw new Error('Login failed — no success payload in LO response')

  if (success.banned) {
    return {
      banned: true as const,
      banMessage: success.banMessage ?? '',
      banEndDate: Number(success.banEndDate ?? 0)
    }
  }

  return {
    banned: false as const,
    token: success.token ?? '',
    playerName: success.name ?? '',
    motd: success.motd ?? ''
  }
}

export async function encodeRealmSearchRequest(filters: {
  name?: string
  status?: 'ANY_STATUS' | 'OFFLINE' | 'ONLINE'
  provider?: 'ANY_PROVIDER' | 'OFFICIAL' | 'PRIVATE'
} = {}): Promise<Buffer> {
  const root = await getRoot()
  const ReqType = root.lookupType('MistProto.BackendApiJoinRealmSearchRequest')
  const msg = ReqType.create({
    name: filters.name ?? '',
    status: filters.status ?? 'ONLINE',
    provider: filters.provider ?? 'ANY_PROVIDER',
    restrictedAccess: 'NO_RESTRICTED_ACCESS',
    character: 'ANY_CHARACTER'
  })
  logProto('encode JoinRealmSearchRequest', msg)
  return Buffer.from(ReqType.encode(msg).finish())
}

export async function decodeRealmSearchResponse(buf: ArrayBuffer, backend: string): Promise<Realm[]> {
  const root = await getRoot()
  const ResType = root.lookupType('MistProto.BackendApiJoinRealmSearchResponse')
  const msg = ResType.decode(new Uint8Array(buf)).toJSON() as {
    items?: Array<Record<string, unknown>>
  }
  logProto('decode JoinRealmSearchResponse', { count: msg.items?.length ?? 0, items: msg.items })
  return (msg.items ?? []).map(r => ({
    id: Number(r.id ?? 0),
    name: String(r.name ?? ''),
    isOfficial: Boolean(r.isOfficial),
    regionKey: String(r.regionKey ?? ''),
    platform: (r.platform as Realm['platform']) ?? 'PC',
    isOnline: Boolean(r.isOnline),
    message: String(r.message ?? ''),
    characterId: Number(r.characterId ?? 0),
    size: Number(r.size ?? 0),
    clanCap: Number(r.clanCap ?? 0),
    startDate: Number(r.startDate ?? 0),
    endDate: Number(r.endDate ?? 0),
    players: Number(r.players ?? 0),
    maxPlayers: Number(r.maxPlayers ?? 0),
    hasPassword: Boolean(r.hasPassword),
    hasAllowlist: Boolean(r.hasAllowlist),
    description: String(r.description ?? ''),
    backend,
  }))
}

export async function encodeRealmGetMapRequest(realmId: number): Promise<Buffer> {
  const root = await getRoot()
  const ReqType = root.lookupType('MistProto.BackendApiRealmGetMapRequest')
  const msg = ReqType.create({ realmId })
  logProto('encode RealmGetMapRequest', msg)
  return Buffer.from(ReqType.encode(msg).finish())
}

export async function decodeRealmGetMapResponse(buf: ArrayBuffer): Promise<RealmMap> {
  const root = await getRoot()
  const ResType = root.lookupType('MistProto.BackendApiRealmGetMapResponse')
  const msg = ResType.decode(new Uint8Array(buf)).toJSON() as {
    id?: string | number
    name?: string
    minX?: string | number
    maxX?: string | number
    minY?: string | number
    maxY?: string | number
    characterId?: string | number
    characterX?: string | number
    characterY?: string | number
    tiles?: Array<Record<string, unknown>>
    regionLookup?: Record<string, { name?: string; key?: string }>
    clanLookup?: Record<string, { name?: string; colorId?: string }>
    mapLookup?: Record<string, { path?: string }>
  }

  logProto('decode RealmGetMapResponse', {
    id: msg.id,
    name: msg.name,
    bounds: { minX: msg.minX, maxX: msg.maxX, minY: msg.minY, maxY: msg.maxY },
    tileCount: msg.tiles?.length ?? 0,
    regionCount: Object.keys(msg.regionLookup ?? {}).length,
    mapCount: Object.keys(msg.mapLookup ?? {}).length,
    clanCount: Object.keys(msg.clanLookup ?? {}).length,
  })

  // .NET DateTime.Ticks → unix seconds. Ticks are 100-ns intervals since 0001-01-01 UTC;
  // offset to 1970 is 621355968000000000 ticks. Values > 2^53 need BigInt to stay exact.
  const DOTNET_EPOCH_TICKS = 621355968000000000n
  const TICKS_PER_SECOND = 10_000_000n
  const fromDotNetTicks = (v: unknown): number => {
    if (v === undefined || v === null || v === 0 || v === '0') return 0
    try {
      const n = BigInt(String(v))
      if (n <= 0n) return 0
      return Number((n - DOTNET_EPOCH_TICKS) / TICKS_PER_SECOND)
    } catch {
      return 0
    }
  }

  type RawWalker = {
    id?: string | number
    walkerId?: string | number
    classPath?: string
    name?: string
    characterOwnerId?: string | number
    characterOwnerName?: string
    sharedWithClan?: boolean
    waterCostMultiplier?: number
    waterUnits?: number
  }
  type RawDirection = { walkers?: RawWalker[] }

  const tiles: RealmMapTile[] = (msg.tiles ?? []).map(t => {
    const claim = (t.claim as { clanOwnerId?: string | number; characterOwnerId?: string | number } | undefined) ?? {}
    const directions = ((t as Record<string, unknown>).directions as RawDirection[] | undefined) ?? []
    const walkers: RealmMapWalker[] = directions.flatMap(d => (d.walkers ?? []).map(w => ({
      id: Number(w.id ?? 0),
      walkerId: Number(w.walkerId ?? 0),
      classPath: String(w.classPath ?? ''),
      name: String(w.name ?? ''),
      characterOwnerId: Number(w.characterOwnerId ?? 0),
      characterOwnerName: String(w.characterOwnerName ?? ''),
      sharedWithClan: Boolean(w.sharedWithClan),
      waterCostMultiplier: Number(w.waterCostMultiplier ?? 0),
      waterUnits: Number(w.waterUnits ?? 0),
    })))
    return {
      id: Number(t.id ?? 0),
      x: Number(t.x ?? 0),
      y: Number(t.y ?? 0),
      name: String(t.name ?? ''),
      isOnline: Boolean(t.isOnline),
      isSpawnable: Boolean(t.isSpawnable),
      type: String(t.type ?? ''),
      difficulty: String(t.difficulty ?? ''),
      pvpMode: String(t.pvpMode ?? ''),
      regionId: Number(t.regionId ?? 0),
      mapId: Number(t.mapId ?? 0),
      usedSlots: Number(t.usedSlots ?? 0),
      maxSlots: Number(t.maxSlots ?? 0),
      clanCap: Number(t.clanCap ?? 0),
      // Proto field is `player_deaths_past_24_hours` → protobufjs camelCases to `playerDeathsPast_24Hours`.
      playerDeaths24h: Number((t as Record<string, unknown>).playerDeathsPast_24Hours ?? 0),
      playerDeathsHour: Number((t as Record<string, unknown>).playerDeathsPastHour ?? 0),
      claimability: String(t.claimability ?? ''),
      claimClanId: Number(claim.clanOwnerId ?? 0),
      claimCharacterId: Number(claim.characterOwnerId ?? 0),
      activationDate: fromDotNetTicks(t.activationDate),
      decayDate: fromDotNetTicks(t.decayDate),
      walkers,
    }
  })

  // One-shot summary of walker class_paths so we can confirm the renderer's
  // species matcher covers the actual values the backend sends. Always-on at
  // info level — payload is small (just unique strings + sample names).
  const walkerSamples = new Map<string, string>()
  for (const t of tiles) {
    for (const w of t.walkers) {
      if (!walkerSamples.has(w.classPath)) walkerSamples.set(w.classPath, w.name)
    }
  }
  if (walkerSamples.size > 0) {
    console.log(`[lo-proto] walker class_paths (${walkerSamples.size} unique):`)
    for (const [cp, name] of walkerSamples) console.log(`  ${cp}  (e.g. "${name}")`)
  }

  // protobufjs returns int64 map keys as raw 8-byte little-endian char strings
  // (not decimal), while scalar int64 values are returned as decimal strings.
  // Normalize so callers can look up by `String(tile.mapId)` etc.
  const normInt64Key = (k: string): string => {
    if (/^-?\d+$/.test(k)) return k
    let n = 0n
    for (let i = 0; i < k.length && i < 8; i++) {
      n |= BigInt(k.charCodeAt(i) & 0xff) << BigInt(i * 8)
    }
    return n.toString()
  }

  const normalizeLookup = <V>(
    src: Record<string, V> | undefined,
    pick: (v: V) => Record<string, string>,
  ): Record<string, Record<string, string>> => {
    const out: Record<string, Record<string, string>> = {}
    for (const [k, v] of Object.entries(src ?? {})) out[normInt64Key(k)] = pick(v)
    return out
  }

  return {
    id: Number(msg.id ?? 0),
    name: String(msg.name ?? ''),
    minX: Number(msg.minX ?? 0),
    maxX: Number(msg.maxX ?? 0),
    minY: Number(msg.minY ?? 0),
    maxY: Number(msg.maxY ?? 0),
    characterId: Number(msg.characterId ?? 0),
    characterX: Number(msg.characterX ?? 0),
    characterY: Number(msg.characterY ?? 0),
    tiles,
    regionLookup: normalizeLookup(msg.regionLookup, v => ({ name: String(v.name ?? ''), key: String(v.key ?? '') })) as RealmMap['regionLookup'],
    clanLookup: normalizeLookup(msg.clanLookup, v => ({ name: String(v.name ?? ''), colorId: String(v.colorId ?? '') })) as RealmMap['clanLookup'],
    mapLookup: normalizeLookup(msg.mapLookup, v => ({ path: String(v.path ?? '') })) as RealmMap['mapLookup'],
  }
}

export async function encodeWalkerPreferencesRequest(): Promise<Buffer> {
  const root = await getRoot()
  const ReqType = root.lookupType('MistProto.BackendApiMigrationGetWalkerPreferencesRequest')
  const msg = ReqType.create({})
  return Buffer.from(ReqType.encode(msg).finish())
}

export async function decodeWalkerPreferencesResponse(buf: ArrayBuffer): Promise<WalkerPreferences> {
  const root = await getRoot()
  const ResType = root.lookupType('MistProto.BackendApiMigrationGetWalkerPreferencesResponse')
  const msg = ResType.decode(new Uint8Array(buf)).toJSON() as {
    walkers?: Array<{
      isPersonal?: boolean
      classPath?: string
      realmTileId?: string | number
      walkerId?: string | number
      isPacked?: boolean
      name?: string
    }>
    hasClan?: boolean
    canManageClanPreferences?: boolean
  }
  logProto('decode WalkerPreferencesResponse', { count: msg.walkers?.length ?? 0, hasClan: msg.hasClan })
  return {
    walkers: (msg.walkers ?? []).map(w => ({
      walkerId: Number(w.walkerId ?? 0),
      realmTileId: Number(w.realmTileId ?? 0),
      classPath: String(w.classPath ?? ''),
      name: String(w.name ?? ''),
      isPersonal: Boolean(w.isPersonal),
      isPacked: Boolean(w.isPacked),
    })),
    hasClan: Boolean(msg.hasClan),
    canManageClanPreferences: Boolean(msg.canManageClanPreferences),
  }
}

export async function encodeSetWalkerPreferenceRequest(walkerId: number): Promise<Buffer> {
  const root = await getRoot()
  const ReqType = root.lookupType('MistProto.BackendApiMigrationSetWalkerPreferenceRequest')
  const msg = ReqType.create({ walkerId })
  return Buffer.from(ReqType.encode(msg).finish())
}

export async function encodeDeleteWalkerPreferenceRequest(walkerId: number): Promise<Buffer> {
  const root = await getRoot()
  const ReqType = root.lookupType('MistProto.BackendApiMigrationDeleteWalkerPreferenceRequest')
  const msg = ReqType.create({ walkerId })
  return Buffer.from(ReqType.encode(msg).finish())
}

// Base headers for all LO backend requests.
export const LO_HEADERS = {
  'Content-Type': 'application/x-protobuf',
  'Accept': 'application/x-protobuf',
  'User-Agent': 'Mist/++UE4+Release-4.25-CL-0 Windows/10.0.26200.1.768.64bit',
}

// Additional header for the unauthenticated login call.
export const LO_LOGIN_EXTRA = {
  'x-auth-token': '{ "type" : "gameclient" }'
}
