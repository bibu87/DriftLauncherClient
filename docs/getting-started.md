# Getting Started

DriftLauncher is a desktop application for *Last Oasis* that browses realms, manages Workshop mods, and launches the game. It runs on Windows and authenticates through your Steam client.

## Prerequisites

| Requirement | Details |
|---|---|
| Operating system | Windows 10 or 11 (x64) |
| Steam | Must be installed and **running** when you launch DriftLauncher |
| Last Oasis | Must be installed via Steam (App ID `903950`) |
| Steam Workshop | DriftLauncher uses your Steam subscriptions and Workshop cache |

DriftLauncher does not work without Steam — Steam authentication is the only login method, and the Steamworks SDK must initialise before any feature is available.

## Install

Pre-built Windows binaries are published on the [GitHub Releases](https://github.com/bibu87/DriftLauncherClient/releases/latest) page.

| File | Description |
|---|---|
| `DriftLauncher-<version>-win-x64.exe` | Single-file portable build. Download and run; no install. |
| `DriftLauncher-<version>-win-x64.zip` | Zipped unpacked build. Extract anywhere and run `DriftLauncher.exe` from inside. |

Builds are currently unsigned, so Windows SmartScreen may warn the first time you run them. Click **More info → Run anyway** if you trust the source.

## First launch

1. Make sure Steam is running and you are signed in.
2. Start DriftLauncher.
3. The login screen authenticates through Steam automatically — it acquires a session ticket from your running Steam client and exchanges it with the Last Oasis backend. No password is ever entered into DriftLauncher.
4. After login, the realm browser opens.

If login fails, the most common causes are:

- Steam is not running.
- Last Oasis is not installed.
- Your Last Oasis account is banned (the launcher will display the ban reason and expiry).

See [Authentication](./authentication.md) for the full flow and troubleshooting.

## Quick tour

- **Realms** — Browse all available servers across configured backends. Filter by region, type (vanilla/modded), online status, and player count. Click a realm to open its map.
- **Mods** — Manage installed and subscribed Workshop mods. Toggle them on/off, download missing ones, subscribe/unsubscribe.
- **News** — Read official *Last Oasis* announcements pulled from Steam (refreshed automatically every 15 minutes).
- **Settings** — Configure launch arguments, EAC, theme, default realm tab, and backend URLs.
- **PLAY button** — Pin any realm as your Quick Play target. Clicking PLAY downloads any required mods, sets them active, and launches the game.

## Where DriftLauncher stores its data

| Data | Location |
|---|---|
| Preferences (favorites, recent, settings, read news) | `%APPDATA%\DriftLauncher\config.json` |
| Encrypted session tokens | `%APPDATA%\DriftLauncher\drift-session.json` |
| Cached realm-mod records | `%APPDATA%\DriftLauncher\realm-mods.json` |
| Workshop downloads | Managed by Steam (`steamapps\workshop\content\903950\`) |
| Active mods used by the game | `Steam\steamapps\common\Last Oasis\Mist\Content\Mods\<workshopId>\` |

DriftLauncher never modifies your Steam library or game saves. It only reads/writes Workshop subscription state and the `modinfo.json` files in the game's Mods folder.

See [Settings & Data Storage](./settings.md) for full details.

## Building from source

If you want to develop or build DriftLauncher yourself, see [Architecture](./architecture.md) and [Build & Release](./build-and-release.md).
