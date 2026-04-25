import axios from 'axios'
import type { NewsItem } from '@drift/shared'

// Last Oasis on Steam — public Steam Web API, no key required.
const LO_APPID = 903950
const STEAM_NEWS_URL = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/`

interface SteamNewsItem {
  gid: string
  title: string
  url: string
  author: string
  contents: string
  feedlabel: string
  date: number
  feed_type?: number
  feedname?: string
}

interface SteamNewsResponse {
  appnews?: { newsitems?: SteamNewsItem[] }
}

// Strips HTML tags and common BBCode tokens, decodes a handful of HTML entities,
// and collapses whitespace. Steam returns a mixed HTML/BBCode soup; this isn't
// a full parser, just enough to produce a clean preview snippet.
function toSnippet(raw: string): string {
  if (!raw) return ''
  let s = raw
  s = s.replace(/<[^>]+>/g, ' ')
  s = s.replace(/\[\/?[a-zA-Z0-9*=\s"'_.\-:/]+\]/g, ' ')
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

export async function fetchNews(): Promise<NewsItem[]> {
  const start = Date.now()
  try {
    const res = await axios.get<SteamNewsResponse>(STEAM_NEWS_URL, {
      params: {
        appid: LO_APPID,
        count: 20,
        maxlength: 600,
        format: 'json',
      },
      timeout: 10_000,
    })
    const items = res.data?.appnews?.newsitems ?? []
    console.log(`[news] fetched ${items.length} items (${Date.now() - start}ms)`)
    return items.map(it => ({
      gid: String(it.gid),
      title: String(it.title ?? ''),
      url: String(it.url ?? ''),
      author: String(it.author ?? ''),
      date: Number(it.date ?? 0),
      feedlabel: String(it.feedlabel ?? ''),
      snippet: toSnippet(String(it.contents ?? '')),
    }))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[news] fetch failed: ${msg}`)
    throw err
  }
}
