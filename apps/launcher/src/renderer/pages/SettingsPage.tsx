import React, { useEffect, useState } from 'react'
import { useLauncherStore } from '../store/launcher'
import { useAuthStore } from '../store/auth'
import type { LauncherSettings } from '@drift/shared'
import { PROD_BACKEND_URL } from '@drift/shared'

export default function SettingsPage(): React.JSX.Element {
  const { settings, setSettings } = useLauncherStore()

  // Persist on every change
  useEffect(() => {
    window.api.prefs.save({ settings })
  }, [settings])

  const update = (patch: Partial<LauncherSettings>) => setSettings(patch)

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-800">
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="flex flex-col gap-6">

          {/* Launch */}
          <Section title="Launch">
            <Field label="Launch arguments" description="Extra command-line arguments passed to the game.">
              <input
                type="text"
                value={settings.launchArgs}
                onChange={e => update({ launchArgs: e.target.value })}
                placeholder="-noeac -dx11"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
              />
            </Field>

            <Field label="Easy Anti-Cheat" description="Disable EAC for offline / modded testing only.">
              <Toggle value={settings.eacEnabled} onChange={v => update({ eacEnabled: v })} label={settings.eacEnabled ? 'Enabled' : 'Disabled'} />
            </Field>

            <Field label="Launch on startup" description="Start Drift Launcher when Windows starts.">
              <Toggle value={settings.launchOnStartup} onChange={v => update({ launchOnStartup: v })} label={settings.launchOnStartup ? 'On' : 'Off'} />
            </Field>
          </Section>

          {/* Realms */}
          <Section title="Realms">
            <Field label="Default tab" description="Which tab opens when you navigate to Realms.">
              <select
                value={settings.defaultRealmTab}
                onChange={e => update({ defaultRealmTab: e.target.value as 'realms' | 'favorites' | 'recent' })}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500"
              >
                <option value="realms">All Realms</option>
                <option value="favorites">Favorites</option>
                <option value="recent">Recent</option>
              </select>
            </Field>
          </Section>

          {/* Backends */}
          <Section title="Backends">
            <BackendList />
          </Section>

          {/* Appearance */}
          <Section title="Appearance">
            <Field label="Theme" description="Interface colour scheme.">
              <div className="flex gap-2">
                {(['dark', 'light', 'bronze'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => update({ theme: t })}
                    className={`px-3 py-1.5 rounded text-sm border transition-colors capitalize ${
                      settings.theme === t
                        ? 'border-blue-500 bg-blue-950/40 text-white'
                        : 'border-gray-700 bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>

          </Section>

          {/* Cache */}
          <Section title="Cache">
            <Field label="Clear launcher cache" description="Clears HTTP cache, workshop preview images, and the realm-mods cache. Does not sign you out or change settings.">
              <ClearCacheButton />
            </Field>
          </Section>

        </div>
      </div>
    </div>
  )
}

function ClearCacheButton(): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const handleClear = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const result = await window.api.cache.clear()
      setStatus(`Cleared (${result.realmModsCleared} realm records, ${result.previewCleared} previews)`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to clear cache')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {status && <span className="text-xs text-gray-400">{status}</span>}
      <button
        onClick={handleClear}
        disabled={busy}
        className="px-4 py-2 bg-red-900/60 hover:bg-red-800 border border-red-800 rounded text-sm text-red-200 transition-colors disabled:opacity-40"
      >
        {busy ? 'Clearing…' : 'Clear cache'}
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h2>
      <div className="flex flex-col gap-4 bg-gray-900 rounded-lg border border-gray-800 px-4 py-4">
        {children}
      </div>
    </div>
  )
}

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white">{label}</div>
        {description && <div className="text-xs text-gray-500 mt-0.5">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

// Add/remove LO backend URLs. The prod URL is pinned and non-removable —
// adding a community URL triggers a login probe so a bad URL can't end up
// persisted in prefs.
function BackendList(): React.JSX.Element {
  const { settings, setSettings } = useLauncherStore()
  const { setSession, removeSession } = useAuthStore()
  const [newUrl, setNewUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const normalizeUrl = (raw: string): string | null => {
    const trimmed = raw.trim().replace(/\/+$/, '')
    if (!trimmed) return null
    try {
      const u = new URL(trimmed)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
      return `${u.protocol}//${u.host}`
    } catch {
      return null
    }
  }

  const handleAdd = async () => {
    setError(null)
    const url = normalizeUrl(newUrl)
    if (!url) { setError('Enter a valid http(s) URL.'); return }
    if (settings.backendUrls.includes(url)) { setError('Backend already configured.'); return }

    setBusy(true)
    try {
      const ticket = await window.api.steam.getTicket()
      const result = await window.api.lo.login(url, ticket)
      if (result.banned) {
        setError(`Banned on this backend: ${result.banMessage || 'no reason given'}`)
        return
      }
      setSession(url, {
        token: result.token,
        playerName: result.playerName,
        motd: result.motd,
        encryptionToken: '',
        platform: 'PC',
      })
      setSettings({ backendUrls: [...settings.backendUrls, url] })
      setNewUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach backend')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (url: string) => {
    if (url === PROD_BACKEND_URL) return
    setSettings({ backendUrls: settings.backendUrls.filter(u => u !== url) })
    removeSession(url)
    try { await window.api.session.clear(url) } catch { /* best-effort */ }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-500">
        Realm search queries every backend in parallel. The prod URL (identity source) is always present.
      </p>

      <div className="flex flex-col gap-1.5">
        {settings.backendUrls.map(url => {
          const isPrimary = url === PROD_BACKEND_URL
          return (
            <div key={url} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded px-3 py-2">
              <span className="text-sm text-gray-200 truncate flex-1" title={url}>{url}</span>
              {isPrimary
                ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-800/50">Primary</span>
                : (
                  <button
                    onClick={() => handleRemove(url)}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                )
              }
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="url"
          value={newUrl}
          onChange={e => setNewUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder="https://community-backend.example.com"
          disabled={busy}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 disabled:opacity-50"
        />
        <button
          onClick={handleAdd}
          disabled={busy || !newUrl.trim()}
          className="px-3 py-2 text-sm bg-blue-800 hover:bg-blue-700 border border-blue-700 rounded transition-colors disabled:opacity-40"
        >
          {busy ? 'Connecting…' : 'Add'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-gray-400 w-14 text-right">{label}</span>}
      <button
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors ${value ? 'bg-green-600' : 'bg-gray-700'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}
