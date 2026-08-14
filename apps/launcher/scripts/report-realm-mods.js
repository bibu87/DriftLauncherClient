// Maintenance tool: overwrite a realm's mod list on the Drift backend.
//
// The launcher normally reports this automatically from the game log after a
// session. This script exists for corrections — e.g. records written by the
// pre-fix log scraper, which conflated the realm's required mods with the
// player's own locally-active mods and the realm's ban list.
//
// Usage:
//   node scripts/report-realm-mods.js <loBackendUrl> <realmId> <id>[,<id>...]
//   node scripts/report-realm-mods.js https://realmdrift.com 198806208456622 3766937410
//   ... --dry-run     # print the request, send nothing
//
// Steam must be running — the backend authenticates the report with a Steam
// session ticket, and attributes it to that steam64 ID. Run from apps/launcher
// so steam_appid.txt (903950) is in the CWD.

const { existsSync } = require('fs')
const { join } = require('path')

const DRIFT_BACKEND_URL = process.env.DRIFT_BACKEND_URL ?? 'https://drift.nexteam.net'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const [backend, realmIdArg, idsArg] = args.filter(a => !a.startsWith('--'))

if (!backend || !realmIdArg || !idsArg) {
  console.error('[report] usage: node scripts/report-realm-mods.js <loBackendUrl> <realmId> <workshopId>[,<workshopId>...] [--dry-run]')
  process.exit(1)
}

if (!/^https?:\/\//.test(backend)) {
  console.error(`[report] invalid backend "${backend}" — expected an http(s) URL`)
  process.exit(1)
}

const realmId = Number(realmIdArg)
if (!Number.isSafeInteger(realmId) || realmId <= 0) {
  console.error(`[report] invalid realmId "${realmIdArg}"`)
  process.exit(1)
}

const workshopIds = idsArg.split(',').map(s => s.trim()).filter(Boolean)
if (!workshopIds.every(id => /^\d+$/.test(id))) {
  console.error(`[report] workshop IDs must be numeric, got: ${workshopIds.join(', ')}`)
  process.exit(1)
}

if (!existsSync(join(process.cwd(), 'steam_appid.txt'))) {
  console.error('[report] steam_appid.txt not found in CWD — run this from apps/launcher')
  process.exit(2)
}

async function main() {
  const payload = {
    backend,
    workshopIds,
    reportedAt: new Date().toISOString(),
  }
  const url = `${DRIFT_BACKEND_URL}/realms/${realmId}/mods`

  console.log(`[report] target:  POST ${url}`)
  console.log(`[report] payload: ${JSON.stringify(payload)}`)

  if (dryRun) {
    console.log('[report] --dry-run: nothing sent.')
    return
  }

  const { init } = require('steamworks.js')
  const client = init()
  const steamIdObj = client.localplayer.getSteamId()
  console.log(`[report] steam:   ${client.localplayer.getName()} (${steamIdObj.steamId64})`)

  // Same call the launcher uses — getAuthTicketForWebApi needs a full
  // "game running" state and times out when run outside Steam.
  const ticketHandle = await client.auth.getSessionTicketWithSteamId(steamIdObj.steamId64)
  const ticket = ticketHandle.getBytes().toString('hex')

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-steam-ticket': ticket },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  })

  const text = await res.text()
  if (!res.ok) {
    console.error(`[report] failed: ${res.status} ${res.statusText} ${text.slice(0, 300)}`)
    process.exit(3)
  }
  console.log(`[report] ok: ${res.status} ${text.slice(0, 300)}`)
}

// steamworks.js keeps a handle on the event loop, so the process never exits
// on its own once the client is initialized — exit explicitly.
main().then(
  () => process.exit(0),
  err => {
    console.error('[report] error:', err.message)
    process.exit(4)
  }
)
