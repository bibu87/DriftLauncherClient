import React, { useEffect } from 'react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import AppLayout from './layouts/AppLayout'
import TitleBar from './layouts/TitleBar'
import ServerBrowser from './pages/ServerBrowser'
import ModsManager from './pages/ModsManager'
import SettingsPage from './pages/SettingsPage'
import ChangelogPage from './pages/ChangelogPage'
import NewsPage from './pages/NewsPage'
import { useLauncherStore } from './store/launcher'
import { PROD_BACKEND_URL } from '@drift/shared'

function AppRoutes(): React.JSX.Element {
  const { hydrate, prefsLoaded, settings, refreshNews } = useLauncherStore()

  useEffect(() => {
    window.api.prefs.load().then(hydrate).catch(() => hydrate({
      favorites: [],
      recent: [],
      selectedServerId: null,
      readNewsIds: [],
      settings: {
        launchArgs: '',
        eacEnabled: true,
        theme: 'dark',
        launchOnStartup: false,
        defaultRealmTab: 'realms',
        backendUrls: [PROD_BACKEND_URL],
      },
    }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Steam news refresh: once on hydrate, then every 15 minutes while open.
  useEffect(() => {
    if (!prefsLoaded) return
    refreshNews()
    const id = setInterval(() => { refreshNews() }, 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [prefsLoaded, refreshNews])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  if (!prefsLoaded) return <></>

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AppLayout />}>
        <Route path="/servers" element={<ServerBrowser />} />
        <Route path="/mods" element={<ModsManager />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/changelog" element={<ChangelogPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default function App(): React.JSX.Element {
  return (
    <MemoryRouter initialEntries={['/login']}>
      <div className="flex flex-col h-screen overflow-hidden">
        <TitleBar />
        <div className="flex-1 min-h-0">
          <AppRoutes />
        </div>
      </div>
    </MemoryRouter>
  )
}
