// Steam avatar resolution.
//
// steamworks.js exposes no avatar API (localplayer only has getSteamId /
// getName / getLevel / getIpCountry / setRichPresence), so the only source is
// the public profile XML at steamcommunity.com. That endpoint rate-limits
// aggressively — a burst of requests reliably earns an HTTP 429 — so a single
// naive fetch per launch loses the avatar for the whole session.
//
// Three defences, in order of how often they save us:
//   1. Persist the resolved URL, so a successful fetch survives restarts.
//   2. Share one in-flight request, so React StrictMode's double-invoked
//      effect (and any remount) can't spend several requests at once.
//   3. Retry transient failures with backoff, honouring Retry-After.

import axios from 'axios'
import { getLocalSteamId64 } from './steam'
import { loadPrefs, savePrefs } from './prefs'
import type { AvatarCache } from '../shared'

const PROFILE_XML_URL = (steamId: string): string =>
  `https://steamcommunity.com/profiles/${steamId}/?xml=1`

// The profile XML hands back whichever CDN alias Steam feels like that day —
// avatars.akamai., avatars.fastly., avatars.cloudflare., or the bare host.
// The per-CDN aliases are legacy: avatars.cloudflare.steamstatic.com already
// 301s to the bare host, so Valve treats that one as canonical. Pin every
// alias to it, otherwise a cached URL can outlive the alias it was written
// with and 404 until the TTL rolls it over.
const CANONICAL_AVATAR_HOST = 'avatars.steamstatic.com'
const AVATAR_HOST_RE = /^avatars\.(?:[a-z0-9-]+\.)?steamstatic\.com$/i

const REQUEST_TIMEOUT_MS = 5_000
const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 500
const MAX_BACKOFF_MS = 10_000

// Avatars change rarely. Re-checking about once a day lets a changed picture
// propagate without touching the network on every launch.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

let inFlight: Promise<string | null> | null = null

export async function getAvatarUrl(): Promise<string | null> {
  const steamId = getLocalSteamId64()
  if (!steamId) {
    console.warn('[avatar] no SteamID — is Steam running?')
    return null
  }

  // Canonicalise on read too, so entries written before the host rewrite (or
  // by an older build) are repaired without waiting for the TTL.
  const cached = loadPrefs().avatarCache
  const usable =
    cached?.steamId === steamId ? { ...cached, url: canonicalAvatarUrl(cached.url) } : null
  if (usable && Date.now() - usable.fetchedAt < CACHE_TTL_MS) {
    return usable.url
  }

  if (inFlight) return inFlight
  inFlight = resolve(steamId, usable).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function resolve(steamId: string, stale: AvatarCache | null): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const url = await fetchOnce(steamId)
      if (url) {
        savePrefs({ avatarCache: { steamId, url, fetchedAt: Date.now() } })
        return url
      }
      // The document parsed but carried no avatar. Retrying won't change that.
      console.warn(`[avatar] no <avatarMedium> in profile XML for ${steamId}`)
      return stale?.url ?? null
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined
      // No status means a transport failure (timeout, DNS, reset) — worth
      // another go. Otherwise only 429 and 5xx are transient; a 403/404 is a
      // private or missing profile and will not improve.
      const transient = status === undefined || status === 429 || status >= 500
      const last = attempt === MAX_ATTEMPTS
      console.warn(
        `[avatar] attempt ${attempt}/${MAX_ATTEMPTS} failed` +
          `${status ? ` (HTTP ${status})` : ` (${(err as Error).message})`}`
      )
      if (!transient || last) break
      const retryAfter = axios.isAxiosError(err)
        ? err.response?.headers?.['retry-after']
        : undefined
      await sleep(backoffMs(attempt, retryAfter))
    }
  }

  // Out of attempts. A day-old avatar beats falling back to the initial.
  if (stale) {
    console.warn('[avatar] giving up, using cached URL')
    return stale.url
  }
  return null
}

async function fetchOnce(steamId: string): Promise<string | null> {
  const res = await axios.get<string>(PROFILE_XML_URL(steamId), {
    headers: { Accept: 'text/xml' },
    timeout: REQUEST_TIMEOUT_MS,
    responseType: 'text',
  })
  const m = String(res.data).match(/<avatarMedium><!\[CDATA\[(.+?)\]\]><\/avatarMedium>/)
  return m ? canonicalAvatarUrl(m[1]) : null
}

// Rewrite a Steam avatar CDN alias to the canonical host. Anything that isn't
// a recognised steamstatic avatar host is passed through untouched — we'd
// rather serve an odd URL than mangle one we don't understand.
export function canonicalAvatarUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (!AVATAR_HOST_RE.test(parsed.hostname)) return url
    parsed.hostname = CANONICAL_AVATAR_HOST
    return parsed.toString()
  } catch {
    return url
  }
}

function backoffMs(attempt: number, retryAfter?: unknown): number {
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, MAX_BACKOFF_MS)
  }
  // Exponential with jitter, so concurrent launchers don't retry in lockstep.
  const base = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS)
  return base + Math.random() * base
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
