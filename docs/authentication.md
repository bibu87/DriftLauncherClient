# Authentication

DriftLauncher uses **Steam-based authentication only**. There is no username/password login. The launcher gets a session ticket from your running Steam client and exchanges it with the Last Oasis backend for an LO session token.

## Flow

```
┌────────────┐  1. getTicket    ┌──────────────────┐
│  Steam     │ ◄──────────────  │  DriftLauncher   │
│  client    │                  │  (main process)  │
│            │ ──ticket+steamId ►│                 │
└────────────┘                  └────────┬─────────┘
                                         │
                          2. LoginWithSteam (protobuf)
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │ Last Oasis backend   │
                              │ (one or more)        │
                              └──────────┬───────────┘
                                         │
                            token / motd / ban info
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │  Encrypted session   │
                              │  written to disk     │
                              └──────────────────────┘
```

## Step 1 — Steam ticket

Implemented in [`steam.ts`](../apps/launcher/src/main/steam.ts).

- The Steamworks SDK (`steamworks.js`) is initialised lazily for App ID **903950**.
- `getSessionTicketWithSteamId()` returns a hex-encoded auth ticket plus your Steam ID and persona name.
- Tickets expire roughly 3 minutes after issue. The launcher does not cancel them; they expire naturally.
- If Steam isn't running, init fails. The login screen will surface this and offers a **Retry** button — every retry attempts a fresh init.

## Step 2 — Last Oasis login

Implemented in [`lo.ts`](../apps/launcher/src/main/lo.ts) and orchestrated by [`useSteamAuth.ts`](../apps/launcher/src/renderer/hooks/useSteamAuth.ts).

- The renderer calls `api.lo.login(backend, { ticket, steamId, name })`.
- The main process encodes a `LoginWithSteam` protobuf with:
  - `uniqueNetId = "STEAM:" + steamId`
  - `steamName`
  - `steamSessionTicket` (the hex ticket)
  - `createNewSession = true`
- It POSTs to `{backend}/Api/Player/LoginWithSteam` with content-type `application/x-protobuf`.
- The response yields either a session token (success) or a ban payload (`message`, `bannedUntil`).

### Headers

Every authenticated LO request sends:

| Header | Value |
|---|---|
| `Content-Type` | `application/x-protobuf` |
| `Accept` | `application/x-protobuf` |
| `User-Agent` | `Mist/++UE4+Release-4.25-CL-0 Windows/10.0.26200.1.768.64bit` |
| `x-auth-token` | JSON: `{ "type": "...", "token": "...", "realmId": "...", "characterId": "..." }` |

## Step 3 — Multi-backend probing

DriftLauncher supports more than one Last Oasis backend simultaneously. By default the only configured backend is the official prod URL (`https://backend-production.last-oasis.com`); users can add community backends in **Settings → Backends**.

Login fans out to **every** configured backend in parallel:

- **Primary (prod) backend:** if it fails, the whole login fails. The user sees an error.
- **Secondary backends:** failures become non-fatal warnings; the launcher proceeds with whatever logins did succeed.

The first Steam ticket is used for the prod backend. Each secondary backend gets its own freshly-acquired ticket (Steamworks tickets are single-shot for some backends).

## Step 4 — Session persistence

Implemented in [`session.ts`](../apps/launcher/src/main/session.ts).

- Tokens are encrypted via Electron's [`safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage) and stored as base64 in `%APPDATA%\DriftLauncher\drift-session.json`.
- The store schema is `sessions: Record<backendUrl, { tokenEncrypted, playerName, motd }>`.
- On startup the launcher tries to decrypt and restore each session. If decryption fails (e.g. OS-level keychain unavailable, profile change), the entry is dropped and the user re-authenticates.
- Old single-session stores are auto-migrated into the multi-backend layout.

### Session expiry

- An LO HTTP `403` from any handler is treated as **session expired**: the session is cleared, the renderer is told `SESSION_EXPIRED`, and (if it's the primary backend) the user is redirected to `/login`.
- Calling `api.session.clear(backend?)` removes one or all stored sessions.

## Failure cases

| Symptom | Cause | Fix |
|---|---|---|
| "Could not initialise Steam" | Steam not running, or a previous DriftLauncher process is still holding the SDK. | Start Steam. Restart DriftLauncher. |
| "Banned" status with expiry date | Your Steam account is banned on that backend. | Wait out the ban or contact backend admins. |
| "Session expired" mid-session | LO backend invalidated the token (crash, restart, manual revoke). | The launcher auto-clears and bounces to login. |
| Secondary backend warning on login | A community backend is offline or rejected the ticket. | Other backends still work. Check **Settings → Backends**. |

## Security model

- Steam tickets and LO tokens never touch the renderer. They live in main-process memory and the encrypted store.
- The renderer only ever sees a boolean "logged in" flag, the player name, and MOTD.
- All HTTPS traffic uses standard TLS. There is no certificate pinning.
- The Drift mod-consensus service identifies clients via the same Steam ticket, sent in an `x-steam-ticket` header.
