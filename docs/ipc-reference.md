# IPC Reference

This is the developer reference for every IPC channel the renderer can call. Every channel goes through `apps/launcher/src/preload/index.ts` (which exposes `window.api`) and is implemented in `apps/launcher/src/main/ipc.ts` plus its module dependencies.

There is no `nodeIntegration` enabled in the renderer; this is the only path for privileged operations.

## Conventions

- **Invoke** channels are request/response (`ipcMain.handle` ↔ `ipcRenderer.invoke`).
- **Send** channels are fire-and-forget (`ipcMain.on` ↔ `ipcRenderer.send`).
- **Event** channels are main → renderer pushes (`webContents.send` ↔ `ipcRenderer.on`).
- All `api.*` namespaces use camelCase; raw channel names use `module:action` and are noted in parentheses.

---

## `api.window` — frameless window controls

| Method | Channel | Type | Description |
|---|---|---|---|
| `minimize()` | `window:minimize` | send | Minimise the window. |
| `toggleMaximize()` | `window:maximize-toggle` | send | Maximise or restore. |
| `close()` | `window:close` | send | Close the window. |
| `isMaximized()` | `window:is-maximized` | invoke | Returns `boolean`. |
| `onMaximizedChange(cb)` | `window:maximized-change` | event | `(isMax: boolean) => void`. |

## `api.steam` — Steamworks integration

| Method | Channel | Type | Description |
|---|---|---|---|
| `getTicket()` | `steam:get-ticket` | invoke | Returns `{ ticket, steamId, name }`. Throws if Steam unavailable. |
| `getAvatarUrl()` | `steam:avatar-url` | invoke | Returns the medium-size Steam avatar URL or `null`. |

## `api.lo` — Last Oasis backend

| Method | Channel | Type | Description |
|---|---|---|---|
| `login(backend, payload)` | `lo:login` | invoke | Exchanges a Steam ticket for an LO session. Returns `LOLoginResult` (success or banned). 403 → clears session. |

## `api.dev` — development helpers

| Method | Channel | Type | Description |
|---|---|---|---|
| `mockLogin()` | `dev:mock-login` | invoke | **Dev mode only.** Inserts a fake session for testing. |

## `api.session` — session storage

| Method | Channel | Type | Description |
|---|---|---|---|
| `load()` | `session:load` | invoke | Returns `Record<backend, StoredSession>` for all backends. |
| `clear(backend?)` | `session:clear` | invoke | Clears one backend's session, or all sessions if no arg. |

## `api.prefs` — user preferences

| Method | Channel | Type | Description |
|---|---|---|---|
| `load()` | `prefs:load` | invoke | Returns the full `LauncherPrefs` object. |
| `save(patch)` | `prefs:save` | invoke | Persists a partial update. |

## `api.realms` — Last Oasis realm API

| Method | Channel | Type | Description |
|---|---|---|---|
| `search(filters)` | `realms:search` | invoke | Fans out to all configured backends. Returns `{ realms, failures }`. |
| `getMap(realmId, characterId, backend)` | `realms:get-map` | invoke | Returns `RealmMap`. Throws `NO_CHARACTER` / `MAP_UNAVAILABLE` / `SESSION_EXPIRED`. |
| `getWalkerPreferences(realmId, characterId, backend)` | `realms:get-walker-preferences` | invoke | Returns `WalkerPreferences`. Empty list = no prefs set. |

## `api.drift` — Drift mod-consensus backend

| Method | Channel | Type | Description |
|---|---|---|---|
| `getAllRealmMods()` | `drift:all-realm-mods` | invoke | Forces a `GET /realms` pull and returns all cached records. |
| `getRealmMods(realmId)` | `drift:realm-mods` | invoke | Returns one realm's record or `null`. |
| `reportRealmMods(realmId, workshopIds, reportedBy)` | `drift:report-realm-mods` | invoke | Saves locally and POSTs to `/realms/{realmId}/mods`. |

## `api.workshop` — Steam Workshop metadata

| Method | Channel | Type | Description |
|---|---|---|---|
| `getPreviewUrls(workshopIds)` | `workshop:preview-urls` | invoke | Returns `Record<workshopId, previewUrl>`. Cached in-process. |

## `api.mods` — local mod state

| Method | Channel | Type | Description |
|---|---|---|---|
| `workshopDir()` | `mods:workshop-dir` | invoke | Path to Steam Workshop content folder, or `null`. |
| `check(workshopIds)` | `mods:check` | invoke | Returns `ModStatus[]` (installed, subscribed, active, upToDate, size). |
| `download(workshopIds)` | `mods:download` | invoke | Subscribes and downloads. Emits `mods:progress` events. |
| `listInstalled()` | `mods:list-installed` | invoke | Workshop folders only. |
| `listAll()` | `mods:list-all` | invoke | Steam subs ∪ workshop folders ∪ game folder, deduped. |
| `remove(workshopId)` | `mods:remove` | invoke | Deletes from the *game* Mods folder only. |
| `subscribe(workshopId)` | `mods:subscribe` | invoke | Steam subscription. |
| `unsubscribe(workshopId)` | `mods:unsubscribe` | invoke | Steam unsubscription. |
| `toggle(workshopId, active)` | `mods:toggle` | invoke | Rewrites the `"active"` field in `modinfo.json`. |
| `activate({ targetIds })` | `mods:activate` | invoke | Activates `targetIds`, deactivates the rest, copies missing folders to game dir. |
| `onProgress(cb)` | `mods:progress` | event | `({ workshopId, pct, speed }) => void`. Fired every ~500ms during download. |

## `api.game` — game launch and monitoring

| Method | Channel | Type | Description |
|---|---|---|---|
| `launch(realmId, backend)` | `game:launch` | invoke | Spawns the game (EAC, shipping, or steam:// fallback). Resolves immediately; monitor runs async. |
| `onStatus(cb)` | `game:status` | event | `'launching' \| 'running' \| 'stopped'`. |
| `onJoinedTile(cb)` | `game:joined-tile` | event | `{ realmId, levelPath, remoteAddr }` parsed from `Mist.log`. |

## `api.log` — game-log observers

| Method | Channel | Type | Description |
|---|---|---|---|
| `onModsFound(cb)` | `log:mods-found` | event | `{ realmId, workshopIds }` from log scrape. Used to feed the Drift report and the realm browser banner. |

## `api.news` — Steam news

| Method | Channel | Type | Description |
|---|---|---|---|
| `fetch()` | `news:fetch` | invoke | Returns `NewsItem[]` (up to 20). Cleaned snippets, plain text. |

## `api.cache` — cache management

| Method | Channel | Type | Description |
|---|---|---|---|
| `clear()` | `cache:clear` | invoke | Clears HTTP session cache, Workshop preview cache, and realm-mods store. Returns `{ previewCleared, realmModsCleared }`. Does **not** clear sessions or prefs. |

## `api.shell` — safe URL opening

| Method | Channel | Type | Description |
|---|---|---|---|
| `openExternal(url)` | `shell:open-external` | invoke | Opens HTTP(S) URLs only via system browser. Rejects `file://`, `javascript:`, etc. |

---

## Adding a new channel

1. Add the handler in [`apps/launcher/src/main/ipc.ts`](../apps/launcher/src/main/ipc.ts) (or a module it pulls from).
2. Expose it in [`apps/launcher/src/preload/index.ts`](../apps/launcher/src/preload/index.ts) under the matching `api.*` namespace.
3. Add types to [`packages/shared/src/types/`](../packages/shared/src/types/) if it crosses the IPC boundary.
4. Use it from the renderer via `window.api.namespace.method(...)`.

The shared package is a TypeScript workspace — there's no codegen step. Type changes are picked up by `tsc --noEmit` (`pnpm --filter launcher typecheck`).
