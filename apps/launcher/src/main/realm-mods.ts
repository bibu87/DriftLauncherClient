import axios from 'axios'
import Store from 'electron-store'
import { getSteamTicket } from './steam'
import type { RealmModRecord } from '@drift/shared'

const store = new Store<{ records: RealmModRecord[] }>({
  name: 'realm-mods',
  defaults: { records: [] },
})

const DRIFT_BACKEND_URL = process.env.DRIFT_BACKEND_URL ?? 'https://drift.nexteam.net'

async function syncToBackend(record: RealmModRecord): Promise<void> {
  try {
    const ticket = await getSteamTicket()
    await axios.post(
      `${DRIFT_BACKEND_URL}/realms/${record.realmId}/mods`,
      {
        workshopIds: record.workshopIds,
        reportedAt: record.reportedAt,
      },
      {
        headers: { 'x-steam-ticket': ticket.ticket },
        timeout: 10_000,
      }
    )
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status ?? 'network'
      const detail = err.response?.data
      console.warn(
        `[realm-mods] backend sync failed for realm ${record.realmId}: ${status}`,
        typeof detail === 'object' ? JSON.stringify(detail) : detail ?? err.message
      )
    } else {
      console.warn(
        `[realm-mods] backend sync failed for realm ${record.realmId}:`,
        (err as Error).message
      )
    }
  }
}

export function getAllRealmMods(): RealmModRecord[] {
  return store.get('records')
}

export function clearRealmMods(): number {
  const count = store.get('records').length
  store.set('records', [])
  return count
}

export function getRealmMods(realmId: number): RealmModRecord | null {
  return store.get('records').find(r => r.realmId === realmId) ?? null
}

// Pull the backend's derived realm-mod state into the local cache. Called at
// app startup so the launcher UI reflects the shared/consensus view of which
// realms are modded, not just realms this machine has personally joined.
// The local store becomes a cache of the backend.
export async function pullFromBackend(): Promise<void> {
  try {
    const res = await axios.get<RealmModRecord[]>(`${DRIFT_BACKEND_URL}/realms`, {
      timeout: 10_000,
    })
    const incoming = Array.isArray(res.data) ? res.data : []
    store.set('records', incoming)
    console.log(`[realm-mods] startup pull: cached ${incoming.length} record(s) from backend`)
  } catch (err) {
    console.warn('[realm-mods] startup pull failed:', (err as Error).message)
  }
}

export function reportRealmMods(
  realmId: number,
  workshopIds: string[],
  reportedBy: string
): void {
  const record: RealmModRecord = {
    realmId,
    workshopIds,
    reportedAt: new Date().toISOString(),
    reportedBy,
  }
  const records = store.get('records').filter(r => r.realmId !== realmId)
  records.push(record)
  store.set('records', records)
  console.log(`[realm-mods] saved ${workshopIds.length} mods for realm ${realmId}`)
  syncToBackend(record).catch(() => {})
}
