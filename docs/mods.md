# Mod Manager

DriftLauncher uses Steam Workshop as the source of truth for mods. It does not host or distribute mod files itself — every mod operation is a thin layer over Steamworks subscription state, the Workshop content cache on disk, and the *Last Oasis* game folder.

## Where mods live

Last Oasis loads mods from a fixed game-folder path:

```
Steam\steamapps\common\Last Oasis\Mist\Content\Mods\<workshopId>\
```

Each mod folder contains a `modinfo.json` with (among other fields) an `"active": true | false` boolean. Last Oasis ignores any mod where `active` is `false`.

Steam itself stores subscribed Workshop items in:

```
Steam\steamapps\workshop\content\903950\<workshopId>\
```

DriftLauncher copies (or activates in place) from the Workshop cache into the game's Mods folder when needed.

## What the launcher does

| Action | Behaviour |
|---|---|
| **Check** | Query the Steamworks SDK for each Workshop ID — is it subscribed, installed, up-to-date? Read `modinfo.json` for the active flag and title. |
| **Download** | Subscribe (if not already) and download missing items via the Steamworks SDK, with progress events every 500ms. 10-minute hard timeout per batch. |
| **List installed** | Enumerate folders in the Workshop content directory. |
| **List all** | Combine Steam subscriptions + Workshop folders + game Mods folder, deduped by Workshop ID. Workshop folders that Steam no longer reports as subscribed are skipped — Steam leaves them on disk until the next game launch and they would otherwise surface as ghost entries. |
| **Toggle active** | Rewrite `"active": true / false` in `modinfo.json` (in both the Workshop folder and the game folder if present). |
| **Activate set** | For a target list of Workshop IDs: copy any missing mod folders from Workshop to the game folder, mark targets active, mark everything else inactive. |
| **Subscribe / Unsubscribe** | Toggle Steam subscription state. |
| **Remove** | Delete the mod folder from the *game* Mods directory only. The Workshop cache and subscription are untouched. |

## Reading and writing `modinfo.json`

`modinfo.json` files often contain very large numeric asset hashes (greater than `Number.MAX_SAFE_INTEGER`). `JSON.parse` would silently corrupt those values, so the launcher reads and writes the `active` field with **regex-based, directional patches** instead of full parse/serialize:

- Enable: replace `"active": false` → `"active": true` (only that direction).
- Disable: replace `"active": true` → `"active": false` (only that direction).

Idempotent and lossless on the rest of the file.

## Mod Manager UI

The **Mods** page has two sections:

### Installed

Mods physically present in the game's `Mist/Content/Mods` folder. The header also shows total subscriptions (counting installed ones), so an installed-and-subscribed mod contributes to both numbers.

- Toggle active / inactive (in-place).
- Update if Steam reports a pending update.
- Delete from the game Mods folder.
- Each row shows preview image, size, and Workshop ID.

An **Update all** button appears when one or more installed mods have updates available.

### Subscribed (not installed)

Items you've subscribed to on Steam but Steam hasn't downloaded yet.

- Download (forces Steam to fetch).
- Unsubscribe.

### Refresh

The **Refresh** button re-queries Steam, re-reads the folders, and re-fetches Workshop preview thumbnails.

Preview images come from `https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/` and are cached in-memory per process. They're also re-cleared when you click **Settings → Cache → Clear cache**.

## Automatic mod activation on launch

When you press PLAY on a realm:

1. **Check** — for the mod IDs Drift says the realm uses (or none, for vanilla/official realms).
2. **Download** — anything missing or outdated, with progress shown in the sidebar.
3. **Activate** — copy missing folders into the game Mods directory; mark target mods `"active": true`; mark every other mod `"active": false`.
4. **Launch** — see [Architecture → Data flow: starting the game](./architecture.md#data-flow-starting-the-game).

Vanilla and official servers always launch with **every mod deactivated**. The activate step is still run with an empty target list to ensure no leftover `"active": true` flags remain from a previous modded session.

## Discovery: how Drift learns which realm uses which mods

DriftLauncher tails `Mist.log` while the game runs. Lines containing `mod`, `workshop`, or `ugc` are scanned for 9–11 digit numeric IDs. The collected set is reported back to the Drift backend with the realm ID and a "reportedBy" tag. This feeds the consensus layer that powers the modded-realm overlay in the browser. See [Backends](./backends.md) for the protocol.

## EAC vs non-EAC launch

Mods only work in the EAC-disabled launch path on most builds. The launcher honours your **Settings → Launch → EAC** toggle:

- **EAC on** (default): tries `OasisLauncher.exe` first, falls back to `MistClient.exe`.
- **EAC off**: tries the shipping binary at `Mist/Binaries/Win64/MistClient-Win64-Shipping.exe`.

If neither resolves, the launcher falls back to `steam.exe -applaunch 903950` (and then `steam://rungameid/903950` as a last resort, in which case command-line args like `-backendapiurloverride` cannot be forwarded).
