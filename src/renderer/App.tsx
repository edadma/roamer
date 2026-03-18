import { useEffect, useState, useCallback } from 'react'
import { Breadcrumb, Typography } from 'asterui'
import { useTheme } from 'asterui'
import { ArrowLeftIcon, ArrowUpIcon, SunIcon, MoonIcon } from '@aster-ui/icons'
import { getFileIcon } from './icons'
import { initDb } from './db'
import type { FileEntry } from './types'

const { Text } = Typography

declare global {
  interface Window {
    roam: {
      platform: string
      readDirectory: (path: string) => Promise<FileEntry[]>
      getHome: () => Promise<string>
    }
  }
}

function ThemeSwitcher() {
  const { isDark, setTheme } = useTheme()
  return (
    <button
      className="btn btn-ghost btn-sm btn-square"
      onClick={() => setTheme?.(isDark ? 'light' : 'dark')}
    >
      {isDark ? <SunIcon size="sm" /> : <MoonIcon size="sm" />}
    </button>
  )
}

export default function App() {
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [showHidden, setShowHidden] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [dbReady, setDbReady] = useState(false)

  useEffect(() => {
    initDb().then(() => setDbReady(true))
    window.roam.getHome().then((home) => {
      setCurrentPath(home)
    })
  }, [])

  useEffect(() => {
    if (!currentPath) return
    window.roam.readDirectory(currentPath).then((items) => {
      const sorted = items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setEntries(sorted)
    })
  }, [currentPath])

  const visibleEntries = showHidden
    ? entries
    : entries.filter((e) => !e.name.startsWith('.'))

  const navigate = useCallback(
    (path: string) => {
      setHistory((prev) => [...prev, currentPath])
      setCurrentPath(path)
    },
    [currentPath],
  )

  const goBack = useCallback(() => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setCurrentPath(prev)
  }, [history])

  const goUp = useCallback(() => {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/'
    if (parent !== currentPath) navigate(parent)
  }, [currentPath, navigate])

  const pathSegments = currentPath.split('/').filter(Boolean)
  const breadcrumbItems = [
    { title: '/', onClick: () => navigate('/') },
    ...pathSegments.map((seg, i) => ({
      title: seg,
      onClick: () => navigate('/' + pathSegments.slice(0, i + 1).join('/')),
    })),
  ]

  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-base-300 shrink-0"
      >
        <button
          onClick={goBack}
          disabled={history.length === 0}
          className="btn btn-ghost btn-sm btn-square"
        >
          <ArrowLeftIcon size="sm" />
        </button>
        <button onClick={goUp} className="btn btn-ghost btn-sm btn-square">
          <ArrowUpIcon size="sm" />
        </button>
        <Breadcrumb items={breadcrumbItems} />
        <div className="ml-auto">
          <ThemeSwitcher />
        </div>
      </div>

      {/* File grid */}
      <div
        className="flex-1 overflow-auto p-3"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
          gap: '2px',
          alignContent: 'start',
        }}
      >
        {visibleEntries.map((entry) => {
          const Icon = getFileIcon(entry.extension, entry.isDirectory)
          return (
            <button
              key={entry.name}
              onDoubleClick={() => {
                if (entry.isDirectory) navigate(entry.path)
              }}
              className="btn btn-ghost"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '8px 4px',
                height: 'auto',
                minHeight: '72px',
                cursor: entry.isDirectory ? 'pointer' : 'default',
              }}
            >
              <Icon
                size="xl"
                className={entry.isDirectory ? 'text-warning' : 'text-base-content'}
              />
              <Text
                size="xs"
                style={{
                  textAlign: 'center',
                  wordBreak: 'break-all',
                  lineHeight: '1.2',
                  maxWidth: '100%',
                }}
              >
                {entry.name}
              </Text>
            </button>
          )
        })}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 py-1 border-t border-base-300 text-xs shrink-0">
        <Text size="xs" type="secondary">
          {visibleEntries.length} items
          {!showHidden && entries.length !== visibleEntries.length &&
            ` (${entries.length - visibleEntries.length} hidden)`}
        </Text>
        <label className="ml-auto flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          <Text size="xs" type="secondary">Show hidden</Text>
        </label>
      </div>
    </div>
  )
}
