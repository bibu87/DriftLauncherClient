import React, { useMemo, useState } from 'react'
import { useLauncherStore } from '../store/launcher'
import type { NewsItem } from '@drift/shared'

export default function NewsPage(): React.JSX.Element {
  const { news, newsLoading, readNewsIds, refreshNews, markNewsRead, markAllNewsRead } = useLauncherStore()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const readSet = useMemo(() => new Set(readNewsIds), [readNewsIds])
  const unreadCount = news.reduce((n, item) => n + (readSet.has(item.gid) ? 0 : 1), 0)

  const toggleSelect = (gid: string): void => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(gid)) next.delete(gid); else next.add(gid)
      return next
    })
  }

  const markSelectedRead = (): void => {
    if (selected.size === 0) return
    markNewsRead(Array.from(selected))
    setSelected(new Set())
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
        <h1 className="text-lg font-semibold">News</h1>
        {unreadCount > 0 && (
          <span className="text-xs text-amber-400">{unreadCount} unread</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <button
              type="button"
              onClick={markSelectedRead}
              className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200"
            >
              Mark {selected.size} read
            </button>
          )}
          <button
            type="button"
            onClick={markAllNewsRead}
            disabled={unreadCount === 0}
            className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 disabled:opacity-40 disabled:hover:bg-gray-800 disabled:cursor-not-allowed"
          >
            Mark all read
          </button>
          <button
            type="button"
            onClick={() => refreshNews()}
            disabled={newsLoading}
            className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {newsLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="flex flex-col gap-3">
          {news.length === 0 && !newsLoading && (
            <div className="text-sm text-gray-500 py-8 text-center">No news available right now.</div>
          )}
          {news.length === 0 && newsLoading && (
            <div className="text-sm text-gray-500 py-8 text-center">Loading news…</div>
          )}
          {news.map(item => (
            <NewsRow
              key={item.gid}
              item={item}
              isRead={readSet.has(item.gid)}
              isSelected={selected.has(item.gid)}
              onToggleSelect={() => toggleSelect(item.gid)}
              onOpen={() => {
                window.api.shell.openExternal(item.url).catch(() => {})
                if (!readSet.has(item.gid)) markNewsRead([item.gid])
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function NewsRow({
  item,
  isRead,
  isSelected,
  onToggleSelect,
  onOpen,
}: {
  item: NewsItem
  isRead: boolean
  isSelected: boolean
  onToggleSelect: () => void
  onOpen: () => void
}): React.JSX.Element {
  return (
    <div
      className={`border rounded-lg px-4 py-3 transition-colors ${
        isRead
          ? 'border-gray-800 bg-gray-900/40'
          : 'border-amber-500/30 bg-amber-500/5'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          aria-label={`Select ${item.title}`}
          className="mt-1.5 flex-shrink-0 accent-amber-500"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {!isRead && <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />}
            <span className={`text-sm truncate ${isRead ? 'text-gray-300' : 'text-white font-semibold'}`}>
              {item.title || '(untitled)'}
            </span>
          </div>
          <div className="text-[11px] text-gray-500 mb-2 flex items-center gap-2">
            <span>{formatDate(item.date)}</span>
            {item.feedlabel && (
              <>
                <span>·</span>
                <span>{item.feedlabel}</span>
              </>
            )}
            {item.author && (
              <>
                <span>·</span>
                <span>{item.author}</span>
              </>
            )}
          </div>
          {item.snippet && (
            <p className="text-xs text-gray-400 line-clamp-3">{item.snippet}</p>
          )}
          <div className="mt-2">
            <button
              type="button"
              onClick={onOpen}
              className="text-xs text-amber-300 hover:text-amber-200"
            >
              Open on Steam ↗
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatDate(unix: number): string {
  if (!unix) return ''
  const d = new Date(unix * 1000)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
