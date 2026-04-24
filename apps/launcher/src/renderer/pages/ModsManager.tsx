import React, { useEffect, useState, useCallback } from 'react'
import type { ModStatus } from '@drift/shared'

export default function ModsManager(): React.JSX.Element {
  const [mods, setMods] = useState<ModStatus[]>([])
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<Set<string>>(new Set())  // subscribe/unsubscribe in progress

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.mods.listAll()
      setMods(list)
      if (list.length > 0) {
        const urls = await window.api.workshop.getPreviewUrls(list.map(m => m.workshopId))
        setPreviews(urls)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggle = async (mod: ModStatus) => {
    await window.api.mods.toggle(mod.workshopId, !mod.active)
    setMods(prev => prev.map(m => m.workshopId === mod.workshopId ? { ...m, active: !m.active } : m))
  }

  const handleUnsubscribe = async (workshopId: string) => {
    setPending(prev => new Set(prev).add(workshopId))
    try {
      await window.api.mods.unsubscribe(workshopId)
      setMods(prev => prev.filter(m => m.workshopId !== workshopId))
    } finally {
      setPending(prev => { const s = new Set(prev); s.delete(workshopId); return s })
    }
  }

  const handleDelete = async (mod: ModStatus) => {
    const name = mod.name ?? `Workshop ${mod.workshopId}`
    if (!confirm(`Delete "${name}" from the Last Oasis game folder?\n\nThe mod will remain subscribed on Steam Workshop and can be re-downloaded.`)) return
    setPending(prev => new Set(prev).add(mod.workshopId))
    try {
      await window.api.mods.remove(mod.workshopId)
      setMods(prev => prev.map(m => m.workshopId === mod.workshopId ? { ...m, installed: false, active: false } : m))
    } finally {
      setPending(prev => { const s = new Set(prev); s.delete(mod.workshopId); return s })
    }
  }

  const handleSubscribe = async (workshopId: string) => {
    setPending(prev => new Set(prev).add(workshopId))
    try {
      await window.api.mods.subscribe(workshopId)
      await load()
    } finally {
      setPending(prev => { const s = new Set(prev); s.delete(workshopId); return s })
    }
  }

  const handleUpdate = async (workshopId: string) => {
    setUpdating(prev => new Set(prev).add(workshopId))
    try {
      const offProgress = window.api.mods.onProgress(_p => {})
      await window.api.mods.download([workshopId])
      offProgress()
      await load()
    } finally {
      setUpdating(prev => { const s = new Set(prev); s.delete(workshopId); return s })
    }
  }

  const handleDownload = async (workshopId: string) => {
    setUpdating(prev => new Set(prev).add(workshopId))
    try {
      await window.api.mods.download([workshopId])
      await load()
    } finally {
      setUpdating(prev => { const s = new Set(prev); s.delete(workshopId); return s })
    }
  }

  // Installed = files present in the LO game folder (STATE_INSTALLED flag)
  // Subscribed = subscribed on Steam Workshop but not yet installed locally
  const installed = mods.filter(m => m.installed)
  const subscribedOnly = mods.filter(m => !m.installed)
  const outdatedIds = installed.filter(m => !m.upToDate).map(m => m.workshopId)

  const handleUpdateAll = async () => {
    if (outdatedIds.length === 0) return
    for (const id of outdatedIds) setUpdating(prev => new Set(prev).add(id))
    try {
      await window.api.mods.download(outdatedIds)
      await load()
    } finally {
      setUpdating(new Set())
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div>
          <h1 className="text-lg font-semibold">Mods</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {installed.length} installed · {subscribedOnly.length} subscribed
          </p>
        </div>
        <div className="flex items-center gap-2">
          {outdatedIds.length > 0 && (
            <button
              onClick={handleUpdateAll}
              disabled={updating.size > 0}
              className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 rounded text-sm text-white transition-colors"
            >
              Update All ({outdatedIds.length})
            </button>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm text-gray-300 transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-6">
        {!loading && mods.length === 0 && (
          <div className="py-12 text-center text-gray-500 text-sm">
            No mods found. Mods are downloaded automatically when you join a modded server.
          </div>
        )}

        {/* Installed section */}
        {(installed.length > 0 || loading) && (
          <section>
            <SectionHeader label="Installed" count={installed.length} />
            <div className="flex flex-col gap-2 mt-2">
              {loading && installed.length === 0 && <SkeletonRow />}
              {installed.map(mod => (
                <ModRow
                  key={mod.workshopId}
                  mod={mod}
                  previewUrl={previews[mod.workshopId]}
                  isUpdating={updating.has(mod.workshopId)}
                  isPending={pending.has(mod.workshopId)}
                  onToggle={() => handleToggle(mod)}
                  onUpdate={() => handleUpdate(mod.workshopId)}
                  onDelete={() => handleDelete(mod)}
                  onSubscribeToggle={() =>
                    mod.subscribed
                      ? handleUnsubscribe(mod.workshopId)
                      : handleSubscribe(mod.workshopId)
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* Subscribed but not installed */}
        {subscribedOnly.length > 0 && (
          <section>
            <SectionHeader label="Subscribed — not installed" count={subscribedOnly.length} />
            <p className="text-xs text-gray-500 mt-1 mb-2">
              Subscribed on Steam Workshop but not yet downloaded to the game folder.
            </p>
            <div className="flex flex-col gap-2">
              {subscribedOnly.map(mod => (
                <ModRow
                  key={mod.workshopId}
                  mod={mod}
                  previewUrl={previews[mod.workshopId]}
                  isUpdating={updating.has(mod.workshopId)}
                  isPending={pending.has(mod.workshopId)}
                  onDownload={() => handleDownload(mod.workshopId)}
                  onSubscribeToggle={() => handleUnsubscribe(mod.workshopId)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count: number }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
      <span className="text-xs text-gray-600">({count})</span>
      <div className="flex-1 h-px bg-gray-800" />
    </div>
  )
}

function SkeletonRow(): React.JSX.Element {
  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-lg border bg-gray-900 border-gray-800 animate-pulse">
      <div className="w-14 h-14 rounded-md bg-gray-800 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-gray-800 rounded w-1/3" />
        <div className="h-2.5 bg-gray-800 rounded w-1/5" />
      </div>
    </div>
  )
}

interface ModRowProps {
  mod: ModStatus
  previewUrl: string | undefined
  isUpdating: boolean
  isPending: boolean
  onToggle?: () => void
  onUpdate?: () => void
  onDownload?: () => void
  onDelete?: () => void
  onSubscribeToggle: () => void
}

function ModRow({ mod, previewUrl, isUpdating, isPending, onToggle, onUpdate, onDownload, onDelete, onSubscribeToggle }: ModRowProps): React.JSX.Element {
  const sizeLabel = mod.sizeBytes ? formatBytes(mod.sizeBytes) : null

  return (
    <div className={`flex items-center gap-4 px-4 py-3 rounded-lg border bg-gray-900 border-gray-800 transition-opacity ${
      isPending ? 'opacity-50' : ''
    }`}>
      {/* Mod thumbnail */}
      <div className="w-14 h-14 rounded-md bg-gray-800 flex-shrink-0 overflow-hidden">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs font-mono">
            {mod.workshopId.slice(-4)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-white truncate">
            {mod.name ?? `Workshop ${mod.workshopId}`}
          </span>
          {mod.installed && !mod.upToDate && !isUpdating && (
            <span className="px-1.5 py-0.5 rounded text-xs bg-amber-900/60 text-amber-300">Update available</span>
          )}
          {isUpdating && (
            <span className="px-1.5 py-0.5 rounded text-xs bg-blue-900/60 text-blue-300">
              {mod.installed ? 'Updating…' : 'Downloading…'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
          <span>ID: {mod.workshopId}</span>
          {sizeLabel && <><span>·</span><span>{sizeLabel}</span></>}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Enable/disable toggle — only for installed mods */}
        {mod.installed && onToggle && (
          <button
            onClick={onToggle}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              mod.active ? 'bg-green-600' : 'bg-gray-700'
            }`}
            title={mod.active ? 'Disable mod' : 'Enable mod'}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              mod.active ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        )}

        {/* Update — installed mods with pending update */}
        {mod.installed && !mod.upToDate && onUpdate && (
          <button
            onClick={onUpdate}
            disabled={isUpdating}
            className="px-2 py-1 rounded text-xs bg-amber-800 hover:bg-amber-700 disabled:opacity-50 text-white transition-colors"
          >
            Update
          </button>
        )}

        {/* Download — subscribed-only mods */}
        {!mod.installed && onDownload && (
          <button
            onClick={onDownload}
            disabled={isUpdating}
            className="px-2 py-1 rounded text-xs bg-blue-800 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
          >
            Download
          </button>
        )}

        {/* Delete — remove from game folder only, keep Workshop subscription */}
        {mod.installed && onDelete && (
          <button
            onClick={onDelete}
            disabled={isPending || isUpdating}
            className="px-2 py-1 rounded text-xs bg-gray-800 hover:bg-red-900 hover:text-red-300 text-gray-400 transition-colors disabled:opacity-50"
            title="Delete mod folder from the Last Oasis game folder"
          >
            Delete
          </button>
        )}

        {/* Subscribe / Unsubscribe */}
        <button
          onClick={onSubscribeToggle}
          disabled={isPending}
          className={`px-2 py-1 rounded text-xs transition-colors disabled:opacity-50 ${
            mod.subscribed
              ? 'bg-gray-800 hover:bg-red-900 hover:text-red-300 text-gray-400'
              : 'bg-gray-800 hover:bg-green-900 hover:text-green-300 text-gray-400'
          }`}
          title={mod.subscribed ? 'Unsubscribe and remove' : 'Subscribe'}
        >
          {isPending ? '…' : mod.subscribed ? 'Unsubscribe' : 'Subscribe'}
        </button>
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
