# Settings & Data Storage

Everything DriftLauncher persists is stored under `%APPDATA%\DriftLauncher\` on Windows. Three separate files:

| File | Contents |
|---|---|
| `config.json` | Preferences: favourites, recent realms, Quick Play pin, settings, read news IDs. |
| `drift-session.json` | Per-backend LO session tokens, encrypted via Electron `safeStorage`. |
| `realm-mods.json` | Cached realm → workshop-IDs records pulled from the Drift backend. |

These files are managed by `electron-store`. There's no global "wipe" command; **Settings → Cache → Clear cache** clears the realm-mod cache and Workshop preview thumbnails, but **does not** clear sessions or preferences.

## Settings page

### Launch

| Setting | Default | Description |
|---|---|---|
| **Launch arguments** | *(empty)* | Extra command-line args passed to the game executable. |
| **EAC enabled** | `true` | Use the Easy Anti-Cheat launcher (`OasisLauncher.exe`). When off, launches the shipping binary directly — required for most mods. |
| **Launch on startup** | `false` | Reserved; not currently wired into Windows startup. |

### Realms

| Setting | Default | Description |
|---|---|---|
| **Default realm tab** | `realms` | Which tab opens first: `favorites`, `recent`, or `realms` (all). |

### Backends

A list of Last Oasis backends. The official prod URL (`https://backend-production.last-oasis.com`) is always first and non-removable.

- **Add backend** — Type a URL and submit. The launcher probes it by attempting a Steam login; only backends that authenticate successfully are saved.
- **Remove backend** — Available on every entry except prod.

See [Backends](./backends.md) for how the list is used (parallel fan-out for realm search and login).

### Appearance

| Setting | Default | Description |
|---|---|---|
| **Theme** | `dark` | One of `dark`, `light`, `bronze`. Applied via `document.documentElement.dataset.theme`. |

### Cache

| Setting | Description |
|---|---|
| **Clear cache** | Clears the Drift realm-mod cache and the in-memory Workshop preview-image cache. Returns the count of records and previews dropped. Sessions and preferences are not touched. |

## What's in `config.json`

```json
{
  "favorites": ["realmId1", "realmId2"],
  "recent": ["realmId3", "realmId4"],
  "selectedServerId": "realmId1",
  "settings": {
    "launchArgs": "",
    "eacEnabled": true,
    "theme": "dark",
    "launchOnStartup": false,
    "defaultRealmTab": "realms",
    "backendUrls": [
      "https://backend-production.last-oasis.com"
    ]
  },
  "readNewsIds": ["newsGid1", "newsGid2"]
}
```

The store auto-migrates older configs that are missing `backendUrls` and always normalizes the prod URL into index 0.

## What's in `drift-session.json`

```json
{
  "sessions": {
    "https://backend-production.last-oasis.com": {
      "tokenEncrypted": "<base64 ciphertext>",
      "playerName": "...",
      "motd": "..."
    },
    "https://community.example.net": {
      "tokenEncrypted": "<base64 ciphertext>",
      "playerName": "...",
      "motd": "..."
    }
  }
}
```

Tokens are encrypted with [`safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage). The `playerName` and `motd` are stored in plaintext as a UI fallback if decryption fails — in that case the entry is dropped and the user re-authenticates.

If you switch Windows users or reset your DPAPI store, all sessions become unreadable; this is expected. Just sign in again.

## What's in `realm-mods.json`

```json
{
  "records": [
    {
      "realmId": "...",
      "workshopIds": ["3041234567", "2999888777"],
      "reportedAt": "2026-04-26T13:14:15.000Z",
      "reportedBy": "log-watcher"
    }
  ]
}
```

Refreshed at every launcher start via `GET /realms` against the Drift backend, and locally appended whenever the in-game log reveals new mod IDs. See [Backends](./backends.md).

## What about the game's mod folder?

DriftLauncher writes to:

```
Steam\steamapps\common\Last Oasis\Mist\Content\Mods\<workshopId>\modinfo.json
```

…and copies mod folders into that directory from Steam's Workshop content cache. It does this only as part of the activate step before launch, never speculatively. See [Mod Manager](./mods.md) for details.

## Resetting

| To reset… | Do this |
|---|---|
| The realm-mod overlay cache | **Settings → Cache → Clear cache** |
| Read/unread news state | Edit `readNewsIds` in `config.json`, or delete the file |
| All preferences | Delete `%APPDATA%\DriftLauncher\config.json` |
| Sessions (force re-login) | Delete `%APPDATA%\DriftLauncher\drift-session.json` or use **Sign out** in the sidebar |
| Everything | Delete the `%APPDATA%\DriftLauncher\` folder |

The launcher recreates any missing files with defaults on next start.
