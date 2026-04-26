# News

The **News** page surfaces *Last Oasis* announcements pulled directly from Steam's public news API. There's no separate community feed and no in-app posting.

## Where the data comes from

DriftLauncher calls Steam's public News API:

```
https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/
  ?appid=903950
  &count=20
  &maxlength=600
```

Up to 20 latest articles per fetch. The 600-character cap applies to the snippet body (the lead paragraph the API returns).

For each article DriftLauncher stores: `gid`, `title`, `url`, `author`, `date` (unix seconds), `feedlabel`, and a cleaned `snippet`. The snippet has HTML tags and BBCode stripped, common entities decoded (`&nbsp;`, `&amp;`, etc.), and whitespace collapsed.

## Refresh cadence

| When | What happens |
|---|---|
| Launcher start | One fetch as soon as user prefs load. |
| Every 15 minutes | Background refresh while the launcher is open. |
| Manual | **Refresh** button on the News page. |

The 15-minute interval (`15 * 60 * 1000` ms) is hardcoded. Errors are logged and swallowed — a transient failure won't crash the page, the next interval will retry.

## Read tracking

Article state is one of two: **read** or **unread**. The set of read article IDs is persisted in your preferences file (`%APPDATA%\DriftLauncher\config.json`, key `readNewsIds`).

UI:

- **Unread badge** in the sidebar on the News nav item, showing the unread count.
- **Per-item checkbox** to select articles.
- **Mark selected read** action.
- **Mark all read** action.
- Clicking an article opens its URL in your default browser via `shell.openExternal()` and marks it read.

The URL safety check rejects anything that isn't `http(s)://` — `file://` and `javascript:` URLs are dropped silently.

## Storage

Read state is just an array of article GIDs in your preferences file. There's no expiry; an article you've read stays read even after it falls off Steam's feed. If you reset preferences, every article will appear unread again.
