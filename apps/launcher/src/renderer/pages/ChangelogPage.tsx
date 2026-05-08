import React from 'react'

interface Release {
  version: string
  date: string
  entries: { type: 'added' | 'changed' | 'fixed'; text: string }[]
}

const RELEASES: Release[] = [
  {
    version: '0.0.3',
    date: '2026-05-08',
    entries: [
      { type: 'added', text: 'Joining a realm now boots the game directly into that realm via -LoginRealmID instead of dropping you on the in-game realm picker' },
      { type: 'changed', text: 'A ban on a single backend now surfaces as a dismissible toast on the realm browser; the launcher only blocks at the ban screen when every configured backend rejects the login' },
      { type: 'changed', text: 'The full-ban screen now has a "Manage backends" shortcut that jumps straight to Settings → Backends so you can add a community backend without reinstalling' },
      { type: 'fixed', text: 'Workshop mods reported by Steam as needing an update are now re-downloaded before launch — previously a stale mod could slip through and cause desyncs or kicks on strict modded servers' },
      { type: 'fixed', text: 'Realm-mod cache and IPC are now keyed by (backend, realmId) so realms with the same numeric ID on different LO backends no longer share or overwrite each other\'s mod lists' },
    ],
  },
  {
    version: '0.0.2',
    date: '2026-04-28',
    entries: [
      { type: 'added', text: 'Realm map walker sidebar — every walker stationed on the realm shown with species icon, owner, and tile location' },
      { type: 'added', text: 'Walker filters: search by name/owner/species, filter by walker type, and a favourites-only toggle' },
      { type: 'added', text: 'Favourite walker star pulled from the in-game walker preferences — click to toggle, syncs back to the LO backend' },
      { type: 'added', text: 'Click a walker in the sidebar to scroll the map to its tile and highlight it with an amber ring' },
      { type: 'added', text: 'News section in the left sidebar — Last Oasis announcements pulled directly from Steam, refreshed on launch and every 15 minutes' },
      { type: 'added', text: 'Unread badge on the News nav entry; per-item checkboxes and "Mark all read" for bulk read tracking' },
      { type: 'added', text: '"Open on Steam" button on news items launches the original article in the default browser' },
      { type: 'fixed', text: 'Realm map species dropdown now renders with a dark backdrop in all themes (replaced the native popup that ignored CSS color overrides on Windows)' },
    ],
  },
  {
    version: '0.0.1',
    date: '2026-04-24',
    entries: [
      { type: 'added', text: 'Server browser with Official, Vanilla, and Modded server classification' },
      { type: 'added', text: 'Favourites and recently played server tabs' },
      { type: 'added', text: 'Automatic mod downloading and activation before joining a modded server' },
      { type: 'added', text: 'Mod manager — enable/disable, update, and remove installed workshop mods' },
      { type: 'added', text: 'Game process monitoring and workshop ID discovery from game logs' },
      { type: 'added', text: 'Drift backend overlay: modded realm detection and mod reporting' },
      { type: 'added', text: 'Settings: launch arguments, EAC toggle, theme' },
      { type: 'added', text: 'Steam authentication with session persistence' },
    ],
  },
]

const typeStyle: Record<Release['entries'][number]['type'], string> = {
  added: 'bg-green-900/50 text-green-300',
  changed: 'bg-blue-900/50 text-blue-300',
  fixed: 'bg-amber-900/50 text-amber-300',
}

export default function ChangelogPage(): React.JSX.Element {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-800">
        <h1 className="text-lg font-semibold">Changelog</h1>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-2xl flex flex-col gap-8">
          {RELEASES.map(release => (
            <div key={release.version}>
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-base font-bold text-white">v{release.version}</span>
                <span className="text-xs text-gray-500">{release.date}</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {release.entries.map((e, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <span className={`mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 capitalize ${typeStyle[e.type]}`}>
                      {e.type}
                    </span>
                    <span className="text-gray-300">{e.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
