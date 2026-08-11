# Backends

DriftLauncher talks to two completely independent kinds of backend:

1. **Last Oasis backends** — the game's own realm/login API. Multiple supported in parallel.
2. **Drift backend** — a community mod-consensus service. Single instance.

## Last Oasis backends

These speak the official protobuf API used by the game itself.

| Endpoint | Purpose |
|---|---|
| `POST /Api/Player/LoginWithSteam` | Exchange a Steam ticket for a session token. |
| `POST /Api/JoinRealm/Search` | Search realms with filters. |
| `POST /Api/Realm/GetMap` | Fetch the hex map for a realm (requires character). |
| `POST /Api/Migration/GetWalkerPreferences` | Get the calling character's walker favourites. |
| `POST /Api/Migration/SetWalkerPreference` | Mark a walker as one of the character's favourites. |
| `POST /Api/Migration/DeleteWalkerPreference` | Clear a walker's favourite flag. |

All payloads are protobuf — see `apps/launcher/lo-protos/`. Schemas are also documented in `apps/launcher/lo-protos/openapi.yaml`.

### Multi-backend support

The launcher keeps a list of backend URLs, led by the **built-in** backends — the ones shipped with the launcher, listed in `PINNED_BACKEND_URLS`:

| Backend | Why it's pinned |
|---|---|
| `https://backend-production.last-oasis.com` | Official prod, and the source of truth for your Steam-Last-Oasis identity (the "primary") |
| `https://realmdrift.com` | Community backend shipped by default |

Built-in backends always lead the list, in that order, and have no **Remove** button. `loadPrefs()` re-inserts a missing one on every load, which is how a newly shipped built-in backend reaches installs that already have a config file.

Add or remove your own backends in **Settings → Backends**. Adding a backend probes it with your Steam ticket; if login succeeds the backend is added and a session for it is stored.

A backend that appears since the last run — one you added, or one pinned by a launcher update — is logged into automatically during session restore, so it participates in realm search immediately rather than reporting `NO_SESSION` until reconnected by hand.

#### Realm search fan-out

`api.realms.search(filters)` runs in parallel across every configured backend. The result is:

```ts
{
  realms: Realm[],                     // concatenated, each tagged with .backend
  failures: Array<{                    // per-backend failures
    backend: string
    code: 'NO_SESSION' | 'SESSION_EXPIRED' | 'ERROR'
    message?: string
  }>
}
```

A primary-backend `SESSION_EXPIRED` triggers a redirect to `/login`. Secondary failures are surfaced as warnings only — the user keeps using whichever backends succeeded.

#### Routing follow-ups

Every realm is tagged with the backend URL it came from. Map fetches, walker preference fetches, and game launches all route back to the originating backend so you don't accidentally query the wrong server for realm-specific state.

## Drift backend

The **Drift backend** (`drift.nexteam.net` by default) is a small JSON HTTP service that aggregates anonymous reports from launcher clients about which mods each realm runs. Its purpose is to power the modded-realm overlay shown in the realm browser.

> The Drift backend is a separate proprietary service. Its source is **not** in this repository. Third parties can run their own compatible backend by setting the `DRIFT_BACKEND_URL` environment variable.

### API

| Endpoint | Direction | Purpose |
|---|---|---|
| `GET /realms` | Client → backend | Pull all realm-mod records. Called once at launcher start. |
| `POST /realms/{realmId}/mods` | Client → backend | Report the mods detected for a realm during a play session. The body carries the originating LO `backend` URL so records are keyed by `(backend, realmId)`. |

Authentication is via `x-steam-ticket` header — the same Steam session ticket used for LO login. Requests have a 10-second timeout.

### Record shape

```ts
{
  backend: string     // origin LO backend URL — realmId is only unique within a backend
  realmId: number
  workshopIds: string[]
  reportedAt: string  // ISO 8601
  reportedBy: string  // e.g. 'log-watcher', 'dev'
}
```

Records are keyed by `(backend, realmId)`, not `realmId` alone. Multiple LO backends can hand out the same numeric realm ID for unrelated realms, so the Drift store and overlay both disambiguate by the originating backend URL.

### Local cache

Records are cached in `%APPDATA%\DriftLauncher\realm-mods.json` (managed by `electron-store`). The cache is:

- **Refreshed** on every launcher start (best-effort `GET /realms`).
- **Updated locally** the moment the in-game log reveals new workshop IDs. The local update is immediate; the network sync to Drift is fire-and-forget.

This means the modded-realm overlay works even when offline — the cache is what powers the UI; the network just keeps it fresh.

### Detection

While the game runs, DriftLauncher tails `Mist.log` looking for lines that match `/mod|workshop|ugc/i`. Any 9–11 digit numeric token in those lines is collected as a Workshop ID. When the game closes, the collected set (deduped) is reported alongside the realm ID the player was joined to.

The launcher only reports IDs from realms it knows the player joined (extracted from `SendInitialJoin` log lines). If the realm isn't identifiable, no report is sent. The originating LO backend URL is captured at launch time and reported alongside the realm ID.

### Privacy

The only personally-identifying data sent to Drift is the Steam ticket used for auth. No player names, character IDs, gameplay events, or chat are transmitted. The reported payload is just `{ realmId, workshopIds }`.

## Pointing at your own Drift backend

To run the launcher against a different Drift instance, set the environment variable before launch:

```
DRIFT_BACKEND_URL=https://your-drift.example.com
```

Your service must implement `GET /realms` and `POST /realms/{realmId}/mods` with the schema above and accept the `x-steam-ticket` header.
