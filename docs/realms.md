# Realm Browser & Map

The Realms page is the main way to find and join servers. It surfaces every realm reachable through your configured backends, plus a hex map view for any realm where you have a character.

## Browser tabs

Three tabs at the top of the realm list:

| Tab | Behaviour |
|---|---|
| **Favorites** | Realms you've starred. Pinned at the top of your list. |
| **Recent** | The 20 most recently joined realms (capped). Auto-tracked when you launch into a realm. |
| **All Realms** | Everything returned by every configured backend. |

The default tab is configurable in **Settings → Realms → Default tab**.

## Filters and sort

Filters available on every tab:

- **Server type** — Official, vanilla (player-run, no mods), modded.
- **Region** — Any combination of region keys returned by the backend.
- **Status** — Online only / any.
- **My character** — Show only realms where you have a character (provided by the backend per session).
- **No password** — Hide private/password-locked realms.
- **Search** — Free-text match on realm name.

Sort options:

- Players (descending or ascending)
- Name (A→Z or Z→A)
- Wipe time (ascending — soonest first)
- Started (descending — newest first)

Within any sort group, **official realms always pin to the top**.

## Mod overlay (Drift consensus)

For each realm, the launcher overlays mod information from the Drift backend (`drift.nexteam.net`):

- A list of mod names is shown as chips on the realm card (up to 6, then `+N more`).
- A realm is tagged "modded" only if Drift has consensus data for it.

This data comes from a separate proprietary service that aggregates anonymous reports from launcher clients. See [Backends](./backends.md) for how the report/pull cycle works.

When the game starts and the launcher detects mods loading from the log, it reports those mod IDs back to Drift in the background. If your local discovery differs from cached overlay data, a transient banner shows for ~6 seconds noting the new mods.

## Quick Play

The realm card has a pin icon. Pin a realm to set it as your **Quick Play** target.

- The pinned realm appears in the sidebar with a large **PLAY** button.
- Clicking PLAY runs the full launch flow (mod check → download → activate → game start) without needing to navigate back to the browser.
- Only one realm can be pinned at a time.

## Realm map view

Click the map icon on any realm card to open the **Realm Map Modal**.

The map is a hex grid with:

- **Tile types** — OASIS (green), Mini Oasis / Cradle (blue), EVENT tiles (orange when online, gray when offline). Each map name (Sleeping Giants, Canyon, etc.) gets a PNG overlay scaled to cover its hex.
- **Lifecycle timers** — "Spawns in", "Burns in", "Burned ago", with duration formatting (e.g. `2h 14m`).
- **Tooltips** — Hover any tile to see type, region, claim status, difficulty, PvP mode, used/max slots, recent player deaths.
- **Highlight on click** — Click a walker in the sidebar to scroll the map to its tile and flash it.

Press **Escape** to close the modal.

### Walker sidebar

The left panel of the map modal lists every walker on the realm:

- Species icon (parsed from the UE4 class path — Schmetterling, RaptorSky, Balang, etc.).
- Owner name.
- Tile location (clickable — scrolls and highlights).
- A star icon if the walker is one of your in-game favourites.

Filters at the top of the sidebar:

- **Search** — name or owner.
- **Walker type** — filter by species.
- **Favourites only** — show only your starred walkers.

The favourite mark is read-only here. It comes from the LO backend's `GetWalkerPreferences` endpoint and reflects your in-game preferences exactly. Mark/unmark walkers from inside the game; the launcher will pick up the change next time you open the map.

### Map errors

The map fetch can fail in a few specific ways, each with its own UI message:

| Error | Meaning |
|---|---|
| `NO_CHARACTER` | You don't have a character on this realm yet. The map can't render without one. |
| `MAP_UNAVAILABLE` | The realm is offline or its map endpoint returned 500. Try again later. |
| `SESSION_EXPIRED` | Your LO session got invalidated. The launcher clears it and bounces you to login. |

Walker preferences are best-effort — if they fail, the map still renders, walkers just won't show favourites.

## Sessions and realm list

Each backend keeps its own session. The realm list is a fan-out: each backend is queried in parallel and the results are concatenated, with each realm tagged by its origin so map / launch calls route back to the right server. If a secondary backend fails its results are dropped silently; if the primary backend 403s, the launcher clears the session and routes to login.

See [Backends](./backends.md) for the full multi-backend story.
