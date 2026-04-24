import React, { useEffect, useState } from 'react'

// Custom titlebar for the frameless window. The strip itself is the OS drag
// region (-webkit-app-region: drag); the three control buttons opt out via
// no-drag so clicks reach them.
export default function TitleBar(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.api.window.isMaximized().then(setMaximized).catch(() => {})
    return window.api.window.onMaximizedChange(setMaximized)
  }, [])

  return (
    <div
      className="h-8 flex items-center justify-between bg-gray-950 border-b border-gray-800 select-none flex-shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="px-3 text-xs text-gray-500 font-medium tracking-wide">Drift Launcher</div>

      <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <TitleBarButton
          onClick={() => window.api.window.minimize()}
          ariaLabel="Minimize"
        >
          <svg viewBox="0 0 10 10" className="w-2.5 h-2.5"><rect x="1" y="4.5" width="8" height="1" fill="currentColor"/></svg>
        </TitleBarButton>
        <TitleBarButton
          onClick={() => window.api.window.toggleMaximize()}
          ariaLabel={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? (
            <svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="none" stroke="currentColor">
              <rect x="1.5" y="2.5" width="6" height="6"/>
              <path d="M3 2.5V1.5H8.5V7H7.5" strokeLinejoin="miter"/>
            </svg>
          ) : (
            <svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="none" stroke="currentColor">
              <rect x="1.5" y="1.5" width="7" height="7"/>
            </svg>
          )}
        </TitleBarButton>
        <TitleBarButton
          onClick={() => window.api.window.close()}
          ariaLabel="Close"
          danger
        >
          <svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="none" stroke="currentColor">
            <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5"/>
          </svg>
        </TitleBarButton>
      </div>
    </div>
  )
}

function TitleBarButton({
  onClick,
  ariaLabel,
  danger,
  children,
}: {
  onClick: () => void
  ariaLabel: string
  danger?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={`h-8 w-11 flex items-center justify-center text-gray-400 transition-colors ${
        danger ? 'hover:bg-red-600 hover:text-white' : 'hover:bg-gray-800 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
