// steamworks.js ships its own steam_api64.dll alongside the prebuilt NAPI binary.
// No additional SDK setup or node-gyp compilation required.
// Requires Steam to be running and steam_appid.txt (903950) present in the CWD.

import { init } from 'steamworks.js'

type SteamClient = ReturnType<typeof init>

let client: SteamClient | null = null

// Lazy init: Steam may not be running when the launcher starts. Retry on every
// call so clicking "Retry" after starting Steam actually picks it up instead of
// staying wedged on the first failed module-load attempt.
function ensureClient(): SteamClient | null {
  if (client) return client
  try {
    client = init()
    console.log('[steam] steamworks.js initialized, player:', client.localplayer.getName())
  } catch (err) {
    console.warn('[steam] steamworks unavailable:', (err as Error).message)
  }
  return client
}

ensureClient()

export interface SteamTicketResult {
  ticket: string  // hex-encoded auth session ticket
  steamId: string // steam64 ID as decimal string
  name: string    // persona display name
}

export type { SteamClient }

export function isAvailable(): boolean {
  return ensureClient() !== null
}

export function getLocalSteamId64(): string | null {
  const c = ensureClient()
  if (!c) return null
  return c.localplayer.getSteamId().steamId64.toString()
}

export function getClient(): SteamClient | null {
  return ensureClient()
}

export async function getSteamTicket(): Promise<SteamTicketResult> {
  const c = ensureClient()
  if (!c) {
    throw new Error(
      'Steam not available — ensure Steam is running and steam_appid.txt is present.'
    )
  }

  const steamIdObj = c.localplayer.getSteamId()
  const name = c.localplayer.getName()
  const steamId = steamIdObj.steamId64.toString()

  // getSessionTicketWithSteamId maps to the old GetAuthSessionTicket call which is what
  // the LO game client uses. getAuthTicketForWebApi requires Steam to be in a full
  // "game running" state and times out when launching outside of Steam.
  // Ticket must stay alive until Steam validates it — handle is intentionally not
  // cancelled here; it expires naturally after ~3 minutes.
  const ticketHandle = await c.auth.getSessionTicketWithSteamId(steamIdObj.steamId64)

  return {
    ticket: ticketHandle.getBytes().toString('hex'),
    steamId,
    name
  }
}
