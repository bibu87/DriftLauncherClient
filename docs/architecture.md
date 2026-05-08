# Architecture

DriftLauncher is an **Electron** application split across three processes (main / preload / renderer).

## Repository layout

```
DriftLauncherClient/
└── apps/
    └── launcher/                     # Electron app
        ├── electron.vite.config.ts   # electron-vite build config
        ├── lo-protos/                # Last Oasis protobuf schemas + openapi.yaml
        ├── resources/                # Window icon
        ├── scripts/                  # Helper scripts (icon generation, probes)
        ├── src/
        │   ├── main/                 # Main (Node) process
        │   ├── preload/              # Context-isolated bridge
        │   ├── renderer/             # React UI
        │   └── shared/               # TypeScript types crossing the IPC boundary
        ├── steam_api64.dll           # Steamworks runtime
        └── steam_appid.txt           # Contains "903950"
```

The **Drift backend** (mod-consensus service at `drift.nexteam.net`) is a separate proprietary service whose source is not in this repo. The launcher talks to it over a small HTTP API — see [Backends](./backends.md).

## Processes

DriftLauncher uses Electron's standard three-process model:

```
┌──────────────────┐        IPC        ┌──────────────────────┐
│   Renderer       │  ◄────────────►   │  Main (Node)         │
│   (React + Vite) │                    │  - Steam SDK         │
│                  │                    │  - HTTP / protobuf   │
│  window.api.*    │                    │  - File system       │
│  window.electron │                    │  - Game launch       │
└──────────────────┘                    └──────────────────────┘
        ▲                                          ▲
        │ contextBridge                            │
        │                                          │
┌──────────────────┐                                │
│   Preload        │ ───── exposes typed API ───────┘
│  (isolated)      │
└──────────────────┘
```

### Main process — `apps/launcher/src/main/`

The trusted side. Has full Node access; owns native handles, file system, and the Steamworks SDK.

| File | Responsibility |
|---|---|
| [`index.ts`](../apps/launcher/src/main/index.ts) | App entry. Creates the 1280×800 frameless window, registers IPC handlers, kicks off the Drift backend pull at startup. |
| [`ipc.ts`](../apps/launcher/src/main/ipc.ts) | Central registry of all IPC handlers. Bridges renderer calls to the modules below. |
| [`steam.ts`](../apps/launcher/src/main/steam.ts) | Steamworks SDK lazy-init, session ticket acquisition, persona name + Steam ID. |
| [`lo.ts`](../apps/launcher/src/main/lo.ts) | Last Oasis protobuf encoder/decoder + HTTP client. Loads `.proto` files at startup. |
| [`session.ts`](../apps/launcher/src/main/session.ts) | Per-backend session storage. Tokens encrypted via Electron `safeStorage`. |
| [`prefs.ts`](../apps/launcher/src/main/prefs.ts) | User preferences via `electron-store`. |
| [`mods.ts`](../apps/launcher/src/main/mods.ts) | Steam Workshop state, `modinfo.json` reads/writes, mod folder copy/activate. |
| [`realm-mods.ts`](../apps/launcher/src/main/realm-mods.ts) | Local cache + Drift backend sync of which mods each realm uses. |
| [`game.ts`](../apps/launcher/src/main/game.ts) | Game launch (EAC vs shipping exe), log tailing, mod ID extraction from logs. |
| [`news.ts`](../apps/launcher/src/main/news.ts) | Fetches Steam news for App ID 903950 and strips HTML/BBCode. |

### Preload — `apps/launcher/src/preload/index.ts`

Runs in the renderer's process but in an isolated world. Uses `contextBridge` to expose a typed `window.api` object with namespaces like `api.steam`, `api.lo`, `api.realms`, `api.mods`, `api.game`, `api.news`, `api.prefs`, `api.session`, `api.window`, `api.shell`, `api.cache`, `api.workshop`, `api.drift`, `api.log`.

This is the only path the renderer has into Node — there is no `nodeIntegration`. See [IPC Reference](./ipc-reference.md) for every channel.

### Renderer — `apps/launcher/src/renderer/`

Untrusted UI built with **React 18**, **React Router**, **Tailwind CSS**, and **Zustand**. Cannot touch the file system or network directly — every privileged operation goes through `window.api.*`.

| Path | What's there |
|---|---|
| `App.tsx` | Routes (`/login`, `/servers`, `/mods`, `/news`, `/settings`, `/changelog`), prefs load, news refresh timer (15 min), theme application. |
| `layouts/AppLayout.tsx` | Sidebar (logo, nav, user card, Quick Play, PLAY button, news badge). |
| `layouts/TitleBar.tsx` | Custom 32px frameless titlebar with minimize / maximize / close. |
| `pages/Login.tsx` | Steam authentication UI. |
| `pages/ServerBrowser.tsx` | Realm list, filters, sort, favorites, recent, mod overlay, quick-play pin. |
| `pages/RealmMapModal.tsx` | Hex map, tile lifecycle timers, walker sidebar. |
| `pages/ModsManager.tsx` | Installed + subscribed mods, preview images, toggle/update/delete actions. |
| `pages/NewsPage.tsx` | News feed with read tracking. |
| `pages/SettingsPage.tsx` | Preferences UI (launch args, EAC, theme, backends, cache clear). |
| `pages/ChangelogPage.tsx` | Hardcoded release notes. |
| `store/auth.ts` | Zustand: Steam identity + per-backend LO sessions. |
| `store/launcher.ts` | Zustand: realms, favorites, recent, settings, news, game/play state. |
| `hooks/useSteamAuth.ts` | Orchestrates Steam + multi-backend LO login. |

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 30 |
| Build tool | electron-vite |
| UI | React 18, React Router 6, Tailwind CSS 3 |
| State | Zustand 4 |
| Persistence | electron-store (preferences) + Electron `safeStorage` (encrypted tokens) |
| HTTP | axios |
| Wire format | Protobuf (protobufjs) for LO API; JSON for Drift API and Steam APIs |
| Steam integration | steamworks.js (Greenworks-style native bindings) |
| Language | TypeScript end-to-end |
| Package manager | pnpm 9 |

## Data flow: starting the game

The "PLAY" button is the most complex flow in the app. Here's what happens when you click it:

```
Renderer                Main                     External
────────                ────                     ────────
PLAY clicked
  │
  ├─► api.mods.check ────► mods:check ─────────► Steamworks SDK
  │                          │                   (subscribed/installed/active)
  │   ◄── ModStatus[] ───────┤
  │
  ├─► api.mods.download ──► mods:download ─────► Steam (subscribe + DL)
  │   ◄── progress events ───┤  (polled at 500ms)
  │
  ├─► api.mods.activate ──► mods:activate
  │                          │  (cpSync workshop → game folder)
  │                          │  (rewrite modinfo.json "active" flags)
  │
  ├─► api.game.launch ────► game:launch ───────► OasisLauncher.exe (EAC)
  │                          │                   or MistClient.exe
  │                          │                   or steam://rungameid/903950
  │                          │
  │                          ├── tail Mist.log ─► Last Oasis log file
  │                          │
  │   ◄── game:status ───────┤  ('launching' → 'running' → 'stopped')
  │   ◄── game:joined-tile ──┤  (extracted from log)
  │   ◄── log:mods-found ────┤  (workshop IDs from log)
```

For non-modded realms (official, vanilla), the activate step still runs but with an empty target list — every mod is set to `"active": false` so the game starts vanilla.

## Build pipeline

Three independent bundles produced by `electron-vite`:

| Bundle | Source | Output |
|---|---|---|
| Main | `src/main/` | `out/main/index.js` |
| Preload | `src/preload/` | `out/preload/index.js` |
| Renderer | `src/renderer/` | `out/renderer/` |

`electron-builder` then packages those plus `steam_api64.dll`, `steam_appid.txt`, the `lo-protos/` folder, and `resources/icon.ico` into:

- `DriftLauncher-<version>-win-x64.exe` — portable, single file
- `DriftLauncher-<version>-win-x64.zip` — unpacked archive

See [Build & Release](./build-and-release.md) for commands.
