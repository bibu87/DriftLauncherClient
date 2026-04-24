import React from 'react'

interface Release {
  version: string
  date: string
  entries: { type: 'added' | 'changed' | 'fixed'; text: string }[]
}

const RELEASES: Release[] = [
  {
    version: '0.1.0',
    date: '2026-04-19',
    entries: [
      { type: 'added', text: 'Server browser with Official, Vanilla, and Modded server classification' },
      { type: 'added', text: 'Favourites and recently played server tabs' },
      { type: 'added', text: 'Automatic mod downloading and activation before joining a modded server' },
      { type: 'added', text: 'Mod manager — enable/disable, update, and remove installed workshop mods' },
      { type: 'added', text: 'Game process monitoring and workshop ID discovery from game logs' },
      { type: 'added', text: 'Drift backend overlay: modded realm detection and mod reporting' },
      { type: 'added', text: 'Settings: launch arguments, EAC toggle, theme, language, game channel' },
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
